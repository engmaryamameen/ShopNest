'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AuditLogResponse } from '@/lib/api-types';

export function AdminActivityPanel() {
  const [logs, setLogs] = useState<AuditLogResponse[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState('loading');
    api.adminDashboard().then((result) => {
      if (active) { setLogs(result.recentAuditLogs); setState('ready'); }
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [attempt]);

  return <aside id="admin-activity-panel" className="box-border h-full w-full overflow-y-auto border-l border-[#eee] bg-white px-6 py-7 font-[Inter,sans-serif] text-[#1c1c1c]" aria-label="Notifications and activity">
    <section>
      <h2 className="m-0 text-sm leading-5 font-semibold">Notifications</h2>
      <p className="mt-4 text-[13px] leading-5 text-[#69717d]">Notifications are not available yet.</p>
    </section>
    <section className="mt-8">
      <div className="flex items-center justify-between gap-2"><h2 className="m-0 text-sm leading-5 font-semibold">Recent activity</h2><Link className="text-xs text-[#0077b6] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#0077b6]" href="/admin/audit-log">View all</Link></div>
      {state === 'loading' && <p className="mt-4 text-[13px] leading-5 text-[#69717d]" role="status">Loading activity…</p>}
      {state === 'error' && <div role="alert"><p className="mt-4 text-[13px] leading-5 text-[#69717d]">Couldn’t load activity.</p><button type="button" className="mt-2 cursor-pointer bg-transparent p-0 text-xs text-[#0077b6] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#0077b6]" onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>}
      {state === 'ready' && (logs.length === 0 ? <p className="mt-4 text-[13px] leading-5 text-[#69717d]">No admin activity yet.</p> : <ul className="mt-3 list-none p-0">
        {logs.slice(0, 5).map((log) => <li className="grid gap-1 py-2 text-[13px] leading-[18px] [overflow-wrap:anywhere]" key={log.id}>
          <span>{log.action.toLowerCase().replace(/_/g, ' ')}</span>
          <time className="text-xs text-[#737d87]" dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString()}</time>
        </li>)}
      </ul>)}
    </section>
  </aside>;
}
