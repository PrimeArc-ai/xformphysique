import { useMemo, useState } from 'react'

const today = new Date().toISOString().slice(0, 10)

const formatDate = (value) => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}).format(new Date(`${value}T12:00:00`))

function BodyTracker({ entries, onAddEntry }) {
  const [form, setForm] = useState({ date: today, weight: '', waist: '' })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const recentEntries = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  )
  const trendEntries = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-10),
    [entries],
  )

  const trend = useMemo(() => {
    if (trendEntries.length < 2) return null
    const first = trendEntries[0].weight
    const last = trendEntries.at(-1).weight
    const difference = Number((last - first).toFixed(1))
    return { difference, first, last }
  }, [trendEntries])

  const chartPoints = useMemo(() => {
    if (!trendEntries.length) return ''
    const weights = trendEntries.map((entry) => entry.weight)
    const min = Math.min(...weights)
    const max = Math.max(...weights)
    const span = max - min || 1
    return trendEntries.map((entry, index) => {
      const x = 22 + (index * 596) / Math.max(trendEntries.length - 1, 1)
      const y = 152 - ((entry.weight - min) / span) * 108
      return `${x},${y}`
    }).join(' ')
  }, [trendEntries])

  const submitEntry = async (event) => {
    event.preventDefault()
    const weight = Number(form.weight)
    if (!Number.isFinite(weight) || weight <= 0) return

    setSaving(true)
    setError('')
    try {
      await onAddEntry({
        date: form.date,
        weight,
        waist: form.waist ? Number(form.waist) : null,
      })
      setForm((current) => ({ ...current, weight: '', waist: '' }))
      setSaved(true)
    } catch (requestError) {
      setError(requestError.message || 'Could not save body progress.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="tracker-feature" aria-labelledby="tracker-title">
      <header className="feature-heading">
        <div><p className="kicker">CLIENT / BODY TRACKER</p><h2 id="tracker-title">Track signal. See change.</h2><p>Daily weight first. Waist stays optional.</p></div>
        <span className="local-state"><i />LIVE API</span>
      </header>

      <section className="tracker-summary-row" aria-label="Body tracker summary">
        <article><p>CURRENT WEIGHT</p><strong>{recentEntries[0]?.weight.toFixed(1) ?? '—'}<small> kg</small></strong><span>Latest recorded entry</span></article>
        <article><p>RECORDED TREND</p><strong className={trend?.difference <= 0 ? 'lime-text' : 'warning-text'}>{trend ? `${trend.difference > 0 ? '+' : '−'}${Math.abs(trend.difference).toFixed(1)}` : '—'}<small> kg</small></strong><span>{trend ? 'Across recorded history' : 'Add two entries to calculate'}</span></article>
        <article><p>MEASUREMENTS</p><strong>{recentEntries.filter((entry) => entry.waist != null).length}</strong><span>Waist entries enabled</span></article>
      </section>

      <section className="tracker-grid">
        <article className="panel log-panel">
          <header><div><p className="kicker">LOG BODY PROGRESS</p><span>Record today’s data.</span></div></header>
          <form className="tracker-form" onSubmit={submitEntry}>
            <label>Date<input type="date" value={form.date} max={today} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required /></label>
            <label>Weight <div className="input-with-unit"><input type="number" value={form.weight} min="0.1" step="0.1" placeholder="68.4" onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))} required /><span>kg</span></div></label>
            <label className="wide-field"><span>Waist <em>OPTIONAL / ENABLED MEASUREMENT</em></span><div className="input-with-unit"><input type="number" value={form.waist} min="0.1" step="0.1" placeholder="71" onChange={(event) => setForm((current) => ({ ...current, waist: event.target.value }))} /><span>cm</span></div></label>
            <button className="lime-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save body progress'} <span aria-hidden="true">↗</span></button>
          </form>
          <p className="form-state" aria-live="polite">{error || (saved ? 'Body progress saved to your XForm record.' : 'Entries save to your private coaching record.')}</p>
        </article>

        <article className="panel tracker-chart-panel">
          <header><div><p className="kicker">BODY SIGNAL</p><span>Weight / recent entries</span></div><span className="range-label">{trendEntries.length} RECORDS</span></header>
          {trendEntries.length ? <><div className="tracker-chart" aria-label="Weight history trend"><svg viewBox="0 0 640 190" preserveAspectRatio="none"><defs><linearGradient id="trackerFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b8ff2b" stopOpacity=".16" /><stop offset="1" stopColor="#b8ff2b" stopOpacity="0" /></linearGradient></defs><path className="tracker-grid-line" d="M0 35H640M0 96H640M0 157H640" /><polygon points={`${chartPoints} 618,174 22,174`} fill="url(#trackerFill)" /><polyline points={chartPoints} /></svg><span>{trendEntries[0].weight.toFixed(1)} kg</span><strong>{trendEntries.at(-1).weight.toFixed(1)} kg</strong></div><footer><span>{formatDate(trendEntries[0].date)}</span><span>{trend?.difference <= 0 ? 'moving down' : 'moving up'}</span><span>{formatDate(trendEntries.at(-1).date)}</span></footer></> : <div className="tracker-empty"><strong>No body data yet.</strong><span>First saved entry starts your signal.</span></div>}
        </article>
      </section>

      <article className="panel history-panel">
        <header><div><p className="kicker">RECORDED HISTORY</p><span>Newest entries first.</span></div><span className="range-label">{recentEntries.length} TOTAL</span></header>
        {recentEntries.length ? <div className="history-table" role="table" aria-label="Recorded body measurements"><div className="history-head" role="row"><span>DATE</span><span>WEIGHT</span><span>WAIST</span><span>STATUS</span></div>{recentEntries.map((entry, index) => <div className="history-row" role="row" key={entry.id}><span>{formatDate(entry.date)}</span><strong>{entry.weight.toFixed(1)} kg</strong><span>{entry.waist != null ? `${entry.waist.toFixed(1)} cm` : '—'}</span><span className={index === 0 ? 'latest-tag' : 'recorded-tag'}>{index === 0 ? 'LATEST' : 'RECORDED'}</span></div>)}</div> : <div className="tracker-empty"><strong>No body data yet.</strong><span>Use form above to record first entry.</span></div>}
      </article>
    </section>
  )
}

export default BodyTracker
