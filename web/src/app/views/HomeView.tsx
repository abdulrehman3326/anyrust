import { HistoryList } from '@/features/history';
import { Page, PageHeader, SectionHeader } from '@/shared/layout';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle, IconChip } from '@/shared/ui';
import type { IconName } from '@/shared/ui';
import { ActiveSessionCard, ViewLink } from './shared';
import type { ViewProps } from './shared';

const pillars: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'lock', title: 'Encrypted connection', body: 'Video travels peer-to-peer over WebRTC and is encrypted in transit.' },
  { icon: 'userCheck', title: 'You approve every viewer', body: 'Invite links only request access. Nothing streams until you approve.' },
  { icon: 'eye', title: 'View-only by design', body: 'Viewers see your selected source. They can never control your device.' },
];

export function HomeView({ session, history }: ViewProps) {
  const { state } = session;
  return (
    <Page>
      <PageHeader
        title="Secure screen sharing, on your terms."
        description="Share a window, tab, or display over an encrypted peer-to-peer connection. Every viewer needs your approval, and access is always view-only."
      />

      {state.active && <ActiveSessionCard statusText={state.statusText} />}

      <section className="flex flex-col gap-4" aria-labelledby="start-title">
        <SectionHeader id="start-title" title="Get started" description="Host a session or join one you’ve been invited to." />
        <div className="grid gap-6 md:grid-cols-2">
          <Card as="article">
            <CardHeader>
              <div className="flex items-start gap-4">
                <IconChip icon="screenShare" tone="brand" />
                <div className="space-y-1.5">
                  <CardTitle>Share your screen</CardTitle>
                  <CardDescription>Start a private session, send one invite link, and approve your viewer.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardFooter className="mt-auto">
              <ViewLink to="share" variant={state.active ? 'outline' : 'primary'}>Start a session</ViewLink>
            </CardFooter>
          </Card>
          <Card as="article">
            <CardHeader>
              <div className="flex items-start gap-4">
                <IconChip icon="join" />
                <div className="space-y-1.5">
                  <CardTitle>Join a session</CardTitle>
                  <CardDescription>Received an invite link? Request access and watch once the presenter approves.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardFooter className="mt-auto">
              <ViewLink to="join">Join with a link</ViewLink>
            </CardFooter>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="trust-title">
        <SectionHeader id="trust-title" title="Built for trust" description="Privacy controls are the default, not a setting." />
        <div className="grid gap-6 md:grid-cols-3">
          {pillars.map((pillar) => (
            <Card key={pillar.title}>
              <CardHeader className="gap-4">
                <IconChip icon={pillar.icon} />
                <div className="space-y-1.5">
                  <CardTitle>{pillar.title}</CardTitle>
                  <CardDescription>{pillar.body}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="recent-title">
        <SectionHeader
          id="recent-title"
          title="Recent sessions"
          description="Stored locally in this browser."
          action={history.length > 3 ? <ViewLink to="history">View all</ViewLink> : undefined}
        />
        <HistoryList entries={history} limit={3} />
      </section>
    </Page>
  );
}
