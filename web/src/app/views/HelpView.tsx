import { HelpContent } from '@/features/help';
import { Page, PageHeader } from '@/shared/layout';
import { ViewLink } from './shared';

export function HelpView() {
  return (
    <Page className="lg:h-[calc(100dvh-3.5rem)] lg:gap-5 lg:py-6 lg:[&>header]:pb-5">
      <PageHeader
        title="How it works"
        description="Deskstream connects one presenter and one approved viewer over WebRTC. Try the full flow with a demo stream your screen is never captured."
        actions={<ViewLink to="share" variant="primary">Try the demo stream</ViewLink>}
      />
      <HelpContent />
    </Page>
  );
}
