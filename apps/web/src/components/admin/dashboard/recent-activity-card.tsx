import Link from 'next/link';
import type { AdminDashboardResponse } from '@/lib/api-types';

function humanizeAction(action: string): string {
  return action.toLowerCase().replace(/_/g, ' ');
}

export function RecentActivityCard({ logs }: { logs: AdminDashboardResponse['recentAuditLogs'] }) {
  return (
    <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-admin-heading font-lato">Recent activity</h2>
        <Link href="/admin/audit-log" className="text-sm font-medium text-admin-accent hover:underline font-lato">
          View all →
        </Link>
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-admin-muted font-lato">No admin activity yet</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {logs.slice(0, 8).map((log) => (
            <li key={log.id} className="py-2.5 flex items-center justify-between gap-4 text-sm font-lato">
              <p className="text-admin-ink truncate">
                {humanizeAction(log.action)}
                {log.actor && <span className="text-admin-muted"> · {log.actor.email}</span>}
              </p>
              <time className="shrink-0 text-admin-muted text-xs">{new Date(log.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
