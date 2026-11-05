import { HistoryList } from '@/features/history';
import { Page, PageHeader } from '@/shared/layout';
import type { ViewProps } from './shared';

export function HistoryView({ history }: ViewProps) {
  return (
    <Page>
      <PageHeader
        title="Session history"
        description="Your most recent sessions, stored locally in this browser. Invite links are never saved."
      />
      <HistoryList entries={history} />
    </Page>
  );
}
