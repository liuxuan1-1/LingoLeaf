import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  NativeService,
  parseNativeCapture,
  parseReplacementResult,
  type NativeCapture,
} from '../src/main/native';

const capture: NativeCapture = {
  id: 'a'.repeat(32),
  text: 'I has a question.',
  appName: 'notepad',
  processId: 12345,
  method: 'uia',
  canReplace: true,
  capturedAt: '2026-09-13T00:00:00.000Z',
  replacementHint: '',
};

describe('native process boundary guards', () => {
  it('preserves multilingual selected text and an opaque capture identifier', () => {
    expect(parseNativeCapture({ ...capture, text: '今天天气怎么样？ “Hello” 🚀' }).text).toBe(
      '今天天气怎么样？ “Hello” 🚀',
    );
  });

  it('rejects clipboard captures that claim replacement is safe', () => {
    expect(() =>
      parseNativeCapture({ ...capture, method: 'clipboard', canReplace: true }),
    ).toThrow();
    expect(
      parseNativeCapture({ ...capture, method: 'clipboard', canReplace: false }).canReplace,
    ).toBe(false);
  });

  it.each([
    null,
    {},
    { ...capture, id: 'not-a-native-id' },
    { ...capture, text: ' ' },
    { ...capture, text: 'a'.repeat(20001) },
    { ...capture, capturedAt: 'invalid' },
    { ...capture, canReplace: 'true' },
    { ...capture, method: 'unknown' },
    { ...capture, processId: undefined },
    { ...capture, processId: '12345' },
    { ...capture, processId: 0 },
    { ...capture, processId: -1 },
    { ...capture, processId: 1.5 },
    { ...capture, processId: Number.NaN },
    { ...capture, processId: 0x100000000 },
  ])('rejects malformed capture payload %#', (value) => {
    expect(() => parseNativeCapture(value)).toThrow();
  });

  it('retains the authoritative Windows source process id for the main process guard', () => {
    expect(parseNativeCapture({ ...capture, processId: 45678 }).processId).toBe(45678);
  });

  it('does not convert a transport acknowledgement into replacement success', () => {
    expect(() => parseReplacementResult({ ok: true })).toThrow();
    expect(() => parseReplacementResult({ ok: 'true', message: 'done' })).toThrow();
    expect(parseReplacementResult({ ok: false, message: '选区已变化' })).toEqual({
      ok: false,
      message: '选区已变化',
    });
  });

  it('refuses unreplaceable selection and invalid output before starting a process', async () => {
    const service = new NativeService('unused');
    expect(
      (
        await service.replace(
          { ...capture, canReplace: false, replacementHint: '请复制结果' },
          'Hello',
        )
      ).ok,
    ).toBe(false);
    expect((await service.replace(capture, '')).ok).toBe(false);
    expect((await service.replace(capture, 'Hello\0world')).ok).toBe(false);
    expect((await service.replace(capture, 'a'.repeat(20001))).ok).toBe(false);
    service.dispose();
    await expect(service.ready()).rejects.toThrow('已关闭');
  });

  it.runIf(process.platform === 'win32')(
    'starts the real hidden helper and rejects an unknown capture without any UI action',
    async () => {
      const service = new NativeService(resolve(process.cwd(), 'native'));
      try {
        await service.ready();
        const result = await service.replace(capture, '今天天气怎么样？\n"quoted" $(this-is-data)');
        expect(result).toEqual({ ok: false, message: '原选区已过期，请重新选中文字。' });
      } finally {
        service.dispose();
      }
    },
    25000,
  );
});
