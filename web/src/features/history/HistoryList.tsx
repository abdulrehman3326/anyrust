import { Badge, Card, IconChip } from '@/shared/ui';
import { formatConnected, formatRoomId } from '@/shared/lib';
import type { HistoryEntry } from './historyStorage';

interface HistoryListProps {
  entries: HistoryEntry[];
  /** Show only the newest N entries (e.g. on the home view). */
  limit?: number;
}

export function HistoryList({ entries, limit }: HistoryListProps) {
  const shown = limit ? entries.slice(0, limit) : entries;
  return (
    <Card padded={false} className="gap-0 overflow-hidden">
      {shown.length === 0 ? (
        <div className="flex items-center gap-4 p-6">
          <IconChip icon="clock" />
          <div className="space-y-0.5">
            <h3 className="font-sans text-sm font-medium">No sessions yet</h3>
            <p className="text-sm text-muted-foreground">Completed sessions will appear here.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y">
          {shown.map((entry) => (
            <li key={`${entry.address}-${entry.date}`} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/30">
              <IconChip icon={entry.kind.toLowerCase().includes('view') ? 'eye' : 'screen'} />
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-medium">{entry.kind}</strong>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="font-mono text-xs tabular-nums tracking-wide text-muted-foreground">{formatRoomId(entry.address)}</span>
                <Badge tone={entry.seconds ? 'success' : 'neutral'} dot className="whitespace-nowrap">
                  {formatConnected(entry.seconds)}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
