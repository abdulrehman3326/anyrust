import { HistoryList } from '@/features/history';
import { Page, PageHeader, SectionHeader } from '@/shared/layout';
import { Badge, Button, Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle, Icon, IconChip } from '@/shared/ui';
import type { IconName } from '@/shared/ui';
import { ActiveSessionCard, ViewLink } from './shared';
import type { ViewProps } from './shared';

const steps: Array<{ icon: IconName; title: string; description: string }> = [
  {
    icon: 'screenShare',
    title: '1. Select your source',
    description: 'Choose a window, tab, or full display. Or click “Try demo” to test the flow safely.',
  },
  {
    icon: 'link',
    title: '2. Share private invite',
    description: 'Deskstream generates a secure, one-time invite link and copies it to your clipboard.',
  },
  {
    icon: 'userCheck',
    title: '3. Approve & stream',
    description: 'Review and approve viewer access. Encrypted P2P video and live chat start instantly.',
  },
];

export function HomeView({ session, history }: ViewProps) {
  const { state } = session;
  const locked = state.busy || state.ending || state.active;

  return (
    <Page>
      <PageHeader
        title="Share your screen securely, on your terms."
        description="Encrypted peer-to-peer screen sharing. You approve every viewer, and access is always view-only."
        actions={state.active ? <ViewLink to="session" variant="primary">Open live session</ViewLink> : undefined}
      />

      {state.active && <ActiveSessionCard statusText={state.statusText} />}

      <section className="flex flex-col gap-4" aria-labelledby="start-title">
        <SectionHeader id="start-title" title="Get started" description="Host a new session or join one you’ve been invited to." />
        <div className="grid gap-6 md:grid-cols-2">
          {/* Host Card */}
          <Card as="article" className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <IconChip icon="screenShare" tone="brand" />
                  <div className="space-y-1.5">
                    <CardTitle>Share your screen</CardTitle>
                    <CardDescription>
                      Host a private, view-only session. Pick a window, tab, or display. We’ll generate your secure invite link automatically.
                    </CardDescription>
                  </div>
                </div>
                <CardAction>
                  <Badge tone="outline">Host</Badge>
                </CardAction>
              </div>
            </CardHeader>

            <CardFooter className="mt-auto justify-between gap-3 border-t">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                <Icon name="shield" size={14} className="text-success" />
                Host approved
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {state.active ? (
                  <ViewLink to="session" variant="primary">Open live session</ViewLink>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={locked || state.service !== 'ready'}
                      onClick={() => void session.share(true)}
                    >
                      <Icon name="play" />
                      Try demo
                    </Button>
                    <Button
                      variant="primary"
                      disabled={locked || state.service !== 'ready' || !state.canCapture}
                      aria-busy={state.busy}
                      onClick={() => void session.share(false)}
                    >
                      <Icon name="screenShare" />
                      {state.busy ? (state.phase === 'choosing' ? 'Select…' : 'Starting…') : 'Start sharing'}
                    </Button>
                  </>
                )}
              </div>
            </CardFooter>
          </Card>

          {/* Join Card */}
          <Card as="article" className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <IconChip icon="join" />
                  <div className="space-y-1.5">
                    <CardTitle>Join a session</CardTitle>
                    <CardDescription>
                      Received an invite link from a presenter? Connect with your link to watch in view-only mode once approved.
                    </CardDescription>
                  </div>
                </div>
                <CardAction>
                  <Badge tone="outline">Viewer</Badge>
                </CardAction>
              </div>
            </CardHeader>

            <CardFooter className="mt-auto justify-between gap-3 border-t">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                <Icon name="lock" size={14} />
                View-only
              </span>
              <ViewLink to="join" variant="primary">
                Join with invite link
              </ViewLink>
            </CardFooter>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="steps-title">
        <SectionHeader
          id="steps-title"
          title="How it works"
          description="No accounts or software to install. Runs entirely in your browser."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="flex flex-col gap-2 rounded-2xl border border-border/80 dark:border-transparent bg-card p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
              <div className="flex items-center justify-between">
                <IconChip icon={step.icon} tone={index === 0 ? 'brand' : 'neutral'} />
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
              </div>
              <strong className="text-sm font-medium">{step.title}</strong>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
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
