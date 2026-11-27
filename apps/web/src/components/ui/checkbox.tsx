'use client';

import { useEffect, useRef, type InputHTMLAttributes } from 'react';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { indeterminate?: boolean };

export function Checkbox({ indeterminate = false, className = '', ...props }: CheckboxProps) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = indeterminate; }, [indeterminate]);
  return <span className={`relative inline-flex h-4 w-4 shrink-0 ${className}`}>
    <input {...props} ref={input} type="checkbox" className="peer h-4 w-4 cursor-pointer appearance-none rounded-[3px] border-[1.5px] border-slate-400 bg-white transition-colors hover:border-[#0077b6] checked:border-[#0077b6] checked:bg-[#0077b6] indeterminate:border-[#0077b6] indeterminate:bg-[#0077b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0077b6] disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200" />
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="pointer-events-none absolute inset-0 h-4 w-4 text-white opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100"><path d={indeterminate ? 'M4 8h8' : 'm4 8 2.5 2.5L12 5.5'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>;
}
