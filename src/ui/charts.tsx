import { useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table2, LineChart as LineIcon } from 'lucide-react';

/** Validated against the dark chart surface. Series keep these colours whatever the filter. */
export const SERIES = ['#e85a20', '#2f93d8'];
const AXIS = { fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#8d97a3' };

type Row = Record<string, string | number | null>;
export interface Series { key: string; label: string; format?: (v: number) => string }

function Tip({ active, payload, label, series, labelFormat }: { active?: boolean; payload?: { dataKey: string; value: number; color?: string }[]; label?: string | number; series: Series[]; labelFormat?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-line bg-black/95 px-2.5 py-1.5 text-xs shadow-xl">
      <div className="hud mb-0.5">{labelFormat && label !== undefined ? labelFormat(label) : label}</div>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return <div key={p.dataKey} className="flex items-center gap-2 text-bone">{series.length > 1 && <i className="inline-block h-2 w-2" style={{ background: p.color }} />}<span className="num font-semibold">{s?.format ? s.format(p.value) : p.value}</span>{series.length > 1 && <span className="text-muted">{s?.label}</span>}</div>;
      })}
    </div>
  );
}

function Frame({ title, subtitle, data, x, series, xFormat, children, height = 220 }: { title: string; subtitle?: string; data: Row[]; x: string; series: Series[]; xFormat?: (v: string | number) => string; children: ReactNode; height?: number }) {
  const [table, setTable] = useState(false);
  return (
    <figure className="m-0 min-w-0 border border-line bg-[#0d0f12] p-3" data-testid="chart">
      <figcaption className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="display text-xl">{title}</div>{subtitle && <div className="text-xs text-muted">{subtitle}</div>}</div>
        <button type="button" className="btn btn-ghost btn-sm btn-icon shrink-0" aria-pressed={table} aria-label={table ? `Show ${title} as a chart` : `Show ${title} as a table`} onClick={() => setTable((t) => !t)}>{table ? <LineIcon size={15} /> : <Table2 size={15} />}</button>
      </figcaption>
      {series.length > 1 && !table && (
        <div className="mb-1 flex flex-wrap gap-3">{series.map((s, i) => <span key={s.key} className="flex items-center gap-1.5 text-xs text-silver"><i className="inline-block h-0.5 w-4" style={{ background: SERIES[i] }} />{s.label}</span>)}</div>
      )}
      {table ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="hud"><th className="py-1 pr-3 font-medium">Period</th>{series.map((s) => <th key={s.key} className="py-1 pr-3 text-right font-medium">{s.label}</th>)}</tr></thead>
            <tbody>{[...data].reverse().map((r, i) => <tr key={i} className="border-t border-line/50"><td className="py-1 pr-3">{xFormat ? xFormat(r[x] as string) : r[x]}</td>{series.map((s) => <td key={s.key} className="num py-1 pr-3 text-right text-bone">{r[s.key] == null ? '—' : s.format ? s.format(r[s.key] as number) : r[s.key]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}><ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer></div>
      )}
    </figure>
  );
}

const grid = <CartesianGrid stroke="#1f252b" vertical={false} />;

export function BarsChart({ title, subtitle, data, x, y, xFormat, height }: { title: string; subtitle?: string; data: Row[]; x: string; y: Series; xFormat?: (v: string | number) => string; height?: number }) {
  return (
    <Frame title={title} subtitle={subtitle} data={data} x={x} series={[y]} xFormat={xFormat} height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
        {grid}
        <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: '#2c333b' }} tickFormatter={xFormat} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={y.format ? (v) => compact(v) : undefined} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,.05)' }} content={<Tip series={[y]} labelFormat={xFormat} />} />
        <Bar dataKey={y.key} fill={SERIES[0]} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}

export function LinesChart({ title, subtitle, data, x, series, xFormat, height, target, area }: { title: string; subtitle?: string; data: Row[]; x: string; series: Series[]; xFormat?: (v: string | number) => string; height?: number; target?: number; area?: boolean }) {
  const yFmt = series[0]?.format ? (v: number) => compact(v) : undefined;
  if (area && series.length === 1) {
    return (
      <Frame title={title} subtitle={subtitle} data={data} x={x} series={series} xFormat={xFormat} height={height}>
        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs><linearGradient id="emberFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={SERIES[0]} stopOpacity=".28" /><stop offset="1" stopColor={SERIES[0]} stopOpacity="0" /></linearGradient></defs>
          {grid}
          <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: '#2c333b' }} tickFormatter={xFormat} minTickGap={28} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} tickFormatter={yFmt} />
          <Tooltip cursor={{ stroke: '#48525d' }} content={<Tip series={series} labelFormat={xFormat} />} />
          <Area type="monotone" dataKey={series[0].key} stroke={SERIES[0]} strokeWidth={2} fill="url(#emberFill)" connectNulls isAnimationActive={false} dot={data.length < 30 ? { r: 3, fill: SERIES[0], strokeWidth: 0 } : false} />
        </AreaChart>
      </Frame>
    );
  }
  return (
    <Frame title={title} subtitle={subtitle} data={data} x={x} series={series} xFormat={xFormat} height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: '#2c333b' }} tickFormatter={xFormat} minTickGap={28} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} tickFormatter={yFmt} />
        <Tooltip cursor={{ stroke: '#48525d' }} content={<Tip series={series} labelFormat={xFormat} />} />
        {target !== undefined && <ReferenceLine y={target} stroke="#8d97a3" strokeDasharray="4 4" />}
        {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={SERIES[i % 2]} strokeWidth={2} connectNulls isAnimationActive={false} dot={data.length < 30 ? { r: 3, fill: SERIES[i % 2], strokeWidth: 0 } : false} />)}
      </LineChart>
    </Frame>
  );
}

const compact = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 10) / 10));
