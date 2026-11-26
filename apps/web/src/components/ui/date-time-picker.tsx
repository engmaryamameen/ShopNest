'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarMonth, calendarDialogStyle, calendarMonth } from './calendar-month';
import { AdminInput } from './admin-form';

export function DateTimePicker({
  label,
  value,
  onChange,
  defaultTime = '00:00',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  defaultTime?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (open) restoreFocus.current = true;
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-admin-field
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-[#cbd2e0] bg-white px-3 text-left text-sm text-[#172126] hover:border-[#91b4c7] focus-visible:outline-2 focus-visible:outline-[#0077b6] disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className={value ? 'truncate' : 'font-normal text-[#8897a5]'}>
          {value
            ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : 'Choose date & time'}
        </span>
        <svg
          aria-hidden="true"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      </button>
      {open && (
        <DateTimeDialog
          label={label}
          value={value}
          defaultTime={defaultTime}
          onApply={(next) => {
            onChange(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DateTimeDialog({
  label,
  value,
  defaultTime,
  onApply,
  onClose,
}: {
  label: string;
  value: string;
  defaultTime: string;
  onApply: (value: string) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const timeId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const today = new Date().toLocaleDateString('en-CA');
  const [date, setDate] = useState(value.slice(0, 10));
  const [time, setTime] = useState(value.slice(11, 16) || defaultTime);
  const [month, setMonth] = useState(() => calendarMonth(value.slice(0, 10) || today));
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ');
  useEffect(() => {
    const element = dialog.current;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const previousGutter = root.style.scrollbarGutter;
    root.style.overflow = 'hidden';
    root.style.scrollbarGutter = 'stable';
    element?.showModal();
    return () => {
      element?.close();
      root.style.overflow = previousOverflow;
      root.style.scrollbarGutter = previousGutter;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      data-range-dialog
      className={`${calendarDialogStyle} max-w-[390px]`}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-base font-semibold">
          {label.replace(' (optional)', '')}
        </h2>
        <button
          type="button"
          aria-label="Close date picker"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-xl text-slate-500 hover:bg-slate-50"
        >
          ×
        </button>
      </header>
      <CalendarMonth
        month={month}
        today={today}
        start={date}
        onMove={(delta) =>
          setMonth(
            (current) =>
              new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1)),
          )
        }
        onSelect={setDate}
      />
      <div className="mt-4 flex items-center gap-4 border-t border-gray-100 pt-4">
        <label htmlFor={timeId} className="shrink-0 text-sm font-medium text-slate-700">
          Time
        </label>
        <AdminInput
          id={timeId}
          aria-label={`${label} time`}
          type="time"
          value={time}
          onInput={(event) => setTime(event.currentTarget.value)}
          onChange={(event) => setTime(event.target.value)}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">Times use {timezone}.</p>
      <footer className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 text-sm">
        <button
          type="button"
          className="mr-auto rounded px-2 py-2 text-slate-500 hover:bg-slate-50"
          onClick={() => onApply('')}
        >
          Clear
        </button>
        <button
          type="button"
          className="rounded bg-[#f5f7fa] px-3 py-2 text-[#494e50] hover:bg-slate-200"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!date || !time}
          className="rounded bg-[#0077b6] px-4 py-2 text-white hover:bg-[#006a9b] disabled:cursor-not-allowed disabled:bg-slate-200"
          onClick={() => onApply(`${date}T${time}`)}
        >
          Apply
        </button>
      </footer>
    </dialog>
  );
}
