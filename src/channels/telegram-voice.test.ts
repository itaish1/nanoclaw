import { describe, it, expect, vi, beforeEach } from 'vitest';

const nodewhisperMock = vi.fn();
vi.mock('nodejs-whisper', () => ({
  nodewhisper: (...args: unknown[]) => nodewhisperMock(...args),
}));

// Imported after the mock so the module under test picks it up.
const { maybeTranscribeVoice } = await import('./telegram-voice.js');

beforeEach(() => {
  nodewhisperMock.mockReset();
});

describe('maybeTranscribeVoice', () => {
  it('returns false when there are no attachments', async () => {
    const content: { text?: string } = { text: 'hello' };
    const result = await maybeTranscribeVoice(content);
    expect(result).toBe(false);
    expect(content.text).toBe('hello');
    expect(nodewhisperMock).not.toHaveBeenCalled();
  });

  it('returns false when no audio attachment is present', async () => {
    const content = {
      text: 'see pic',
      attachments: [{ type: 'image', mimeType: 'image/png', data: Buffer.from('x').toString('base64') }],
    };
    const result = await maybeTranscribeVoice(content);
    expect(result).toBe(false);
    expect(content.attachments).toHaveLength(1);
  });

  it('parses whisper-cli stdout segments and replaces text', async () => {
    nodewhisperMock.mockResolvedValueOnce(
      [
        'whisper_init_from_file_with_params_no_state: loading model...',
        '',
        '[00:00.000 --> 00:02.500]   שלום',
        '[00:02.500 --> 00:05.000]  עולם',
        '',
        'whisper_print_timings: total time = ...',
      ].join('\n'),
    );
    const content: { text?: string; attachments: { type: string; mimeType: string; data: string }[] } = {
      text: '',
      attachments: [{ type: 'audio', mimeType: 'audio/ogg', data: Buffer.from('fake-ogg-bytes').toString('base64') }],
    };
    const result = await maybeTranscribeVoice(content);
    expect(result).toBe(true);
    expect(content.text).toBe('שלום עולם');
    expect(content.attachments).toHaveLength(0);
    expect(nodewhisperMock).toHaveBeenCalledTimes(1);
  });

  it('appends transcript to existing caption text', async () => {
    nodewhisperMock.mockResolvedValueOnce('[00:00.000 --> 00:01.000]  hi there');
    const content: { text: string; attachments: { type: string; mimeType: string; data: string }[] } = {
      text: 'caption above',
      attachments: [{ type: 'audio', mimeType: 'audio/ogg', data: Buffer.from('a').toString('base64') }],
    };
    await maybeTranscribeVoice(content);
    expect(content.text).toBe('caption above\n\nhi there');
  });

  it('marks the message and keeps the attachment on whisper failure', async () => {
    nodewhisperMock.mockRejectedValueOnce(new Error('boom'));
    const content: { text?: string; attachments: { type: string; mimeType: string; data: string }[] } = {
      text: '',
      attachments: [{ type: 'audio', mimeType: 'audio/ogg', data: Buffer.from('a').toString('base64') }],
    };
    const result = await maybeTranscribeVoice(content);
    expect(result).toBe(false);
    expect(content.text).toBe('[Voice message: transcription failed]');
    expect(content.attachments).toHaveLength(1);
  });

  it('serializes concurrent calls (whisper.cpp cwd is not reentrant)', async () => {
    let resolveFirst: (v: string) => void = () => {};
    const first = new Promise<string>((r) => {
      resolveFirst = r;
    });
    nodewhisperMock.mockImplementationOnce(() => first);
    nodewhisperMock.mockResolvedValueOnce('[00:00.000 --> 00:01.000]  second');

    const a = maybeTranscribeVoice({
      text: '',
      attachments: [{ type: 'audio', mimeType: 'audio/ogg', data: Buffer.from('a').toString('base64') }],
    });
    const b = maybeTranscribeVoice({
      text: '',
      attachments: [{ type: 'audio', mimeType: 'audio/ogg', data: Buffer.from('b').toString('base64') }],
    });

    // Give microtasks a chance — the second call must still be queued.
    await new Promise((r) => setImmediate(r));
    expect(nodewhisperMock).toHaveBeenCalledTimes(1);

    resolveFirst('[00:00.000 --> 00:01.000]  first');
    await Promise.all([a, b]);
    expect(nodewhisperMock).toHaveBeenCalledTimes(2);
  });
});
