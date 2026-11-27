import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { CatalogImportPanel } from '@/components/admin/catalog-import-panel';
import { RunsAutoRefresh } from '@/components/admin/runs-auto-refresh';
import { ImportHistoryTable } from '@/components/admin/import-history-table';
import { ImportWorkspace } from '@/components/admin/import-workspace';
import { ImportedProductList } from '@/components/admin/imported-product-list';
import { AdminPageHeader } from '@/components/ui/admin-form';

export const dynamic = 'force-dynamic';

export default async function AdminImportsPage() {
  const cookieHeader = (await cookies()).toString();
  const [runs, products, options] = await Promise.all([
    api.adminListImportRuns(100, cookieHeader),
    api.adminProductPage({ importedOnly: 'true' }, cookieHeader),
    api.adminImportOptions(cookieHeader),
  ]);
  const hasInFlight = runs.some((run) => run.status === 'QUEUED' || run.status === 'RUNNING');

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <AdminPageHeader title="Catalog imports" />

      <RunsAutoRefresh active={hasInFlight} />
      <ImportWorkspace
        form={<CatalogImportPanel initialOptions={options} runs={runs} />}
        products={<ImportedProductList initialPage={products} options={options} />}
        history={<ImportHistoryTable runs={runs} hasInFlight={hasInFlight} />}
      />
    </div>
  );
}
