export function StatusBreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
}) {
  const hasData = rows.some((r) => r.value > 0);

  return (
    <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] p-5">
      <h2 className="font-bold text-admin-heading font-lato mb-3">{title}</h2>
      {!hasData ? (
        <p className="text-sm text-admin-muted font-lato">Nothing yet</p>
      ) : (
        <dl className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between text-sm font-lato">
              <dt className="text-admin-muted">{row.label}</dt>
              <dd className="font-semibold text-admin-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
