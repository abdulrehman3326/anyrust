import { HelpContent } from '@/features/help';
import { Page, PageHeader } from '@/shared/layout';
import { Button, Icon } from '@/shared/ui';
import { ViewLink } from './shared';
import type { ViewProps } from './shared';

  export function HelpView({ session }: ViewProps) {
    const { state } = session;
    return (
      <Page className="lg:h-[calc(100dvh-3.5rem)] lg:gap-5 lg:py-6 lg:[&>header]:pb-5">
        <PageHeader
          title="How it works"
          description="Deskstream connects one presenter and one approved viewer over WebRTC. Try the full flow with a demo stream — your screen is never captured."
          actions={
            state.active ? (
              <ViewLink to="session" variant="primary">Open live session</ViewLink>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  disabled={state.busy || state.ending || state.service !== 'ready'}
                  onClick={() => void session.share(true)}
                >
                  <Icon name="play" />
                  Launch demo stream
                </Button>
                <ViewLink to="home">Back to Home</ViewLink>
              </div>
            )
          }
        />
        <HelpContent />
      </Page>
    );
  }
