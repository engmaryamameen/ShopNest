'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ADMIN_PAGES } from './admin-pages';

export function AdminPageSearch({ isSuperAdmin, demoEnabled }: { isSuperAdmin: boolean; demoEnabled: boolean }) {
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pages = ADMIN_PAGES.filter((page) => (isSuperAdmin || page.href !== '/admin/admins') && (demoEnabled || page.href !== '/admin/demo-data'));
  const matches = query.trim() ? pages.filter((page) => page.title.toLowerCase().includes(query.trim().toLowerCase())) : [];

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); }
      if (event.key === 'Escape') { setQuery(''); setMobileOpen(false); }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  return <div className="relative w-[340px] min-w-0 max-w-full max-[1100px]:w-56 max-[900px]:w-10">
    <button type="button" aria-label={mobileOpen ? 'Close search' : 'Search admin pages'} aria-expanded={mobileOpen} onClick={() => { setMobileOpen((value) => !value); if (!mobileOpen) requestAnimationFrame(() => input.current?.focus()); }} className="hidden size-10 place-items-center rounded text-slate-700 hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-[#0077b6] max-[900px]:grid"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m17.327 16.44 3.473 3.36M19.68 10.84a7.84 7.84 0 1 1-15.68 0 7.84 7.84 0 0 1 15.68 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
    <div className={`${mobileOpen ? 'max-[900px]:block' : 'max-[900px]:hidden'} max-[900px]:absolute max-[900px]:right-0 max-[900px]:top-12 max-[900px]:z-40 max-[900px]:w-[min(280px,calc(100vw-32px))] max-[900px]:rounded-xl max-[900px]:bg-white max-[900px]:p-2 max-[900px]:shadow-lg`}>
    <label className="flex h-10 items-center gap-1.5 rounded-full bg-[#f9fafb] p-1.5 font-lato ring-1 ring-inset ring-transparent focus-within:ring-[#aab5c2]">
      <input ref={input} className="h-7 min-w-0 flex-1 rounded-full border-0 bg-transparent px-4 text-sm tracking-[0.005em] text-[#232b34] outline-none placeholder:text-black/60 max-[700px]:px-3" aria-label="Find an admin page" placeholder="Search admin pages" value={query} onChange={(event) => setQuery(event.target.value)} />
      <span className="flex h-7 w-9 shrink-0 items-center justify-center text-[#6a717f]" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="m17.327 16.44 3.473 3.36M19.68 10.84a7.84 7.84 0 1 1-15.68 0 7.84 7.84 0 0 1 15.68 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
    </label>
    {query.trim() && <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-full min-w-56 rounded-[10px] border border-[#e3e7eb] bg-white p-1.5 shadow-[0_8px_24px_rgb(15_23_42_/_12%)]" aria-label="Page search results">
      {matches.length ? matches.map((page) => <Link key={page.href} className="block rounded-md p-2 text-[13px] text-[#283442] no-underline hover:bg-slate-100 focus-visible:bg-slate-100" href={page.href} onClick={() => { setQuery(''); setMobileOpen(false); }}>{page.title}</Link>) : <p className="m-2 text-[13px] text-[#69717d]">No matching pages.</p>}
    </div>}
    </div>
  </div>;
}
