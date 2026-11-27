'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ADMIN_PAGES } from './admin-pages';

export function AdminPageSearch({ isSuperAdmin, demoEnabled }: { isSuperAdmin: boolean; demoEnabled: boolean }) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const pages = ADMIN_PAGES.filter((page) => (isSuperAdmin || page.href !== '/admin/admins') && (demoEnabled || page.href !== '/admin/demo-data'));
  const matches = query.trim() ? pages.filter((page) => page.title.toLowerCase().includes(query.trim().toLowerCase())) : [];

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); }
      if (event.key === 'Escape') { setQuery(''); }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  return <div className="relative w-[340px] min-w-0 max-w-full max-[1100px]:w-56 max-[900px]:col-start-2 max-[900px]:col-end-5 max-[900px]:row-start-2 max-[900px]:w-full max-[900px]:pl-2">
    <label className="group flex h-10 items-center gap-1.5 rounded-full bg-[#f5f7f9] p-1.5 max-[900px]:rounded-xl max-[900px]:border max-[900px]:border-slate-200 max-[900px]:bg-white font-lato transition-[background-color,box-shadow,border-color] duration-200 ease-out focus-within:bg-white focus-within:shadow-[0_0_0_2px_#fff,0_0_0_3px_#cbd5e1,0_4px_12px_rgb(15_23_42_/_10%)] motion-reduce:transition-none max-[900px]:focus-within:border-slate-300">
      <input ref={input} className="h-7 min-w-0 flex-1 rounded-full border-0 bg-transparent px-4 text-sm tracking-[0.005em] text-[#232b34] outline-none placeholder:text-black/60 max-[700px]:px-3" aria-label="Find an admin page" placeholder="Search admin pages" value={query} onChange={(event) => setQuery(event.target.value)} />
      <span className="flex h-7 w-9 shrink-0 items-center justify-center text-[#6a717f] transition-colors duration-200 group-focus-within:text-[#0077b6] motion-reduce:transition-none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="m17.327 16.44 3.473 3.36M19.68 10.84a7.84 7.84 0 1 1-15.68 0 7.84 7.84 0 0 1 15.68 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
    </label>
    {query.trim() && <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-full min-w-56 rounded-[10px] border border-[#e3e7eb] bg-white p-1.5 shadow-[0_8px_24px_rgb(15_23_42_/_12%)]" aria-label="Page search results">
      {matches.length ? matches.map((page) => <Link key={page.href} className="block rounded-md p-2 text-[13px] text-[#283442] no-underline hover:bg-slate-100 focus-visible:bg-slate-100" href={page.href} onClick={() => { setQuery(''); }}>{page.title}</Link>) : <p className="m-2 text-[13px] text-[#69717d]">No matching pages.</p>}
    </div>}
  </div>;
}
