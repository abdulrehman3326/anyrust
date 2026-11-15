import { captureFrame, screenshotFileName } from './stageTools';

describe('screenshotFileName', () => {
  it('includes the session and a sortable local timestamp', () => {
    expect(screenshotFileName('123456789', new Date(2026, 10, 5, 9, 3, 7))).toBe('deskstream-123456789-2026-11-05-09-03-07.png');
  });

  it('falls back when no session id is known', () => {
    expect(screenshotFileName(null, new Date(2026, 0, 1, 0, 0, 0))).toBe('deskstream-session-2026-01-01-00-00-00.png');
  });
});

describe('captureFrame', () => {
  it('rejects before the video has a frame', async () => {
    await expect(captureFrame(document.createElement('video'))).rejects.toThrow('no video frame');
  });
});
