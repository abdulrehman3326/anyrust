import type { ChatLog } from '@/features/chat';
import type { HistoryEntry } from '@/features/history';
import type { SessionApi, WorkflowStep } from '@/features/session';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Icon } from '@/shared/ui';
import { hrefFor } from '../router';
import type { View } from '../router';

export interface ViewProps {
  session: SessionApi;
  chat: ChatLog;
  history: HistoryEntry[];
}

/** A button that navigates to another view. Navigation CTAs carry a trailing arrow. */
export function ViewLink({ to, variant = 'outline', children }: { to: View; variant?: 'primary' | 'outline'; children: string }) {
  return (
    <Button asChild variant={variant}>
      <a href={hrefFor(to)}>
        {children}
        <Icon name="arrow" />
      </a>
    </Button>
  );
}

/** Numbered explainer card used on the Share and Join views. */
export function StepsCard({ title, description, steps }: { title: string; description: string; steps: WorkflowStep[] }) {
  return (
    <Card as="aside">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-5">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs text-muted-foreground">
                {index + 1}
              </span>
              <div className="space-y-0.5">
                <strong className="block text-sm font-medium leading-6">{step.title}</strong>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Shown on Home/Share/Join while a session is running elsewhere in the app. */
export function ActiveSessionCard({ statusText }: { statusText: string }) {
  return (
    <Card padded={false} className="flex-row items-center gap-4 border-brand/30 bg-brand/5 px-6 py-4">
      <span className="relative flex size-2.5 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block text-sm font-medium">Session in progress</strong>
        <span className="block truncate text-sm text-muted-foreground">{statusText}</span>
      </div>
      <ViewLink to="session" variant="primary">Open session</ViewLink>
    </Card>
  );
}
