import { cva } from 'class-variance-authority';
import { cn } from '../lib';
import { Button } from './Button';
import { Icon } from './Icon';

/** shadcn/ui alert layout with tinted status tones. */
const alertVariants = cva(
  'relative grid w-full grid-cols-[1rem_1fr_auto] items-start gap-x-3 rounded-lg border px-4 py-3 text-sm [&>svg]:translate-y-0.5',
  {
    variants: {
      tone: {
        info: 'border-info/30 bg-info/10 text-info',
        warning: 'border-warning/30 bg-warning/10 text-warning',
        danger: 'border-destructive/30 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { tone: 'warning' },
  },
);

interface NoticeProps {
  tone?: 'info' | 'warning' | 'danger';
  message: string;
  onDismiss?: () => void;
}

export function Notice({ tone = 'warning', message, onDismiss }: NoticeProps) {
  return (
    <div data-slot="alert" className={cn(alertVariants({ tone }))} role="alert">
      <Icon name="alert" size={16} />
      <p className="leading-relaxed text-foreground/90">{message}</p>
      {onDismiss && (
        <Button variant="ghost" iconOnly className="-my-2 -mr-2" aria-label="Dismiss message" onClick={onDismiss}>
          <Icon name="close" />
        </Button>
      )}
    </div>
  );
}
