import { useCallback, useEffect, useState } from 'react'
import { clientApi } from '../api/client'
import { coachApi } from '../api/coach'
import ProgressChart from './ProgressChart'
import PhotoJournal from './PhotoJournal'
import './progress.css'

export const ratings = [['energy', 'Energy'], ['sleep_quality', 'Sleep quality'], ['hunger', 'Hunger'], ['digestion', 'Digestion'], ['stress', 'Stress'], ['recovery', 'Recovery'], ['strength', 'Strength'], ['workout_performance', 'Workout performance'], ['motivation', 'Motivation'], ['adherence', 'Adherence'], ['overall_wellbeing', 'Overall well-being']]
const feedbackFields = [['observations', 'Observations'], ['adjustments', 'Adjustments'], ['instructions', 'Instructions'], ['next_week_priorities', 'Next-week priorities']]

export function CheckInSchedule({ schedule }) {
  if (!schedule) return null
  return <section className="progress-schedule" aria-label="Check-in schedule"><div><small>CURRENT CHECK-IN</small><strong>{schedule.due_on}</strong><span>{schedule.current_status} · {schedule.timezone}</span></div><div><small>NEXT CHECK-IN</small><strong>{schedule.next_due_on}</strong><span>Every {schedule.day_of_week} · seven-day cycle</span></div><div><small>PREVIOUS DUE</small><strong>{schedule.previous_due_on}</strong><span>{schedule.missed_count} missed · {schedule.consecutive_missed} consecutive</span></div></section>
}

function Feedback({ entry, clientId, token, onSaved }) {
  const [draft, setDraft] = useState(entry.feedback ?? Object.fromEntries(feedbackFields.map(([key]) => [key, ''])))
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async e => {
    e.preventDefault(); setSaving(true); setNotice('')
    try {
      const result = await coachApi.saveFeedback(clientId, entry.id, Object.fromEntries(feedbackFields.map(([key]) => [key, draft[key] || ''])), token)
      onSaved(result); setNotice('Feedback saved to this client and week only.')
    } catch (error) { setNotice(error.message) } finally { setSaving(false) }
  }
  return clientId ? <form className="weekly-feedback" onSubmit={submit}><h3>Coach review · week {entry.period_start}</h3>{feedbackFields.map(([key, label]) => <label key={key}>{label}<textarea rows="2" maxLength="4000" value={draft[key] || ''} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} /></label>)}<button className="lime-button" disabled={saving}>Save weekly feedback</button><p role="status">{notice}</p></form> : <section className="weekly-feedback"><h3>Coach review</h3>{entry.feedback ? <><dl>{feedbackFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{entry.feedback[key] || 'None recorded'}</dd></div>)}</dl><small>Updated {new Date(entry.feedback.updated_at).toLocaleString()}</small></> : <p>Your coach has not reviewed this week yet.</p>}</section>
}

