import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { cn } from '../lib';
import { Icon } from './Icon';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  id?: string | undefined;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onValueChange: (value: T) => void;
  disabled?: boolean | undefined;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Accessible custom select with a frosted-glass menu. A native <select> popup is drawn by the OS and
 * cannot be themed; Radix Select is avoided because it injects inline <style> tags blocked by our CSP.
 */
export function Select<T extends string>({ id, value, options, onValueChange, disabled, className, ...aria }: SelectProps<T>) {
  const fallbackId = useId();
  const buttonId = id ?? fallbackId;
  const listId = `${buttonId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [active, setActive] = useState(selectedIndex);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const show = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) onValueChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) return show();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((current) => (current + step + options.length) % options.length);
        break;
      }
      case 'Home':
      case 'End':
        if (!open) return;
        event.preventDefault();
        setActive(event.key === 'Home' ? 0 : options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) choose(active);
        else show();
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={buttonId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${buttonId}-opt-${active}` : undefined}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        disabled={disabled}
        data-slot="select"
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] hover:bg-accent/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-destructive aria-expanded:border-ring',
          className,
        )}
      >
        <span className="truncate">{selected?.label}</span>
        <Icon name="chevronDown" size={16} className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-auto rounded-lg border border-border/60 bg-popover/90 p-1 text-popover-foreground shadow-popover ring-1 ring-foreground/5 backdrop-blur-xl backdrop-saturate-150 animate-in fade-in-0 zoom-in-95 slide-in-from-top-1"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${buttonId}-opt-${index}`}
              role="option"
              aria-selected={option.value === value}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
                index === active && 'bg-foreground/10',
                option.value === value && 'font-medium',
              )}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && <Icon name="check" size={16} className="shrink-0 text-muted-foreground" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
