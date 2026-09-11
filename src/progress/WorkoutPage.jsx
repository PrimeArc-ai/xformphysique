import { useEffect, useState } from 'react'
import { clientApi } from '../api/client'
import ExerciseHistory from './ExerciseHistory'
import './progress.css'

export default function WorkoutPage({ workout, onSave }) {
  const [logs, setLogs] = useState({})
  const [note, setNote] = useState('')
  const [difficulty, setDifficulty] = useState('moderate')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    setLogs(Object.fromEntries((workout?.exercises ?? []).map(e => [e.plan_exercise_id, e.sets?.length ? e.sets.map(s => ({ ...s })) : Array.from({ length: e.prescription.sets }, (_, i) => ({ set_number: i + 1, reps: '', load_kg: '' }))])))
    setNote(workout?.note ?? '')
    setDifficulty(workout?.overall_difficulty ?? 'moderate')
  }, [workout])
  const update = (id, index, field, value) => setLogs(current => ({ ...current, [id]: current[id].map((s, i) => i === index ? { ...s, [field]: value } : s) }))
  const volume = sets => Number(sets.reduce((total, s) => total + Number(s.reps) * Number(s.load_kg), 0).toFixed(2))
  const save = async status => {
    setSaving(true); setMessage('')
    try {
      const exercise_logs = Object.entries(logs).map(([plan_exercise_id, sets]) => ({ plan_exercise_id, sets: sets.filter(s => s.reps !== '' && s.load_kg !== '').map(s => ({ set_number: s.set_number, reps: Number(s.reps), load_kg: Number(s.load_kg), difficulty: s.difficulty || difficulty })) }))
      const partial = Object.values(logs).flat().some(s => (s.reps === '') !== (s.load_kg === ''))
      if (partial) throw new Error('Enter both reps and load for each started set. Use 0 kg for bodyweight.')
      if (status === 'completed' && Object.values(logs).some(sets => !sets.length || sets.some(s => s.reps === '' || s.load_kg === ''))) throw new Error('Fill each set or remove unused rows before completing.')
      await onSave(workout.session_id, { status, note, overall_difficulty: difficulty, exercise_logs })
      setRevision(r => r + 1)
      setMessage(status === 'completed' ? 'Session completed and saved.' : 'Draft saved. You can continue later.')
    } catch (e) { setMessage(e.message) } finally { setSaving(false) }
  }
  return <section className="client-page progress-workspace">
    <div className="client-page-heading"><p className="kicker">CLIENT / TRAINING</p><h2>{workout ? workout.title : 'Workout plan pending.'}</h2><p>{workout ? `${workout.date} · ${workout.week_label} · ${workout.status.replaceAll('_', ' ')}` : 'Your coach has not assigned a workout for today. Your earlier performance stays available below.'}</p></div>
    {workout && <form onSubmit={e => { e.preventDefault(); save('completed') }}>
      <p className="progress-caption">Coach notes: {workout.coach_note || 'None recorded'}</p>
      {(workout.exercises ?? []).map(exercise => <fieldset className="panel progress-panel" key={exercise.plan_exercise_id}><legend>{exercise.name}</legend><p>{exercise.prescription.sets} × {exercise.prescription.reps} · {exercise.prescription.rest_seconds ?? '—'} sec rest</p>{exercise.prescription.coach_note && <p>{exercise.prescription.coach_note}</p>}
        <div className="set-labels"><span>SET</span><span>REPS</span><span>LOAD · KG</span><span>VOLUME · KG</span><span /></div>
        {(logs[exercise.plan_exercise_id] ?? []).map((set, i) => <div className="set-editor" key={set.set_number}><strong>{set.set_number}</strong><input type="number" min="0" max="200" step="1" aria-label={`${exercise.name} set ${set.set_number} reps`} value={set.reps} onChange={e => update(exercise.plan_exercise_id, i, 'reps', e.target.value)} /><input type="number" min="0" max="1000" step="0.1" aria-label={`${exercise.name} set ${set.set_number} load`} value={set.load_kg} onChange={e => update(exercise.plan_exercise_id, i, 'load_kg', e.target.value)} /><output>{set.reps !== '' && set.load_kg !== '' ? Number((set.reps * set.load_kg).toFixed(2)) : '—'}</output><button type="button" aria-label={`Remove ${exercise.name} set ${set.set_number}`} onClick={() => setLogs(current => ({ ...current, [exercise.plan_exercise_id]: current[exercise.plan_exercise_id].filter((_, index) => index !== i).map((s, index) => ({ ...s, set_number: index + 1 })) }))}>×</button></div>)}
        <div className="progress-actions"><button type="button" disabled={(logs[exercise.plan_exercise_id]?.length ?? 0) >= 20} onClick={() => setLogs(c => ({ ...c, [exercise.plan_exercise_id]: [...(c[exercise.plan_exercise_id] ?? []), { set_number: (c[exercise.plan_exercise_id]?.length ?? 0) + 1, reps: '', load_kg: '' }] }))}>Add set</button><strong>Exercise volume: {volume(logs[exercise.plan_exercise_id] ?? [])} kg</strong></div>
      </fieldset>)}
      <section className="panel progress-panel"><label>Session difficulty<select value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></select></label><label>Session note<textarea maxLength="1000" value={note} onChange={e => setNote(e.target.value)} /></label><div className="progress-actions"><strong>Total: {volume(Object.values(logs).flat())} kg</strong><button type="button" disabled={saving} onClick={() => save('in_progress')}>Save draft</button><button className="lime-button" disabled={saving}>Complete session</button></div><p role="status">{message}</p></section>
    </form>}
    <ExerciseHistory load={clientApi.getWorkoutHistory} revision={revision} />
  </section>
}