export function CheckInHistory({ load, clientId, token, revision = 0, onSchedule, onFeedbackSaved }) {
  const [entries, setEntries] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [metric, setMetric] = useState('energy')
  const [schedule, setSchedule] = useState(null)
  useEffect(() => {
    let active = true
    setBusy(true); setError('')
    load(0).then(result => {
      if (!active) return
      setEntries(result.items); setHasMore(result.has_more); setSchedule(result.schedule); onSchedule?.(result.schedule)
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [load, revision, onSchedule])
  const more = async () => {
    setBusy(true)
    try { const result = await load(entries.length); setEntries(e => [...e, ...result.items]); setHasMore(result.has_more) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const saveFeedback = (entryId, feedback) => {
    setEntries(rows => rows.map(entry => entry.id === entryId ? { ...entry, feedback } : entry))
    onFeedbackSaved?.()
  }
  return <section className="progress-history" aria-label="Weekly check-in history">
    {clientId && <CheckInSchedule schedule={schedule} />}
    <section className="panel progress-panel"><h2>Weekly history</h2><p>Each week stays separate. Original energy and sleep answers remain on their 1–5 scale. Detailed ratings use 1–10.</p>
      {error && <p role="alert">{error}</p>}
      <label>Detailed rating<select value={metric} onChange={e => setMetric(e.target.value)}>{ratings.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <ProgressChart title={ratings.find(([key]) => key === metric)[1]} metric="rating" unit="/ 10" points={[...entries].reverse().filter(e => e.ratings?.[metric] != null).map(e => ({ week: e.period_start, rating: e.ratings[metric] }))} />
      {hasMore && <p className="progress-caption">Chart shows loaded weeks. Load older weeks below to extend it.</p>}
      {!entries.length && <p>{busy ? 'Loading check-ins…' : 'No check-ins submitted yet.'}</p>}
      {entries.map(entry => <details className="weekly-record" key={entry.id}><summary>Week {entry.period_start} · {entry.sentiment} · {entry.feedback ? 'Reviewed' : 'Awaiting coach review'}</summary><p className="progress-caption">Submitted {entry.submitted_at ? new Date(entry.submitted_at).toLocaleString(undefined, { timeZone: schedule?.timezone || 'UTC' }) : '—'} · questionnaire v{entry.questionnaire_version ?? 1}</p><div className="progress-stats"><span>Original energy <strong>{entry.energy_score}/5</strong></span><span>Original sleep <strong>{entry.sleep_score}/5</strong></span></div><dl className="rating-history">{ratings.filter(([key]) => entry.ratings?.[key] != null).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{entry.ratings[key]}/10</dd></div>)}</dl><dl>{[['observation', 'What went well'], ['concern', 'Concern'], ['challenges', 'Challenges'], ['additional_comments', 'Additional comments']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{entry[key] || 'None recorded'}</dd></div>)}</dl><Feedback entry={entry} clientId={clientId} token={token} onSaved={feedback => saveFeedback(entry.id, feedback)} /></details>)}
      {hasMore && <button disabled={busy} onClick={more}>Load older check-ins</button>}
    </section>
  </section>
}

export default function WeeklyCheckIns({ checkIns, onSave, schedule, profile }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const current = checkIns?.find(e => e.period_start === schedule?.period_start)
  const submit = async e => {
    e.preventDefault(); setBusy(true); setMessage('')
    const form = new FormData(e.currentTarget)
    try {
      await onSave({ energy_score: Number(form.get('energy_score')), sleep_score: Number(form.get('sleep_score')), sentiment: form.get('sentiment'), observation: form.get('observation'), concern: form.get('concern') || null, questionnaire_version: 2,
        ratings: Object.fromEntries(ratings.map(([key]) => [key, Number(form.get(key))])), challenges: form.get('challenges'), additional_comments: form.get('additional_comments') })
      setRevision(r => r + 1); setMessage('This week’s check-in saved. Previous weeks are unchanged.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  return <section className="client-page progress-workspace"><div className="client-page-heading"><p className="kicker">CLIENT / WEEKLY CHECK-IN</p><h2>Check in with yourself.</h2><p>Your answers and photos stay between you and your assigned coach.</p></div><CheckInSchedule schedule={schedule} />
    <form className="panel progress-panel" onSubmit={submit} key={current?.id || schedule?.period_start || 'current'}><h2>{current ? 'Update this week’s check-in' : 'Your week, honestly'}</h2><p>All ratings require your answer. Higher means more of the named signal; high hunger or stress does not mean better.</p><div className="rating-fields">
      {[['energy_score', 'Energy this week — original scale'], ['sleep_score', 'Sleep quality — original scale']].map(([key, label]) => <label key={key}>{label}<select name={key} required defaultValue={current?.[key] ?? ''}><option value="" disabled>Choose 1–5</option>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>)}
      {ratings.map(([key, label]) => <label key={key}>{label} · 1–10<select name={key} required defaultValue={current?.ratings?.[key] ?? ''}><option value="" disabled>Choose a rating</option>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n}>{n}</option>)}</select></label>)}
    </div><label>How has progress felt?<select name="sentiment" required defaultValue={current?.sentiment ?? ''}><option value="" disabled>Choose</option>{['excellent', 'good', 'okay', 'low'].map(s => <option key={s}>{s}</option>)}</select></label><label>What went well?<textarea name="observation" required maxLength="1000" defaultValue={current?.observation || ''} /></label><label>Anything your coach should know?<textarea name="concern" maxLength="1000" defaultValue={current?.concern || ''} /></label><label>Challenges<textarea name="challenges" maxLength="2000" defaultValue={current?.challenges || ''} /></label><label>Additional comments<textarea name="additional_comments" maxLength="2000" defaultValue={current?.additional_comments || ''} /></label><button className="lime-button" disabled={busy}>Submit check-in</button><p role="status">{message}</p></form>
    <PhotoJournal profile={profile} checkIns={checkIns} />
    <CheckInHistory load={clientApi.getCheckIns} revision={revision} />
  </section>
}

export function CoachCheckIns({ clientId, token, onFeedbackSaved }) {
  const load = useCallback(offset => coachApi.getCheckIns(clientId, token, offset), [clientId, token])
  return <CheckInHistory key={clientId} load={load} clientId={clientId} token={token} onFeedbackSaved={onFeedbackSaved} />
}
