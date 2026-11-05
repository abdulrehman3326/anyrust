import { cn } from '../lib';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface IconChipProps {
  icon: IconName;
  tone?: 'neutral' | 'brand' | 'success';
  className?: string;
}

const tones = {
  neutral: 'border-border bg-muted text-foreground',
  brand: 'border-brand/20 bg-brand/10 text-brand',
  success: 'border-success/20 bg-success/10 text-success',
} as const;

/** The square icon tile used at the start of every card header and list row. */
export function IconChip({ icon, tone = 'neutral', className }: IconChipProps) {
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg border', tones[tone], className)}>
      <Icon name={icon} size={18} />
    </span>
  );
}
