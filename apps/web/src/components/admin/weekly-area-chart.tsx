import { formatPrice } from '@/lib/format-price';

interface WeeklyAreaChartProps {
  /** Oldest first — must be exactly what the dashboard was given, no
   * reordering or filtering here. */
  data: Array<{ date: string; label: string; revenueCents: number }>;
}

const WIDTH = 640;
const HEIGHT = 200;
const PADDING_X = 12;
const PADDING_Y = 16;

/** A real, hand-built SVG area chart for the last 7 days of revenue — no
 * charting library, since this is the one chart in the app and a hand-
 * rolled version stays lighter and easier to match to an exact design
 * than pulling in a general-purpose chart dependency for it. Highlights
 * the real peak day; renders no callout at all when every day is $0
 * rather than pointing at an arbitrary "peak" of nothing. */
export function WeeklyAreaChart({ data }: WeeklyAreaChartProps) {
  const values = data.map((d) => d.revenueCents);
  const max = Math.max(...values);
  const hasActivity = max > 0;
  const scaleMax = hasActivity ? max : 1;

  const points = data.map((d, i) => {
    const x = data.length === 1 ? WIDTH / 2 : PADDING_X + (i / (data.length - 1)) * (WIDTH - PADDING_X * 2);
    const y = HEIGHT - PADDING_Y - (d.revenueCents / scaleMax) * (HEIGHT - PADDING_Y * 2);
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${HEIGHT} L ${points[0].x.toFixed(1)} ${HEIGHT} Z`;

  const peakIndex = hasActivity ? values.indexOf(max) : -1;
  const peak = peakIndex >= 0 ? points[peakIndex] : null;

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT + 28}`} className="w-full h-auto" role="img" aria-label="Revenue for the last 7 days">
        <defs>
          <linearGradient id="weeklyAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4EA674" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4EA674" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#weeklyAreaGradient)" />
        <path d={linePath} fill="none" stroke="#4EA674" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={p.x}
            cy={p.y}
            r={i === peakIndex ? 5 : 3}
            fill={i === peakIndex ? '#4EA674' : '#ffffff'}
            stroke="#4EA674"
            strokeWidth={i === peakIndex ? 0 : 2}
          />
        ))}

        {points.map((p) => (
          <text key={p.date} x={p.x} y={HEIGHT + 20} textAnchor="middle" fontFamily="Nunito" fontSize="12" fill="#023337" fillOpacity={0.5}>
            {p.label}
          </text>
        ))}
      </svg>

      {peak && (
        <div
          className="absolute -translate-x-1/2 -translate-y-full bg-white rounded-lg shadow-[0_2px_2px_rgba(0,0,0,0.14)] px-3 py-1.5 pointer-events-none whitespace-nowrap"
          style={{ left: `${(peak.x / WIDTH) * 100}%`, top: `${(peak.y / (HEIGHT + 28)) * 100}%`, marginTop: '-8px' }}
        >
          <p className="text-xs font-medium text-admin-ink font-lato">{peak.label}</p>
          <p className="text-xs font-medium text-admin-ink font-lato">{formatPrice(peak.revenueCents)}</p>
        </div>
      )}
    </div>
  );
}
