import { useCallback, useEffect, useState } from 'react';

/** Document Picture-in-Picture (Chromium 116+). Not in TypeScript's DOM lib yet. */
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
}

const api = (): DocumentPictureInPicture | undefined =>
  typeof window === 'undefined' ? undefined : (window as Window & { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;

export const popOutSupported = (): boolean => Boolean(api());

/**
 * An always-on-top mini window (Document Picture-in-Picture) that the presenter keeps over the app
 * they are sharing, so the viewer's pointer stays visible. Render into `popOut.document.body`
 * with a React portal. React event handlers don't reach a portal in another document, so content
 * there must not rely on them.
 */
export function usePopOut() {
  const [popOut, setPopOut] = useState<Window | null>(null);

  const close = useCallback(() => {
    setPopOut((current) => {
      current?.close();
      return null;
    });
  }, []);

  const open = useCallback(async (): Promise<boolean> => {
    const pip = api();
    if (!pip) return false;
    const win = await pip.requestWindow({ width: 480, height: 300 });
    // Same-origin document: reuse the app stylesheet (allowed by the CSP) and the current theme.
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) win.document.head.append(node.cloneNode(true));
    win.document.documentElement.className = document.documentElement.className;
    win.document.title = 'Deskstream · Viewer pointer';
    win.document.body.className = 'm-0 bg-stage text-stage-foreground';
    win.addEventListener('pagehide', () => setPopOut((current) => (current === win ? null : current)), { once: true });
    setPopOut(win);
    return true;
  }, []);

  // Never leave the window behind when the component goes away.
  useEffect(() => () => popOut?.close(), [popOut]);

  return { popOut, open, close };
}
