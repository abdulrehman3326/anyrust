import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Icon, SelectField } from '@/shared/ui';
import { cn } from '@/shared/lib';
import { qualityKeys, qualityPresets } from '../lib/qualityPresets';
import { workflow } from '../lib/presentation';
import type { QualityKey, SessionState } from '../model/types';

interface SessionDetailsProps {
  state: SessionState;
  onQualityChange: (quality: QualityKey) => void;
}

const markerStyles = {
  upcoming: 'border-border text-muted-foreground',
  active: 'border-brand bg-brand text-brand-foreground',
  complete: 'border-success/30 bg-success/10 text-success',
} as const;

export function SessionDetails({ state, onQualityChange }: SessionDetailsProps) {
  const steps = workflow(state.role, state.active, state.phase);
  const { stats } = state;
  const rows: Array<[string, string]> = [
    ['Resolution', stats.resolution ?? '—'],
    ['Frame rate', stats.fps == null ? '—' : `${stats.fps} fps`],
    ['Bitrate', stats.bitrateMbps == null ? '—' : `${stats.bitrateMbps.toFixed(1)} Mbps`],
    ['Round trip', stats.latencyMs == null ? '—' : `${stats.latencyMs} ms`],
  ];

  return (
    <Card as="aside" aria-label="Session information">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon name="signal" size={16} className="text-muted-foreground" />
          <CardTitle>Session details</CardTitle>
        </div>
        <CardDescription>Progress, stream quality and connection stats.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <ol className="flex flex-col gap-4" aria-label="Sharing progress">
          {steps.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3" data-state={step.state}>
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                  markerStyles[step.state],
                )}
              >
                {step.state === 'complete' ? <Icon name="check" size={14} strokeWidth={2.5} /> : index + 1}
              </span>
              <div className="min-w-0 space-y-0.5">
                <strong className="block text-sm font-medium leading-6">{step.title}</strong>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="border-t pt-6">
          <SelectField
            label="Stream quality"
            hint="Adjusts resolution and frame rate for the active stream."
            value={state.quality}
            disabled={state.active && state.role === 'viewer'}
            options={qualityKeys.map((key) => ({ value: key, label: qualityPresets[key].label }))}
            onValueChange={onQualityChange}
          />
        </div>

        <dl className="grid grid-cols-2 gap-2" aria-label="Live stream statistics">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono text-sm font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>

      <CardFooter className="items-start gap-2 border-t text-xs text-muted-foreground">
        <Icon name="lock" size={14} className="mt-px shrink-0" />
        <span>View-only access. Viewers can’t control your mouse or keyboard.</span>
      </CardFooter>
    </Card>
  );
}
