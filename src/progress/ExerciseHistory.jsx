import { useEffect, useState } from 'react'
import ProgressChart from './ProgressChart'

export default function ExerciseHistory({ load, revision = 0 }) {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setData(null)
    setError('')
    load().then(result => { if (active) setData(result) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [load, revision])
  const exercise = data?.items.find(e => e.id === selected) ?? data?.items[0]
  return <section className="panel progress-panel" aria-label="Exercise performance history">
    <header><div><p className="kicker">STRENGTH & VOLUME HISTORY</p><h2>Your work, over time.</h2><span>Saved sets only. Load = heaviest set; reps and volume = weekly totals. Best set = highest load, then reps.</span></div></header>
    {error ? <p role="alert">{error}</p> : !data ? <p>Loading history…</p> : !exercise ? <p className="progress-empty">Log your first working sets to build exercise history.</p> : <div className="progress-body">
      <label>Exercise<select value={exercise.id} onChange={e => setSelected(e.target.value)}>{data.items.map(e => <option value={e.id} key={e.id}>{e.name}</option>)}</select></label>
      <div className="progress-stats"><span><small>BEST SET</small><strong>{exercise.best_set.load_kg} kg × {exercise.best_set.reps}</strong>{exercise.best_set.date}</span><span><small>TRAINING FREQUENCY</small><strong>{exercise.training_days} days</strong>{exercise.weeks.length} recorded weeks</span></div>
      <div className="progress-chart-grid">{[['load_kg', 'Load progress', 'kg'], ['volume_kg', 'Volume progress', 'kg'], ['reps', 'Rep progress', 'reps']].map(([metric, title, unit]) => <div key={metric}><ProgressChart points={exercise.weeks} metric={metric} title={title} unit={unit} /><p className="progress-caption">{exercise.trends[metric].replaceAll('_', ' ')} · latest two recorded weeks</p></div>)}</div>
      <details><summary>Complete set history</summary><div className="progress-table-scroll"><table><thead><tr><th>Date</th><th>Status</th><th>Set</th><th>Reps</th><th>Load (kg)</th><th>Volume (kg)</th></tr></thead><tbody>{exercise.history.flatMap(row => row.sets.map(set => <tr key={`${row.session_id}-${row.exercise_id}-${set.set_number}`}><td>{row.date}</td><td>{row.status.replaceAll('_', ' ')}</td><td>{set.set_number}</td><td>{set.reps}</td><td>{set.load_kg}</td><td>{Number((set.reps * set.load_kg).toFixed(2))}</td></tr>))}</tbody></table></div></details>
    </div>}
  </section>
}
