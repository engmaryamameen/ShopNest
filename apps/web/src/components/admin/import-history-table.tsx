'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AdminInput } from '@/components/ui/admin-form';
import { ResponsiveMenu } from '@/components/ui/responsive-menu';
import { ToastMessage } from '@/components/ui/toast';
import type { CatalogImportRunResponse } from '@/lib/api-types';
import { ArchiveImportRun } from './archive-import-run';
import styles from './import-workspace.module.css';

const labels: Record<string, string> = {
  AMAZON_BERKELEY: 'Amazon Berkeley Objects',
  DUMMY_JSON: 'DummyJSON (legacy)',
  OPEN_FOOD_FACTS: 'Open Food Facts',
  OPEN_BEAUTY_FACTS: 'Open Beauty Facts',
  AMAZON: 'Amazon historical',
  DARAZ: 'Daraz',
};
const statusLabels = {
  QUEUED: 'Queued',
  RUNNING: 'Importing',
  SUCCEEDED: 'Completed',
  FAILED: 'Failed',
};
const colors = {
  QUEUED: 'bg-amber-50 text-amber-800',
  RUNNING: 'bg-blue-50 text-blue-800',
  SUCCEEDED: 'bg-green-50 text-green-800',
  FAILED: 'bg-red-50 text-red-800',
};
function categoryLabel(value: string) {
  return value
    .replace(/^en:/, '')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
export function ImportHistoryTable({
  runs,
  hasInFlight,
}: {
  runs: CatalogImportRunResponse[];
  hasInFlight: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState('');
  const filtered = runs.filter((run) =>
    [labels[run.source], run.status, ...run.categoryScope, run.id]
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  async function retry(id: string) {
    setError('');
    setRetrying(id);
    try {
      await api.retryImport(id);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetrying('');
    }
  }
  return (
    <section className={styles.list} aria-label="Import history">
      <div className={styles.listHeading}>
        <h2>Recent imports</h2>
        <span role="status">{hasInFlight ? 'Updating live' : `${runs.length} recent runs`}</span>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <AdminInput
            aria-label="Search import history"
            type="search"
            placeholder="Search by source, category or run"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {error && <ToastMessage title="Could not retry import" message={error} />}
      {!filtered.length ? (
        <div className={styles.empty}>
          <h3>{query ? 'No imports found' : 'No imports yet'}</h3>
          <p>
            {query
              ? 'Try a different source or category name.'
              : 'Your import results and progress will appear here.'}
          </p>
          {query ? (
            <button type="button" className={styles.control} onClick={() => setQuery('')}>
              Clear search
            </button>
          ) : (
            <Link href="/admin/imports?tab=new" className={styles.control}>
              Create an import
            </Link>
          )}
        </div>
      ) : (
        <div
          role="region"
          aria-label="Import runs table"
          tabIndex={0}
          className={styles.historyContainer}
        >
          <table className={styles.history}>
            <thead>
              <tr>
                <th scope="col">Source & categories</th>
                <th scope="col">Started</th>
                <th scope="col">Result</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((run) => {
                const inFlight = run.status === 'QUEUED' || run.status === 'RUNNING';
                const progress = run.scopedCount
                  ? Math.min(100, Math.round((run.processedCount / run.scopedCount) * 100))
                  : 0;
                const scope = run.categoryScope.map(categoryLabel).join(', ') || 'All categories';
                return (
                  <tr key={run.id}>
                    <td>
                      <strong className="font-medium text-gray-900">
                        {labels[run.source] ?? run.source}
                      </strong>
                      <small className={styles.historyCategory} title={scope}>
                        {scope}
                      </small>
                      <details className={styles.historyDetails}>
                        <summary>Run details</summary>
                        <p className="mt-3 max-w-80 break-words">{scope}</p>
                        <dl>
                          <dt>Requested</dt>
                          <dd>{run.maxRecords ?? run.scopedCount}</dd>
                          <dt>Processed</dt>
                          <dd>
                            {run.processedCount} / {run.scopedCount}
                          </dd>
                          <dt>Created</dt>
                          <dd>{run.createdCount}</dd>
                          <dt>Updated</dt>
                          <dd>{run.updatedCount}</dd>
                          <dt>Duplicates</dt>
                          <dd>{run.unchangedCount}</dd>
                          <dt>Skipped</dt>
                          <dd>{run.skippedCount}</dd>
                          <dt>Rejected images</dt>
                          <dd>{run.imagesRejectedCount}</dd>
                        </dl>
                        <p className="mt-3 break-all">Run {run.id}</p>
                        {run.completedAt && (
                          <p className="mt-2">
                            Finished {new Date(run.completedAt).toLocaleString()}
                          </p>
                        )}
                      </details>
                    </td>
                    <td className="whitespace-nowrap">
                      <time dateTime={run.startedAt}>
                        {new Date(run.startedAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </time>
                      <small>
                        {new Date(run.startedAt).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </small>
                    </td>
                    <td className={styles.historyResult}>
                      <span className={`${styles.badge} ${colors[run.status]}`}>
                        {statusLabels[run.status]}
                      </span>
                      <small>
                        {inFlight
                          ? `${run.processedCount} / ${run.scopedCount} processed`
                          : `${run.createdCount} imported${run.skippedCount ? ` · ${run.skippedCount} skipped` : ''}`}
                      </small>
                      {inFlight && (
                        <div
                          className={styles.progress}
                          role="progressbar"
                          aria-label="Import progress"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span style={{ width: `${progress}%` }} />
                        </div>
                      )}
                      {run.errorMessage && (
                        <details className={styles.historyDetails}>
                          <summary>Failure details</summary>
                          <p className="mt-2 max-w-64 whitespace-normal break-words text-red-700">
                            {run.errorMessage}
                          </p>
                        </details>
                      )}
                    </td>
                    <td>
                      <div className={styles.historyActions}>
                        <a href={`/admin/imports?tab=products&run=${run.id}`}>View products</a>
                        <ResponsiveMenu
                          portal
                          label={`Actions for import ${run.id.slice(0, 8)}`}
                          trigger={<span className="px-2 py-1 text-lg text-gray-500">···</span>}
                        >
                          {() => (
                            <div className="min-w-44 space-y-3 p-2 text-sm">
                              {run.status === 'FAILED' && (
                                <button
                                  type="button"
                                  disabled={!!retrying}
                                  onClick={() => retry(run.id)}
                                  className="text-[#0077b6] disabled:opacity-50"
                                >
                                  {retrying === run.id ? 'Retrying…' : 'Retry import'}
                                </button>
                              )}
                              {!inFlight && <ArchiveImportRun runId={run.id} />}
                              {inFlight && (
                                <p className="text-gray-500">Import is still running.</p>
                              )}
                            </div>
                          )}
                        </ResponsiveMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
