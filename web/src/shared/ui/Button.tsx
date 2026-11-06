import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../lib';

/**
 * The one button in Deskstream (shadcn/ui, new-york). Rules:
 * - `primary`: the single main action of a view or card.
 * - `outline`: every secondary action.
 * - `ghost`: icon-only and toolbar/navigation controls only.
 * - `danger`: destructive actions only (End session).
 * Every button is the same height (h-9 / 36px), matching inputs and selects.
 * Actions take a leading icon; a trailing arrow is reserved for navigation.
 */
export const buttonVariants = cva(
  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium outline-none transition-all disabled:pointer-events-none disabled:opacity-50 has-[>svg]:px-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:shadow-sm active:scale-[0.98]',
        outline:
          'border border-border/80 bg-card shadow-xs hover:bg-accent hover:text-accent-foreground active:scale-[0.98] dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        ghost: 'hover:bg-accent/80 hover:text-accent-foreground active:scale-[0.98] dark:hover:bg-accent/50',
        danger:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 active:scale-[0.98] focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
      },
      iconOnly: { true: 'size-9 px-0 has-[>svg]:px-0', false: '' },
    },
    defaultVariants: { variant: 'outline', iconOnly: false },
  },
);

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  /** Square button that holds only an icon. Requires an accessible `aria-label`. */
  iconOnly?: boolean;
  /** Render the child element (e.g. an <a>) with button styling. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', block, iconOnly = false, asChild, className, type = 'button', ...rest },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      ref={ref}
      type={asChild ? undefined : type}
      data-slot="button"
      className={cn(buttonVariants({ variant, iconOnly }), block && 'w-full', className)}
      {...rest}
    />
  );
});
