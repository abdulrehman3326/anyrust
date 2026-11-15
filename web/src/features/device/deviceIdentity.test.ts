import { DEVICE_SECRET_KEY, getDeviceSecret, parseDeviceId } from './deviceIdentity';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}

describe('getDeviceSecret', () => {
  it('creates a 256-bit base64url secret once and then reuses it', () => {
    const storage = memoryStorage();
    const first = getDeviceSecret(storage);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storage.data.get(DEVICE_SECRET_KEY)).toBe(first);
    expect(getDeviceSecret(storage)).toBe(first);
  });

  it('replaces a corrupted stored value', () => {
    const storage = memoryStorage({ [DEVICE_SECRET_KEY]: 'not-a-secret' });
    expect(getDeviceSecret(storage)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('falls back to a stable per-tab secret when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    const a = getDeviceSecret(broken);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(getDeviceSecret(broken)).toBe(a);
  });
});

describe('parseDeviceId', () => {
  it.each([
    ['123456789', '123456789'],
    ['123 456 789', '123456789'],
    ['123-456-789', '123456789'],
    [' 987 654 321 ', '987654321'],
  ])('%j → %s', (input, expected) => {
    expect(parseDeviceId(input)).toBe(expected);
  });

  it.each(['12345678', '1234567890', '023456789', 'http://x/#join=123456789:abc', 'abcdefghi'])('rejects %j', (input) => {
    expect(parseDeviceId(input)).toBeNull();
  });
});
