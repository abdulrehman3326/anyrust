/** Helpers for the video stage toolbar: screenshots and picture-in-picture. */

const pad = (value: number) => String(value).padStart(2, '0');

/** `deskstream-123456789-2026-11-15-14-05-09.png`, in local time so it matches the user's clock. */
export function screenshotFileName(roomId: string | null, date: Date): string {
  const stamp = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()), pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-');
  return `deskstream-${roomId ?? 'session'}-${stamp}.png`;
}

/** Draws the current frame at the stream's native resolution and encodes it as PNG. */
export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { videoWidth: width, videoHeight: height } = video;
    if (!width || !height) {
      reject(new Error('There’s no video frame to capture yet.'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('This browser can’t capture screenshots.'));
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Couldn’t encode the screenshot.'))), 'image/png');
  });
}

/** Saves a blob through a temporary object URL (allowed by the CSP; no data: URL needed). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pictureInPictureSupported = (): boolean =>
  typeof document !== 'undefined' && document.pictureInPictureEnabled === true;
