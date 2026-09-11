import { useState } from 'react'

export default function ProgressChart({ points, metric, title, unit = '' }) {
  const [selected, setSelected] = useState(null)
  const rows = points.filter(p => Number.isFinite(Number(p[metric])))
  if (!rows.length) return <p className="progress-empty">No saved {title.toLowerCase()} data yet.</p>
  const max = Math.max(1, ...rows.map(p => Number(p[metric])))
  const x = i => 38 + i * 620 / Math.max(1, rows.length - 1)
  const y = value => 170 - Number(value) * 140 / max
  const active = rows[Math.min(selected ?? rows.length - 1, rows.length - 1)]
  return <figure className="progress-chart">
    <figcaption>{title}<strong>{active.week} · {Number(active[metric]).toLocaleString()} {unit}</strong></figcaption>
    <svg viewBox="0 0 700 208" role="img" aria-label={`${title}: select a point to read exact weekly values`}>
      {[0, .5, 1].map(p => <g key={p}><line x1="38" x2="658" y1={y(p * max)} y2={y(p * max)} /><text x="2" y={y(p * max) + 4}>{Math.round(p * max)}</text></g>)}
      <polyline points={rows.map((p, i) => `${x(i)},${y(p[metric])}`).join(' ')} />
      {rows.map((p, i) => <circle key={p.week} cx={x(i)} cy={y(p[metric])} r="5" tabIndex="0" role="button" aria-label={`Week ${p.week}: ${p[metric]} ${unit}`} onFocus={() => setSelected(i)} onMouseEnter={() => setSelected(i)} onClick={() => setSelected(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(i) }}><title>{p.week}: {p[metric]} {unit}</title></circle>)}
      <text x="38" y="200">{rows[0].week}</text><text x="658" y="200" textAnchor="end">{rows.at(-1).week}</text>
    </svg>
  </figure>
}
