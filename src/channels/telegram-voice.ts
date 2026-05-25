/**
 * Telegram voice transcription — local-only via whisper.cpp.
 *
 * Voice notes and uploaded audio arrive from the Telegram adapter as
 * attachments with `type: 'audio'`, the raw OGG/Opus (or other codec) bytes
 * already downloaded into `attachment.data` (base64) by the chat-sdk bridge.
 *
 * This module converts that buffer to a temp file, runs whisper.cpp through
 * `nodejs-whisper`, replaces the inbound message's text with the transcript,
 * and strips the audio attachment so the agent never sees the raw audio.
 *
 * Concurrency: nodejs-whisper shells out via `shelljs.cd()` which mutates the
 * Node process cwd. We serialize all calls behind a single promise chain so
 * the host's cwd is only flipped in one place at a time. nodejs-whisper's own
 * `finally { shelljs.cd(projectDir) }` restores it.
 */
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

import { nodewhisper } from 'nodejs-whisper';

import { DATA_DIR } from '../config.js';
import { log } from '../log.js';

const MODEL = process.env.TELEGRAM_VOICE_MODEL?.trim() || 'medium';
const LANGUAGE = process.env.TELEGRAM_VOICE_LANGUAGE?.trim() || 'auto';
const MODEL_ROOT = path.join(DATA_DIR, 'whisper-models');
const TMP_DIR = path.join(DATA_DIR, 'whisper-tmp');

// launchd starts services with a minimal PATH (no /opt/homebrew/bin), so
// whisper.cpp's cmake/ffmpeg shellouts fail with "command not found" even
// when both are installed via brew. Inject the brew bin paths once at module
// load — covers both Apple Silicon and Intel Mac brew layouts.
for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) {
  if (!process.env.PATH?.split(':').includes(dir)) {
    process.env.PATH = `${dir}:${process.env.PATH ?? ''}`;
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Serialize transcription calls so the cwd mutation in shelljs never races. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

let whisperBuildPromise: Promise<void> | null = null;

/**
 * Ensure the whisper.cpp `whisper-cli` binary exists. nodejs-whisper@0.3.0
 * has a bug where `constructCommand` throws if the executable is missing
 * BEFORE `executeCppCommand`'s build branch can run — so once cmake fails
 * (e.g. missing from PATH on first try) and the model has already been
 * downloaded, the library can never recover on its own (autoDownloadModel
 * returns early when the .bin exists). We build it ourselves here.
 */
function ensureWhisperBuilt(): Promise<void> {
  if (whisperBuildPromise) return whisperBuildPromise;
  whisperBuildPromise = (async () => {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('nodejs-whisper/package.json');
    const cppDir = path.join(path.dirname(pkgPath), 'cpp', 'whisper.cpp');
    const exe = path.join(cppDir, 'build', 'bin', 'whisper-cli');
    if (fs.existsSync(exe)) return;
    log.info('whisper: building whisper.cpp (one-time, takes a few minutes)', { cppDir });
    try {
      execFileSync('cmake', ['-B', 'build'], { cwd: cppDir, stdio: 'pipe' });
      execFileSync('cmake', ['--build', 'build', '--config', 'Release'], {
        cwd: cppDir,
        stdio: 'pipe',
      });
    } catch (err) {
      whisperBuildPromise = null; // allow retry on next call
      const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
      throw new Error(`whisper.cpp build failed: ${stderr || (err as Error).message}`);
    }
    if (!fs.existsSync(exe)) {
      whisperBuildPromise = null;
      throw new Error(`whisper.cpp build completed but ${exe} was not produced`);
    }
    log.info('whisper: whisper.cpp built', { exe });
  })();
  return whisperBuildPromise;
}

/** Extension hint for ffmpeg, derived from the Telegram-reported mime type. */
function extForMime(mime: string | undefined): string {
  if (!mime) return 'ogg';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('m4a') || mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('flac')) return 'flac';
  return 'ogg';
}

/**
 * whisper-cli prints lines like `[00:00.000 --> 00:05.500]  text here`
 * to stdout, plus a lot of startup info. Extract only the segment text and
 * join, trimming whitespace.
 */
function extractTranscript(stdout: string): string {
  const segmentRe = /^\s*\[[\d:.]+\s+-->\s+[\d:.]+\]\s+(.*\S)\s*$/;
  const lines: string[] = [];
  for (const raw of stdout.split('\n')) {
    const m = raw.match(segmentRe);
    if (m) lines.push(m[1]);
  }
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/** Transcribe an in-memory audio buffer to a UTF-8 transcript. */
export async function transcribeAudioBuffer(buffer: Buffer, mimeType: string | undefined): Promise<string> {
  fs.mkdirSync(MODEL_ROOT, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const ext = extForMime(mimeType);
  const inputPath = path.join(TMP_DIR, `${randomUUID()}.${ext}`);
  // The .wav converted by nodejs-whisper sits next to the input.
  const wavPath = path.join(TMP_DIR, path.basename(inputPath, `.${ext}`) + '.wav');

  fs.writeFileSync(inputPath, buffer);

  await ensureWhisperBuilt();

  try {
    const stdout = await withLock(() =>
      nodewhisper(inputPath, {
        modelName: MODEL,
        modelRootPath: MODEL_ROOT,
        autoDownloadModelName: MODEL,
        removeWavFileAfterTranscription: true,
        logger: {
          debug: () => {},
          log: (...args: unknown[]) => log.debug('whisper', { args }),
          error: (...args: unknown[]) => log.warn('whisper', { args }),
        },
        whisperOptions: {
          language: LANGUAGE,
        },
      }),
    );
    return extractTranscript(stdout);
  } finally {
    for (const p of [inputPath, wavPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (err) {
        log.warn('whisper temp cleanup failed', { path: p, err });
      }
    }
  }
}

interface Attachment {
  type?: string;
  mimeType?: string;
  data?: string;
}

interface ChatSdkContent {
  text?: string;
  attachments?: Attachment[];
}

/**
 * If the message carries a voice/audio attachment, transcribe it, replace
 * `text` with the transcript, and drop the audio attachment from the
 * serialized content. Mutates `content` in place; returns true if a
 * transcription happened.
 */
export async function maybeTranscribeVoice(content: ChatSdkContent): Promise<boolean> {
  const attachments = content.attachments;
  if (!Array.isArray(attachments) || attachments.length === 0) return false;
  const idx = attachments.findIndex((a) => a?.type === 'audio' && typeof a.data === 'string');
  if (idx < 0) return false;
  const att = attachments[idx]!;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(att.data!, 'base64');
  } catch (err) {
    log.warn('Telegram voice: base64 decode failed', { err });
    return false;
  }
  if (buffer.length === 0) return false;
  try {
    const transcript = await transcribeAudioBuffer(buffer, att.mimeType);
    const existing = (content.text ?? '').trim();
    content.text = existing ? `${existing}\n\n${transcript}` : transcript;
    attachments.splice(idx, 1);
    log.info('Telegram voice transcribed', {
      bytes: buffer.length,
      chars: transcript.length,
      mimeType: att.mimeType,
    });
    return true;
  } catch (err) {
    log.error('Telegram voice transcription failed', { err, mimeType: att.mimeType, bytes: buffer.length });
    // Fall through — leave the attachment in place so the agent can still see
    // it as base64 audio. Prepending a marker hints to the agent that the
    // transcript failed.
    const marker = '[Voice message: transcription failed]';
    const existing = (content.text ?? '').trim();
    content.text = existing ? `${existing}\n\n${marker}` : marker;
    return false;
  }
}
