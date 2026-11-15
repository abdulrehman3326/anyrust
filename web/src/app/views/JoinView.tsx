import { AddressBook } from '@/features/addressbook';
import { JoinCard } from '@/features/join';
import { workflow } from '@/features/session';
import { Page, PageHeader } from '@/shared/layout';
import { ActiveSessionCard, StepsCard, ViewLink } from './shared';
import type { ViewProps } from './shared';

export function JoinView({ session }: ViewProps) {
  const { state } = session;
  return (
    <Page>
      <PageHeader
        title="Join a session"
        description="Enter an invite link or a saved device ID. You’ll connect as soon as the presenter approves your request."
        actions={
          state.active ? (
            <ViewLink to="session" variant="primary">Open live session</ViewLink>
          ) : (
            <ViewLink to="home">Host a session</ViewLink>
          )
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {state.active && <ActiveSessionCard statusText={state.statusText} />}
          <JoinCard state={state} onJoin={session.join} />
          <AddressBook
            onConnect={session.join}
            connectDisabled={state.busy || state.ending || state.active || state.service !== 'ready'}
            currentDeviceId={state.active && state.role === 'viewer' ? state.deviceId : null}
          />
        </div>
        <StepsCard
          title="What to expect"
          description="Joining is quick and always view-only."
          steps={workflow('viewer', state.active && state.role === 'viewer', state.role === 'viewer' ? state.phase : 'idle')}
        />
      </div>
    </Page>
  );
}
