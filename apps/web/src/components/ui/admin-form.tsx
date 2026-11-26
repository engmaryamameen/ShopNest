'use client';

import {
  forwardRef,
  useId,
  useState,
  useRef,
  useLayoutEffect,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { navigateListbox, useMenuPosition } from './use-menu-position';
import { AdminReveal } from './admin-reveal';

const inputStyle =
  'h-10 w-full rounded-md border border-[#cbd2e0] bg-white px-3 text-sm text-[#172126] transition-[border-color,box-shadow] hover:border-[#91b4c7] focus:outline-none focus-visible:border-[#0077b6] focus-visible:ring-2 focus-visible:ring-[#0077b6]/10 aria-invalid:border-[#a52b21] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400';
export const productFieldSurface =
  'rounded-lg border border-[#e5e7eb] bg-[#f9fafb] transition-[border-color,box-shadow] focus-within:border-[#667085] focus-within:ring-2 focus-within:ring-[#667085]/20';
const productInputStyle = `${productFieldSurface} h-10 w-full px-3 font-lato text-[15px] text-[#172126] focus:outline-none focus:border-[#667085] focus:ring-2 focus:ring-[#667085]/20 aria-invalid:border-[#a52b21] disabled:cursor-not-allowed disabled:text-gray-400`;

export const AdminInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { variant?: 'default' | 'product' }
>(function AdminInput({ variant = 'default', ...props }, ref) {
  return (
    <input
      {...props}
      data-admin-field
      ref={ref}
      className={`${variant === 'product' ? productInputStyle : inputStyle} ${props.className ?? ''}`}
    />
  );
});

export function AdminSelect({
  id,
  value,
  options,
  onChange,
  variant = 'default',
  searchable = false,
}: {
  id: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  variant?: 'default' | 'product';
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const keyboardOpen = useRef(false);
  const position = useMenuPosition(open, root, trigger, list);
  useLayoutEffect(() => {
    if (!open || !keyboardOpen.current) return;
    keyboardOpen.current = false;
    if (searchable) {
      searchInput.current?.focus();
      return;
    }
    (
      list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ??
      list.current?.querySelector<HTMLButtonElement>('[role="option"]')
    )?.focus();
  }, [open, searchable]);
  return (
    <div
      ref={root}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        } else if (
          list.current?.contains(event.target as Node) &&
          (!(event.target instanceof HTMLInputElement) ||
            event.key === 'ArrowDown' || event.key === 'ArrowUp')
        )
          navigateListbox(event, list.current);
      }}
    >
      <button
        id={id}
        data-admin-field
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setSearch('');
          keyboardOpen.current = searchable;
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (open)
              (
                list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ??
                list.current?.querySelector<HTMLButtonElement>('[role="option"]')
              )?.focus();
            else {
              keyboardOpen.current = true;
              setSearch('');
              setOpen(true);
            }
          }
        }}
        className={`${variant === 'product' ? productInputStyle : inputStyle} flex items-center justify-between text-left`}
      >
        <span
          className="min-w-0 truncate"
          title={options.find((option) => option.value === value)?.label}
        >
          {options.find((option) => option.value === value)?.label ?? 'Select an option'}
        </span>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className={`text-black/40 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={list}
          style={position}
          className="absolute z-20 w-full overflow-auto rounded-xl border border-[#e3e7eb] bg-white p-1 shadow-[0_8px_24px_rgb(15_23_42_/_12%)]"
        >
          {searchable && (
            <div className="sticky top-0 z-10 bg-white p-1 pb-2">
              <AdminInput
                ref={searchInput}
                aria-label="Search options"
                placeholder="Search categories…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          )}
          <div id={listId} role="listbox" aria-labelledby={id}>
          {options.filter((option) => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                trigger.current?.focus();
              }}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:text-[#0077b6] focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#0077b6] ${value === option.value ? 'text-[#0077b6]' : 'text-gray-700'}`}
            >
              {option.label}
            </button>
          ))}
          </div>
          {searchable && !options.some((option) => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && (
            <p className="px-3 py-3 text-sm text-gray-500">No categories found.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminPageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </header>
  );
}

export function AdminAccordion({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className={className ?? 'border-t border-gray-100 py-3'}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-left text-sm font-medium text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0077b6]"
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        >
          <path d="m4 2 4 4-4 4" />
        </svg>
        {title}
      </button>
      <AdminReveal open={open} id={id}>
        <div className="pt-3">{children}</div>
      </AdminReveal>
    </section>
  );
}

export function AdminSwitch({
  label,
  checked,
  onChange,
  description,
  controls,
  variant = 'inline',
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  controls?: string;
  variant?: 'inline' | 'setting';
}) {
  const descriptionId = useId();
  const control = (
    <label
      className={`relative flex cursor-pointer items-center gap-3 text-sm font-medium text-gray-700 ${variant === 'setting' ? 'flex-row-reverse justify-between' : ''}`}
    >
      <input
        type="checkbox"
        role="switch"
        aria-describedby={description ? descriptionId : undefined}
        aria-controls={controls}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[#0077b6] peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#0077b6]"
      />
      {label}
    </label>
  );
  return description ? (
    <div>
      {control}
      <p
        id={descriptionId}
        className={`${variant === 'setting' ? 'mr-12' : 'ml-12'} mt-1 text-xs leading-5 text-gray-500`}
      >
        {description}
      </p>
    </div>
  ) : (
    control
  );
}
