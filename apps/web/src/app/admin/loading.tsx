export default function AdminLoading() {
  return <div role="status" aria-label="Loading dashboard" className="space-y-6"><div className="h-5 w-24 animate-pulse rounded bg-slate-100" /><div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}</div><span className="sr-only">Loading dashboard…</span></div>;
}
