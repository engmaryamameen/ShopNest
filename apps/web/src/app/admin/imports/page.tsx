import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { CatalogImportPanel } from '@/components/admin/catalog-import-panel';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  QUEUED: 'bg-amber-100 text-amber-800',
  RUNNING: 'bg-blue-100 text-blue-800',
  SUCCEEDED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

const SOURCE_LABELS: Record<string, string> = {
  DUMMY_JSON: 'DummyJSON',
  OPEN_FOOD_FACTS: 'Open Food Facts',
  AMAZON: 'Amazon',
};

export default async function AdminImportsPage() {
  const cookieHeader = (await cookies()).toString();
  const runs = await api.adminListImportRuns(20, cookieHeader);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Catalog imports</h1>
      <p className="text-gray-500 mb-8">
        Bring in canonical catalog data from a real supplier — DummyJSON (general merchandise) or Open Food Facts
        (groceries). The catalog itself stays admin-curated: nothing runs automatically, and every product you add or
        edit by hand here is never touched by an import.
      </p>

      <CatalogImportPanel />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <h2 className="font-semibold text-gray-900 px-6 pt-6 pb-2">Recent runs</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Started</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Source</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Scope</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Progress</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Created</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Updated</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Unchanged</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Skipped</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="px-6 py-4 text-gray-500">{new Date(run.startedAt).toLocaleString()}</td>
                <td className="px-6 py-4 text-gray-700">{SOURCE_LABELS[run.source] ?? run.source}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[run.status]}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">
                  {run.categoryScope.length > 0 ? run.categoryScope.join(', ') : 'all categories'}
                  {run.maxRecords ? ` · max ${run.maxRecords}` : ''}
                  {run.minImageCount ? ` · ≥${run.minImageCount} images` : ''}
                </td>
                <td className="px-6 py-4">
                  {run.processedCount}/{run.scopedCount}
                  <span className="text-gray-400"> of {run.discoveredCount} discovered</span>
                </td>
                <td className="px-6 py-4 text-green-700">{run.createdCount}</td>
                <td className="px-6 py-4 text-blue-700">{run.updatedCount}</td>
                <td className="px-6 py-4 text-gray-500">{run.unchangedCount}</td>
                <td className="px-6 py-4 text-amber-700">{run.skippedCount}</td>
                <td className="px-6 py-4 text-red-600 text-xs max-w-xs truncate">{run.errorMessage ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <p className="text-center text-gray-500 py-12">No import runs yet.</p>}
      </div>
    </div>
  );
}
