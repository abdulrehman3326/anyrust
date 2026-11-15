// @vitest-environment node
// Pure helpers: Node's Blob and Web Crypto match browsers (jsdom's Blob lacks arrayBuffer()).
import { formatBytes, newTransferId, sanitizeFileName, sha256Hex } from './lib';

describe('sha256Hex', () => {
  it('matches the known digest of "abc"', async () => {
    const bytes = new TextEncoder().encode('abc');
    expect(await sha256Hex(bytes.buffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes blobs too', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('sanitizeFileName', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['../../etc/passwd', '_.._etc_passwd'],
    ['C:\\Windows\\evil.exe', 'C__Windows_evil.exe'],
    ['.bashrc', 'bashrc'],
    ['a\u0000b\nc.txt', 'a_b_c.txt'],
    ['   ', 'file'],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('bounds long names but keeps the extension', () => {
    const result = sanitizeFileName(`${'x'.repeat(400)}.tar.gz`);
    expect(result).toHaveLength(255);
    expect(result.endsWith('.gz')).toBe(true);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1536, '1.5 KB'],
    [10 * 1024 * 1024, '10 MB'],
    [100 * 1024 * 1024, '100 MB'],
  ])('%d → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('newTransferId', () => {
  it('is unique and protocol-safe', () => {
    const a = newTransferId();
    expect(a).toMatch(/^[a-z0-9-]{1,64}$/i);
    expect(a).not.toBe(newTransferId());
  });
});
