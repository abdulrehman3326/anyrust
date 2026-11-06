import { forwardRef } from 'react';
import type { ComponentProps } from 'react';
import { cn } from '../lib';

const control =
  'w-full min-w-0 rounded-md border border-input bg-card text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

/** shadcn/ui input. */
export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input({ className, type, ...props }, ref) {
  return <input ref={ref} type={type} data-slot="input" className={cn(control, 'flex h-9 px-3 py-1', className)} {...props} />;
});

/** shadcn/ui textarea. */
export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} data-slot="textarea" className={cn(control, 'flex min-h-16 px-3 py-2', className)} {...props} />;
});
