import { ShareCard } from '@/features/present';
import { workflow } from '@/features/session';
import { Page, PageHeader } from '@/shared/layout';
import { ActiveSessionCard, StepsCard } from './shared';
import type { ViewProps } from './shared';

export function ShareView({ session }: ViewProps) {
  const { state } = session;
  return (
    <Page>
      <PageHeader
        title="Share your screen"
        description="Choose what to share, then send your invite link to one viewer. You stay in control from start to finish."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          {state.active && <ActiveSessionCard statusText={state.statusText} />}
          <ShareCard state={state} onShare={(useSample) => void session.share(useSample)} />
        </div>
        <StepsCard
          title="How hosting works"
          description="Three steps from source to stream."
          steps={workflow('host', false, 'idle')}
        />
      </div>
    </Page>
  );
}
