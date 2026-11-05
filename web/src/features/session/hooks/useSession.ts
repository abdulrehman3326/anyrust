import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SessionEngine } from '../model/SessionEngine';
import type { SessionCallbacks, SessionState } from '../model/types';

export interface SessionApi {
  state: SessionState;
  share: (useSample: boolean) => Promise<void>;
  join: SessionEngine['join'];
  approveViewer: () => Promise<void>;
  rejectViewer: () => Promise<void>;
  endSession: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  setQuality: SessionEngine['setQuality'];
  dismissNotice: () => void;
}

/** Creates one SessionEngine for the lifetime of the component and binds it to React. */
export function useSession(callbacks: SessionCallbacks): SessionApi {
  // Callbacks change identity every render; the engine always calls the latest ones.
  const latest = useRef(callbacks);
  useEffect(() => {
    latest.current = callbacks;
  });

  const [engine] = useState(
    () =>
      new SessionEngine({
        onToast: (message) => latest.current.onToast(message),
        onChatMessage: (message) => latest.current.onChatMessage(message),
        onChatReset: () => latest.current.onChatReset(),
        onSessionRecorded: (record) => latest.current.onSessionRecorded(record),
      }),
  );

  useEffect(() => {
    engine.start();
    return () => engine.dispose();
  }, [engine]);

  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot);

  return {
    state,
    share: engine.share,
    join: engine.join,
    approveViewer: engine.approveViewer,
    rejectViewer: engine.rejectViewer,
    endSession: () => engine.endSession(),
    sendChat: engine.sendChat,
    setQuality: engine.setQuality,
    dismissNotice: engine.dismissNotice,
  };
}
