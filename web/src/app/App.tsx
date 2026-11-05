import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { ApprovalDialog } from '@/features/approval';
import { InviteDialog } from '@/features/present';
import { useChatLog } from '@/features/chat';
import { useHistory } from '@/features/history';
import { useSession } from '@/features/session';
import { ThemeToggle } from '@/features/theme';
import { Sidebar, Topbar } from '@/shared/layout';
import type { NavEntry } from '@/shared/layout';
import { Notice, useToast } from '@/shared/ui';
import { hrefFor, useRoute, viewTitles } from './router';
import type { View } from './router';
import { HelpView } from './views/HelpView';
import { HistoryView } from './views/HistoryView';
import { HomeView } from './views/HomeView';
import { JoinView } from './views/JoinView';
import { SessionView } from './views/SessionView';
import { ShareView } from './views/ShareView';
import type { ViewProps } from './views/shared';

const screens: Record<View, ComponentType<ViewProps>> = {
  home: HomeView,
  share: ShareView,
  join: JoinView,
  session: SessionView,
  history: HistoryView,
  help: HelpView,
};

export function App() {
  const toast = useToast();
  const history = useHistory();
  const [view, navigate] = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  // Chat state lives here so the session engine can feed it without depending on the chat feature.
  const chat = useChatLog();
  const { receive: receiveChat, reset: resetChat } = chat;
  const { add: addHistory } = history;

  const session = useSession({
    onToast: toast,
    onChatMessage: receiveChat,
    onChatReset: resetChat,
    onSessionRecorded: addHistory,
  });
  const { state } = session;

  // Jump to the live view whenever a session starts (sharing begins or a join is accepted).
  // For invite links this also replaces `#join=…` in the address bar, so the token isn't left behind.
  const wasActive = useRef(state.active);
  useEffect(() => {
    if (state.active && !wasActive.current) navigate('session');
    wasActive.current = state.active;
  }, [state.active, navigate]);

  // Offer the invite link once per hosted session, as soon as it is live and ready to send.
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteShown = useRef(false);
  const hosting = state.active && state.role === 'host' && Boolean(state.inviteLink);
  useEffect(() => {
    if (!state.active) inviteShown.current = false;
    if (hosting && !inviteShown.current) {
      inviteShown.current = true;
      setInviteOpen(true);
    }
    if (!hosting) setInviteOpen(false);
  }, [state.active, hosting]);

  const nav: NavEntry[] = [
    { id: 'home', label: 'Home', icon: 'home', href: hrefFor('home') },
    { id: 'share', label: 'Share screen', icon: 'screenShare', href: hrefFor('share') },
    { id: 'join', label: 'Join session', icon: 'join', href: hrefFor('join') },
    { id: 'session', label: 'Live session', icon: 'screen', href: hrefFor('session'), live: state.active },
    { id: 'history', label: 'History', icon: 'clock', href: hrefFor('history') },
  ];
  const footerNav: NavEntry[] = [{ id: 'help', label: 'How it works', icon: 'help', href: hrefFor('help') }];

  const Screen = screens[view];

  return (
    <>
      <a
        className="fixed left-2 top-2 z-[100] -translate-y-[160%] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <Sidebar items={nav} footerItems={footerNav} activeId={view} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="min-h-screen lg:pl-60">
        <Topbar section={viewTitles[view]} service={state.service} onMenu={() => setMenuOpen(true)} actions={<ThemeToggle />} />
        <main id="main" tabIndex={-1} className="outline-none">
          {state.notice && (
            <div className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-8">
              <Notice message={state.notice} onDismiss={session.dismissNotice} />
            </div>
          )}
          <Screen session={session} chat={chat} history={history.entries} />
        </main>
      </div>

      <InviteDialog open={inviteOpen && !state.approvalOpen} state={state} onClose={() => setInviteOpen(false)} />
      <ApprovalDialog open={state.approvalOpen} onApprove={() => void session.approveViewer()} onDecline={() => void session.rejectViewer()} />
    </>
  );
}
