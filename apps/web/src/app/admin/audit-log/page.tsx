import { cookies } from 'next/headers';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; targetType?: string }>;
}) {
  const { page: pageParam, action, targetType } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const cookieHeader = (await cookies()).toString();

  const { items, total, limit } = await api.adminAuditLogs({ page, limit: 25, action, targetType }, cookieHeader);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function pageHref(p: number) {
    const qs = new URLSearchParams();
    qs.set('page', String(p));
    if (action) qs.set('action', action);
    if (targetType) qs.set('targetType', targetType);
    return `/admin/audit-log?${qs.toString()}`;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Audit Log</h1>
      <p className="text-gray-500 mb-8">Every admin/vendor mutation that changed platform state, most recent first.</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Action</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Target</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Actor</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((log) => (
              <tr key={log.id}>
                <td className="px-6 py-4 text-gray-900 font-medium">{log.action}</td>
                <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                  {log.targetType} · {log.targetId.slice(0, 8)}…
                </td>
                <td className="px-6 py-4 text-gray-600">{log.actor?.email ?? <span className="text-gray-400">system</span>}</td>
                <td className="px-6 py-4 text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="text-center text-gray-500 py-12">No audit log entries found.</p>}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={pageHref(p)}
              className={`px-3 py-1.5 rounded-lg ${
                p === page ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
