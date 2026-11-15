import { canSend, CONTROL_PROTOCOL_VERSION, MAX_CONTROL_MESSAGE_BYTES, parseControlMessage } from './controlProtocol';

describe('parseControlMessage', () => {
  it('accepts well-formed messages from a permitted sender', () => {
    expect(parseControlMessage(JSON.stringify({ type: 'hello', version: CONTROL_PROTOCOL_VERSION }), 'viewer')).toEqual({ type: 'hello', version: 1 });
    expect(parseControlMessage(JSON.stringify({ type: 'privacy-pause', paused: true }), 'host')).toEqual({ type: 'privacy-pause', paused: true });
  });

  it('enforces the sender on the receiving side', () => {
    expect(parseControlMessage(JSON.stringify({ type: 'privacy-pause', paused: true }), 'viewer')).toBeNull();
    expect(parseControlMessage(JSON.stringify({ type: 'audio-state', system: true, mic: false }), 'viewer')).toBeNull();
  });

  it('accepts audio state from the presenter and rejects malformed audio state', () => {
    expect(parseControlMessage(JSON.stringify({ type: 'audio-state', system: true, mic: false }), 'host')).toEqual({ type: 'audio-state', system: true, mic: false });
    expect(parseControlMessage(JSON.stringify({ type: 'audio-state', system: true }), 'host')).toBeNull();
  });

  it.each([
    ['non-string frame', new ArrayBuffer(4)],
    ['invalid JSON', '{nope'],
    ['non-object', '42'],
    ['unknown type', JSON.stringify({ type: 'remote-input', x: 1 })],
    ['wrong field type', JSON.stringify({ type: 'privacy-pause', paused: 'yes' })],
    ['non-integer version', JSON.stringify({ type: 'hello', version: 1.5 })],
    ['oversized frame', JSON.stringify({ type: 'hello', version: 1, pad: 'x'.repeat(MAX_CONTROL_MESSAGE_BYTES) })],
  ])('drops a %s', (_label, raw) => {
    expect(parseControlMessage(raw, 'host')).toBeNull();
  });
});

describe('file transfer messages', () => {
  const sha256 = 'a'.repeat(64);
  const offer = { type: 'file-offer', id: 'f1b2-c3', name: 'report.pdf', size: 1024, mime: 'application/pdf', sha256 };

  it('accepts well-formed file messages from either side', () => {
    for (const from of ['host', 'viewer'] as const) {
      expect(parseControlMessage(JSON.stringify(offer), from)).toEqual(offer);
      expect(parseControlMessage(JSON.stringify({ type: 'file-accept', id: 'f1' }), from)).not.toBeNull();
      expect(parseControlMessage(JSON.stringify({ type: 'file-decline', id: 'f1', reason: 'busy' }), from)).not.toBeNull();
      expect(parseControlMessage(JSON.stringify({ type: 'file-cancel', id: 'f1' }), from)).not.toBeNull();
      expect(parseControlMessage(JSON.stringify({ type: 'file-complete', id: 'f1', ok: false }), from)).not.toBeNull();
    }
  });

  it('keeps oversized offers so the receiver can decline them explicitly', () => {
    expect(parseControlMessage(JSON.stringify({ ...offer, size: 5 * 1024 ** 3 }), 'viewer')).not.toBeNull();
  });

  it.each([
    ['empty file', { ...offer, size: 0 }],
    ['fractional size', { ...offer, size: 1.5 }],
    ['bad checksum', { ...offer, sha256: 'xyz' }],
    ['uppercase checksum', { ...offer, sha256: 'A'.repeat(64) }],
    ['unsafe id', { ...offer, id: '../../x' }],
    ['empty name', { ...offer, name: '' }],
  ])('rejects an offer with %s', (_label, message) => {
    expect(parseControlMessage(JSON.stringify(message), 'viewer')).toBeNull();
  });

  it('rejects an unknown decline reason', () => {
    expect(parseControlMessage(JSON.stringify({ type: 'file-decline', id: 'f1', reason: 'virus' }), 'host')).toBeNull();
  });
});

describe('pointer messages', () => {
  it('accepts viewer pointer messages with in-frame coordinates', () => {
    expect(parseControlMessage(JSON.stringify({ type: 'pointer-move', x: 0.5, y: 0 }), 'viewer')).toEqual({ type: 'pointer-move', x: 0.5, y: 0 });
    expect(parseControlMessage(JSON.stringify({ type: 'pointer-ping', x: 1, y: 1 }), 'viewer')).not.toBeNull();
    expect(parseControlMessage(JSON.stringify({ type: 'pointer-hide' }), 'viewer')).not.toBeNull();
  });

  it('rejects pointer messages from the presenter or outside the frame', () => {
    expect(parseControlMessage(JSON.stringify({ type: 'pointer-move', x: 0.5, y: 0.5 }), 'host')).toBeNull();
    expect(parseControlMessage(JSON.stringify({ type: 'pointer-move', x: 1.2, y: 0.5 }), 'viewer')).toBeNull();
    expect(parseControlMessage(JSON.stringify({ type: 'pointer-ping', x: -0.1, y: 0.5 }), 'viewer')).toBeNull();
    expect(parseControlMessage(JSON.stringify({ type: 'pointer-move', x: '0.5', y: 0.5 }), 'viewer')).toBeNull();
  });
});

describe('canSend', () => {
  it('mirrors the receiver rules', () => {
    expect(canSend('host', { type: 'privacy-pause', paused: false })).toBe(true);
    expect(canSend('viewer', { type: 'privacy-pause', paused: false })).toBe(false);
    expect(canSend('viewer', { type: 'hello', version: 1 })).toBe(true);
  });
});
