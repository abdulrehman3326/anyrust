// @vitest-environment node
// Node provides real File/Blob.arrayBuffer, Web Crypto and URL.createObjectURL (jsdom's Blob lacks arrayBuffer()).
import type { Role } from '@/shared/api';
import type { FileTransfer } from '@/features/files';
import { FileTransferController } from './FileTransferController';
import type { TransferHost } from './FileTransferController';
import { parseControlMessage } from '../lib/controlProtocol';
import type { ControlMessage } from '../lib/controlProtocol';

type FileMessage = Parameters<FileTransferController['onControl']>[0];

/** An in-memory, always-open data channel pair. `tamper` can corrupt bytes in transit. */
function channelPair(tamper?: (chunk: ArrayBuffer) => ArrayBuffer) {
  const make = () =>
    ({
      readyState: 'open',
      bufferedAmount: 0,
      binaryType: 'arraybuffer',
      bufferedAmountLowThreshold: 0,
      onmessage: null as ((event: { data: unknown }) => void) | null,
      onclose: null as (() => void) | null,
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  const a = make();
  const b = make();
  a.send.mockImplementation((data: ArrayBuffer) => queueMicrotask(() => b.onmessage?.({ data: tamper ? tamper(data) : data })));
  b.send.mockImplementation((data: ArrayBuffer) => queueMicrotask(() => a.onmessage?.({ data: tamper ? tamper(data) : data })));
  return [a, b] as unknown as [RTCDataChannel, RTCDataChannel];
}

function side(role: Role, options: { viewerMaySendFiles?: boolean } = {}) {
  const state = { transfers: [] as FileTransfer[], toasts: [] as string[], peer: null as FileTransferController | null, mayReceive: options.viewerMaySendFiles ?? false };
  const host: TransferHost = {
    role: () => role,
    viewerMaySendFiles: () => state.mayReceive,
    // Control messages go through the real parser, as the engine does, including sender checks.
    sendControl: (message: ControlMessage) => {
      const parsed = parseControlMessage(JSON.stringify(message), role);
      if (parsed && parsed.type.startsWith('file-')) queueMicrotask(() => state.peer?.onControl(parsed as FileMessage));
      return true;
    },
    publish: (transfers) => {
      state.transfers = transfers;
    },
    toast: (message) => {
      state.toasts.push(message);
    },
  };
  const controller = new FileTransferController(host);
  return { controller, state };
}

function connect(options: { viewerMaySendFiles?: boolean; tamper?: (chunk: ArrayBuffer) => ArrayBuffer } = {}) {
  const presenter = side('host', options);
  const viewer = side('viewer', options);
  presenter.state.peer = viewer.controller;
  viewer.state.peer = presenter.controller;
  const [hostChannel, viewerChannel] = channelPair(options.tamper);
  presenter.controller.attach(hostChannel);
  viewer.controller.attach(viewerChannel);
  return { presenter, viewer };
}

const settle = async (check: () => boolean) => {
  for (let i = 0; i < 500 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(check()).toBe(true);
};

/** ~50 KiB of varied bytes, so it spans several chunks. */
const sampleFile = () => new File([new Uint8Array(50_000).map((_, i) => (i * 31) % 251)], 'notes.txt', { type: 'text/plain' });

describe('FileTransferController', () => {
  it('delivers a file viewer → presenter after acceptance and verifies it', async () => {
    const { presenter, viewer } = connect({ viewerMaySendFiles: true });
    const file = sampleFile();
    await viewer.controller.send(file);
    await settle(() => presenter.state.transfers[0]?.status === 'offered');
    expect(viewer.state.transfers[0]).toMatchObject({ direction: 'outgoing', status: 'awaiting', name: 'notes.txt', size: 50_000 });
    expect(presenter.state.toasts[0]).toContain('The viewer wants to send you “notes.txt”');

    const id = presenter.state.transfers[0]!.id;
    presenter.controller.accept(id);
    await settle(() => presenter.state.transfers[0]?.status === 'done' && viewer.state.transfers[0]?.status === 'done');

    const received = presenter.state.transfers[0]!;
    expect(received.bytes).toBe(50_000);
    expect(received.url).toMatch(/^blob:/);
    expect(viewer.state.transfers[0]!.detail).toBe('Delivered and verified.');
  });

  it('presenter refuses files when the viewer lacks permission', async () => {
    const { presenter, viewer } = connect({ viewerMaySendFiles: false });
    // A modified viewer that ignores its own permission check:
    viewer.state.mayReceive = true;
    await viewer.controller.send(sampleFile());
    await settle(() => viewer.state.transfers[0]?.status === 'declined');
    expect(viewer.state.transfers[0]!.detail).toBe('The presenter hasn’t allowed file transfer.');
    expect(presenter.state.transfers[0]).toMatchObject({ status: 'declined' });
  });

  it('a well-behaved viewer without permission does not offer at all', async () => {
    const { presenter, viewer } = connect({ viewerMaySendFiles: false });
    await viewer.controller.send(sampleFile());
    expect(viewer.state.transfers).toHaveLength(0);
    expect(viewer.state.toasts[0]).toBe('The presenter hasn’t allowed file transfer.');
    expect(presenter.state.transfers).toHaveLength(0);
  });

  it('presenter → viewer is always offerable; the viewer can decline', async () => {
    const { presenter, viewer } = connect();
    await presenter.controller.send(sampleFile());
    await settle(() => viewer.state.transfers[0]?.status === 'offered');
    viewer.controller.decline(viewer.state.transfers[0]!.id);
    await settle(() => presenter.state.transfers[0]?.status === 'declined');
    expect(presenter.state.transfers[0]!.detail).toBe('The other side declined this file.');
  });

  it('discards a file whose bytes were altered in transit', async () => {
    const { presenter, viewer } = connect({
      tamper: (chunk) => {
        const copy = new Uint8Array(chunk.slice(0));
        copy[0] = (copy[0]! + 1) % 256;
        return copy.buffer;
      },
    });
    await presenter.controller.send(sampleFile());
    await settle(() => viewer.state.transfers[0]?.status === 'offered');
    viewer.controller.accept(viewer.state.transfers[0]!.id);
    await settle(() => viewer.state.transfers[0]?.status === 'failed' && presenter.state.transfers[0]?.status === 'failed');
    expect(viewer.state.transfers[0]!.url).toBeUndefined();
    expect(presenter.state.transfers[0]!.detail).toContain('checksum mismatch');
  });

  it('either side can cancel', async () => {
    const { presenter, viewer } = connect();
    await presenter.controller.send(sampleFile());
    await settle(() => viewer.state.transfers[0]?.status === 'offered');
    presenter.controller.cancel(presenter.state.transfers[0]!.id);
    await settle(() => viewer.state.transfers[0]?.status === 'cancelled');
    expect(viewer.state.transfers[0]!.detail).toBe('The other side cancelled this transfer.');
  });

  it('declines oversized offers and stays busy-safe', async () => {
    const { presenter } = connect({ viewerMaySendFiles: true });
    const sha256 = 'a'.repeat(64);
    presenter.controller.onControl({ type: 'file-offer', id: 'big', name: 'huge.iso', size: 200 * 1024 * 1024, mime: '', sha256 });
    expect(presenter.state.transfers[0]).toMatchObject({ id: 'big', status: 'declined' });

    presenter.controller.onControl({ type: 'file-offer', id: 'one', name: 'a.txt', size: 10, mime: '', sha256 });
    presenter.controller.onControl({ type: 'file-offer', id: 'two', name: 'b.txt', size: 10, mime: '', sha256 });
    expect(presenter.state.transfers.map((t) => [t.id, t.status])).toEqual([
      ['one', 'offered'],
      ['big', 'declined'],
    ]);
  });

  it('rejects empty and too-large files before offering', async () => {
    const { viewer, presenter } = connect();
    await presenter.controller.send(new File([], 'empty.txt'));
    expect(presenter.state.toasts[0]).toBe('Empty files can’t be sent.');
    const huge = new File(['x'], 'huge.bin');
    Object.defineProperty(huge, 'size', { value: 101 * 1024 * 1024 });
    await presenter.controller.send(huge);
    expect(presenter.state.toasts[1]).toContain('The limit is 100 MB');
    expect(viewer.state.transfers).toHaveLength(0);
  });

  it('fails active transfers when the connection drops, and reset frees everything', async () => {
    const { presenter, viewer } = connect();
    await presenter.controller.send(sampleFile());
    await settle(() => viewer.state.transfers[0]?.status === 'offered');
    viewer.controller.detach();
    expect(viewer.state.transfers[0]!.status).toBe('failed');
    viewer.controller.reset();
    expect(viewer.state.transfers).toHaveLength(0);
  });
});
