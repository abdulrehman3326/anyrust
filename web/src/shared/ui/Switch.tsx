import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../lib';
import { Label } from './Label';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'children'> {
  label: string;
  description?: string | undefined;
  hideLabel?: boolean | undefined;
}

/**
 * On/off setting row: label (and optional description) on the left, switch on the right.
 *
 * The control is a native checkbox with `role="switch"`, so keyboard, form and screen-reader
 * behavior come for free and nothing injects inline styles (CSP `style-src 'self'`). The
 * checkbox sits invisibly over the drawn track; track and thumb react to it via `peer-*`.
 * The "on" color is `primary`, not brand: a setting is not a live indicator.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, hideLabel, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  return (
    <div data-slot="switch-field" className={cn('flex items-center justify-between gap-4', className)}>
      <div className={cn('grid gap-1.5', hideLabel && 'sr-only')}>
        <Label htmlFor={inputId}>{label}</Label>
        {description ? (
          <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <span className="relative inline-flex shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          aria-describedby={descriptionId}
          data-slot="switch"
          className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none h-5 w-9 rounded-full border border-transparent bg-input shadow-xs transition-colors peer-checked:bg-primary peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/25 peer-disabled:opacity-50 dark:bg-input/80 dark:peer-checked:bg-primary"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50 dark:bg-foreground dark:peer-checked:bg-primary-foreground"
        />
      </span>
    </div>
  );
});
