import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '../lib';
import { Input, Textarea } from './Input';
import { Label } from './Label';
import { Select } from './Select';
import type { SelectOption } from './Select';

interface FieldFrameProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  hideLabel?: boolean | undefined;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

function FieldFrame({ label, hint, error, hideLabel, children }: FieldFrameProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div data-slot="form-item" className="grid gap-2">
      <Label htmlFor={id} className={cn(hideLabel && 'sr-only')}>{label}</Label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

interface SharedProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  hideLabel?: boolean | undefined;
}

export const TextField = forwardRef<HTMLInputElement, SharedProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, hint, error, hideLabel, ...rest },
  ref,
) {
  return (
    <FieldFrame label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {({ id, describedBy, invalid }) => (
        <Input ref={ref} id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...rest} />
      )}
    </FieldFrame>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, SharedProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { label, hint, error, hideLabel, ...rest },
  ref,
) {
  return (
    <FieldFrame label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {({ id, describedBy, invalid }) => (
        <Textarea ref={ref} id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...rest} />
      )}
    </FieldFrame>
  );
});

interface SelectFieldProps<T extends string> extends SharedProps {
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onValueChange: (value: T) => void;
  disabled?: boolean | undefined;
}

export function SelectField<T extends string>({ label, hint, error, hideLabel, ...rest }: SelectFieldProps<T>) {
  return (
    <FieldFrame label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {({ id, describedBy, invalid }) => <Select id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...rest} />}
    </FieldFrame>
  );
}
