'use client';

import { useState } from 'react';

export function CategoryFolder({ className = 'size-6' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/></svg>;
}

export function CategoryThumbnail({ url, className = 'size-12' }: { url?: string | null; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className={`${className} grid shrink-0 place-items-center overflow-hidden rounded-xl border border-[#edf0f3] bg-[#f7f9fa] text-slate-400`}>
      {url && failedUrl !== url ? <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} className="h-full w-full object-contain p-1.5"/> : <CategoryFolder />}
    </span>
  );
}
