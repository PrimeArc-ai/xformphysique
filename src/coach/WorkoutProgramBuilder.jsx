import { useCallback, useEffect, useRef, useState } from 'react'
import { coachApi } from '../api/coach'
import {
  addDayExercise,
  addProgramDay,
  emptyProgram,
  moveExercise,
  removeDayExercise,
  removeProgramDay,
  validateProgram,
} from './workoutProgramModel'

const weekdays = [
  [1, 'Monday'],
  [2, 'Tuesday'],
  [3, 'Wednesday'],
  [4, 'Thursday'],
  [5, 'Friday'],
  [6, 'Saturday'],
  [7, 'Sunday'],
]

function localDate() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function addCalendarDays(value, numberOfDays) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + numberOfDays)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function snapshotProgram(source) {
  return {
    name: source.name || '',
    active_from: source.active_from || localDate(),
    notes: source.notes || '',
    days: [...(source.days || [])].sort((left, right) => left.position - right.position).map((day, dayIndex) => ({
      position: dayIndex + 1,
      weekday: Number(day.weekday),
      name: day.name || '',
      coach_note: day.coach_note || '',
      exercises: [...(day.exercises || [])].sort((left, right) => left.position - right.position).map((exercise, exerciseIndex) => ({
        position: exerciseIndex + 1,
        exercise_library_item_id: exercise.exercise_library_item_id || null,
        name: exercise.name || '',
        prescribed_sets: Number(exercise.prescribed_sets),
        prescribed_reps: exercise.prescribed_reps || '',
        rest_seconds: exercise.rest_seconds == null ? null : Number(exercise.rest_seconds),
        coach_note: exercise.coach_note || '',
      })),
    })),
  }
}

function FieldError({ children }) {
  return children ? <small className="program-field-error">{children}</small> : null
}

export default function WorkoutProgramBuilder({ client, accessToken }) {
  const [program, setProgram] = useState(() => emptyProgram(localDate()))
  const [workspace, setWorkspace] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadedClientId, setLoadedClientId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const publishKey = useRef(null)
  const loadRequest = useRef(0)
  const clientIdentity = useRef(client.id)
  const clientGeneration = useRef(0)
  if (clientIdentity.current !== client.id) {
    clientIdentity.current = client.id
    clientGeneration.current += 1
  }

  const operationIsCurrent = useCallback((clientId, generation) => (
    clientIdentity.current === clientId && clientGeneration.current === generation
  ), [])

  const loadWorkspace = useCallback(async () => {
    const requestId = ++loadRequest.current
    const requestedClientId = client.id
    const generation = clientGeneration.current
    setLoading(true)
    setLoadError('')
    setNotice('')
    setErrors({})
    try {
      const result = await coachApi.getWorkoutProgram(requestedClientId, accessToken)
      if (requestId !== loadRequest.current || !operationIsCurrent(requestedClientId, generation)) return
      setWorkspace(result)
      setProgram(result.draft
        ? snapshotProgram(result.draft)
        : result.active_program
          ? snapshotProgram(result.active_program)
          : emptyProgram(localDate()))
      setLoadedClientId(requestedClientId)
    } catch (error) {
      if (requestId !== loadRequest.current || !operationIsCurrent(requestedClientId, generation)) return
      setWorkspace(null)
      setLoadedClientId(requestedClientId)
      setLoadError(error.message || 'Could not load this workout program workspace.')
    } finally {
      if (requestId === loadRequest.current && operationIsCurrent(requestedClientId, generation)) setLoading(false)
    }
  }, [accessToken, client.id, operationIsCurrent])

  useEffect(() => {
    setBusy('')
    setConfirming(false)
    publishKey.current = null
    loadWorkspace()
    return () => { loadRequest.current += 1 }
  }, [loadWorkspace])

  const editProgram = updater => {
    publishKey.current = null
    setProgram(current => typeof updater === 'function' ? updater(current) : updater)
    setErrors({})
    setNotice('')
  }

  const updateProgramField = (field, value) => {
    editProgram(current => ({ ...current, [field]: value }))
  }

  const updateDay = (dayIndex, field, value) => {
    editProgram(current => ({
      ...current,
      days: current.days.map((day, index) => index === dayIndex ? { ...day, [field]: value } : day),
    }))
  }

  const updateExercise = (dayIndex, exerciseIndex, field, value) => {
    editProgram(current => ({
      ...current,
      days: current.days.map((day, index) => index === dayIndex ? {
        ...day,
        exercises: day.exercises.map((exercise, currentIndex) => currentIndex === exerciseIndex
          ? { ...exercise, [field]: value }
          : exercise),
      } : day),
    }))
  }

  const selectLibraryExercise = (dayIndex, exerciseIndex, libraryId) => {
    const selected = workspace.exercise_library.find(item => item.id === libraryId)
    editProgram(current => ({
      ...current,
      days: current.days.map((day, index) => index === dayIndex ? {
        ...day,
        exercises: day.exercises.map((exercise, currentIndex) => currentIndex === exerciseIndex
          ? {
            ...exercise,
            exercise_library_item_id: selected?.id || null,
            name: selected?.name || exercise.name,
          }
          : exercise),
      } : day),
    }))
  }

  const validProgram = () => {
    const nextErrors = validateProgram(program)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setNotice('')
      return false
    }
    return true
  }

  const saveDraft = async () => {
    if (!validProgram()) return
    const requestedClientId = client.id
    const generation = clientGeneration.current
    publishKey.current = null
    setBusy('draft')
    setNotice('')
    try {
      const result = await coachApi.saveWorkoutProgramDraft(requestedClientId, program, accessToken)
      if (!operationIsCurrent(requestedClientId, generation)) return
      setWorkspace(current => ({ ...current, draft: result }))
      setProgram(snapshotProgram(result))
      setNotice('Draft saved.')
    } catch (error) {
      if (operationIsCurrent(requestedClientId, generation)) setNotice(error.message || 'Draft could not be saved. Your entries are still here.')
    } finally {
      if (operationIsCurrent(requestedClientId, generation)) setBusy('')
    }
  }

  const requestPublish = () => {
    if (!validProgram()) return
    setConfirming(true)
  }

  const publish = async () => {
    const nextErrors = validateProgram(program)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setConfirming(false)
      return
    }
    publishKey.current ||= crypto.randomUUID()
    const requestedClientId = client.id
    const generation = clientGeneration.current
    const requestedPublishKey = publishKey.current
    setBusy('publish')
    setNotice('')
    try {
      const result = await coachApi.publishWorkoutProgram(requestedClientId, requestedPublishKey, program, accessToken)
      if (!operationIsCurrent(requestedClientId, generation)) return
      setWorkspace(current => ({ ...current, active_program: result.program, draft: null }))
      setProgram(snapshotProgram(result.program))
      setNotice(`${result.generated_session_count} sessions published`)
      setConfirming(false)
      publishKey.current = null
    } catch (error) {
      if (operationIsCurrent(requestedClientId, generation)) setNotice(error.message || 'Publish failed. Your entries are still here; retry safely.')
    } finally {
      if (operationIsCurrent(requestedClientId, generation)) setBusy('')
    }
  }

  if (loadedClientId !== client.id || loading) {
    return <section className="coach-empty program-builder-loading"><strong>Loading workout program…</strong><span>Checking saved drafts and the active version.</span></section>
  }

  if (loadError) {
    return <section className="coach-empty program-builder-loading"><strong>Workout program unavailable</strong><span>{loadError}</span><button className="coach-secondary" type="button" onClick={loadWorkspace}>Retry loading workout program</button></section>
  }

  const activeProgram = workspace?.active_program
  const sessionCount = program.days.length * 4
  const endDate = program.active_from ? addCalendarDays(program.active_from, 27) : '—'

  return <div className="workout-program-workspace">
    <article className="panel workout-program-active">
      <header>
        <div><p className="kicker">PUBLISHED PROGRAM</p><span>The current immutable client version.</span></div>
        {activeProgram && <span className="coach-status good">ACTIVE</span>}
      </header>
      {activeProgram
        ? <div className="workout-program-active-summary"><div><strong>{activeProgram.name}</strong><span>{activeProgram.active_from} to {activeProgram.active_to}</span></div><b>Version {activeProgram.version}</b></div>
        : <div className="workout-program-empty"><strong>No published program</strong><span>Save a draft or publish the controlled four-week schedule below.</span></div>}
    </article>

    <section className="workout-program-editor" aria-label={`Workout program editor for ${client.name}`}>
      <header className="workout-program-editor-heading">
        <div><p className="kicker">PROGRAM BUILDER</p><h3>{workspace?.draft ? 'Continue saved draft' : 'Four-week training program'}</h3><p>Configure 2–6 unique training days. Publishing creates four weeks of sessions.</p></div>
        <span className="coach-status good">{workspace?.draft ? 'DRAFT RESTORED' : 'CONTROLLED'}</span>
      </header>

      <div className="workout-program-fields">
        <label>Program name
          <input value={program.name} maxLength="160" onChange={event => updateProgramField('name', event.target.value)} />
          <FieldError>{errors.name}</FieldError>
        </label>
        <label>Start date
          <input type="date" value={program.active_from} onChange={event => updateProgramField('active_from', event.target.value)} />
          <FieldError>{errors.active_from}</FieldError>
        </label>
        <label className="program-wide-field">Program notes
          <textarea rows="3" maxLength="2000" value={program.notes} onChange={event => updateProgramField('notes', event.target.value)} />
          <FieldError>{errors.notes}</FieldError>
        </label>
      </div>

      {Object.keys(errors).length > 0 && <p className="program-validation-summary" role="alert">Please fix the highlighted fields.</p>}

      <div className="workout-days-toolbar">
        <div><h3>Training days</h3><span>{program.days.length} of 6 days</span></div>
        <button className="coach-secondary" type="button" disabled={program.days.length >= 6 || Boolean(busy)} onClick={() => editProgram(addProgramDay)}>Add training day</button>
      </div>
      <FieldError>{errors.days}</FieldError>
      <FieldError>{errors.weekdays}</FieldError>

      <div className="workout-program-days">
        {program.days.map((day, dayIndex) => <article className="panel workout-program-day" key={day.position}>
          <header>
            <div><p className="kicker">DAY {String(dayIndex + 1).padStart(2, '0')}</p><h3>{day.name || `Day ${dayIndex + 1}`}</h3></div>
            <button className="program-danger-button" type="button" disabled={program.days.length <= 2 || Boolean(busy)} onClick={() => editProgram(current => removeProgramDay(current, dayIndex))}>Remove Day {dayIndex + 1}</button>
          </header>
          <div className="workout-day-fields">
            <label>Day {dayIndex + 1} weekday
              <select value={day.weekday} onChange={event => updateDay(dayIndex, 'weekday', Number(event.target.value))}>
                {weekdays.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <FieldError>{errors[`days.${dayIndex}.weekday`]}</FieldError>
            </label>
            <label>Day {dayIndex + 1} name
              <input maxLength="160" value={day.name} onChange={event => updateDay(dayIndex, 'name', event.target.value)} />
              <FieldError>{errors[`days.${dayIndex}.name`]}</FieldError>
            </label>
            <label className="program-wide-field">Day {dayIndex + 1} notes
              <textarea rows="2" maxLength="2000" value={day.coach_note} onChange={event => updateDay(dayIndex, 'coach_note', event.target.value)} />
              <FieldError>{errors[`days.${dayIndex}.coach_note`]}</FieldError>
            </label>
          </div>

          <div className="workout-exercise-list">
            {day.exercises.map((exercise, exerciseIndex) => <section className="workout-program-exercise" aria-label={`Day ${dayIndex + 1} exercise ${exerciseIndex + 1}`} key={exercise.position}>
              <header><strong>Exercise {exerciseIndex + 1}</strong><div className="exercise-order-actions">
                <button type="button" disabled={exerciseIndex === 0 || Boolean(busy)} onClick={() => editProgram(current => moveExercise(current, dayIndex, exerciseIndex, exerciseIndex - 1))}>Move Day {dayIndex + 1} exercise {exerciseIndex + 1} up</button>
                <button type="button" disabled={exerciseIndex === day.exercises.length - 1 || Boolean(busy)} onClick={() => editProgram(current => moveExercise(current, dayIndex, exerciseIndex, exerciseIndex + 1))}>Move Day {dayIndex + 1} exercise {exerciseIndex + 1} down</button>
                <button className="program-danger-button" type="button" disabled={day.exercises.length <= 1 || Boolean(busy)} onClick={() => editProgram(current => removeDayExercise(current, dayIndex, exerciseIndex))}>Remove Day {dayIndex + 1} exercise {exerciseIndex + 1}</button>
              </div></header>
              <div className="workout-exercise-fields">
                <label>Day {dayIndex + 1} exercise {exerciseIndex + 1} library item
                  <select value={exercise.exercise_library_item_id || ''} onChange={event => selectLibraryExercise(dayIndex, exerciseIndex, event.target.value)}>
                    <option value="">Custom exercise</option>
                    {workspace.exercise_library.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label>Day {dayIndex + 1} exercise {exerciseIndex + 1} name
                  <input maxLength="160" value={exercise.name} onChange={event => updateExercise(dayIndex, exerciseIndex, 'name', event.target.value)} />
                  <FieldError>{errors[`days.${dayIndex}.exercises.${exerciseIndex}.name`]}</FieldError>
                </label>
                <label>Day {dayIndex + 1} exercise {exerciseIndex + 1} sets
                  <input type="number" min="1" max="20" value={exercise.prescribed_sets} onChange={event => updateExercise(dayIndex, exerciseIndex, 'prescribed_sets', Number(event.target.value))} />
                  <FieldError>{errors[`days.${dayIndex}.exercises.${exerciseIndex}.sets`]}</FieldError>
                </label>
                <label>Day {dayIndex + 1} exercise {exerciseIndex + 1} reps
                  <input maxLength="40" value={exercise.prescribed_reps} onChange={event => updateExercise(dayIndex, exerciseIndex, 'prescribed_reps', event.target.value)} />
                  <FieldError>{errors[`days.${dayIndex}.exercises.${exerciseIndex}.reps`]}</FieldError>
                </label>
                <label>Day {dayIndex + 1} exercise {exerciseIndex + 1} rest seconds
                  <input type="number" min="0" max="1800" value={exercise.rest_seconds ?? ''} onChange={event => updateExercise(dayIndex, exerciseIndex, 'rest_seconds', event.target.value === '' ? null : Number(event.target.value))} />
                  <FieldError>{errors[`days.${dayIndex}.exercises.${exerciseIndex}.rest_seconds`]}</FieldError>
                </label>
                <label className="exercise-note-field">Day {dayIndex + 1} exercise {exerciseIndex + 1} notes
                  <textarea rows="2" maxLength="1000" value={exercise.coach_note} onChange={event => updateExercise(dayIndex, exerciseIndex, 'coach_note', event.target.value)} />
                  <FieldError>{errors[`days.${dayIndex}.exercises.${exerciseIndex}.coach_note`]}</FieldError>
                </label>
              </div>
            </section>)}
          </div>
          <div className="workout-exercise-actions">
            <FieldError>{errors[`days.${dayIndex}.exercises`]}</FieldError>
            <button className="coach-secondary" type="button" disabled={day.exercises.length >= 12 || Boolean(busy)} onClick={() => editProgram(current => addDayExercise(current, dayIndex))}>Add exercise to Day {dayIndex + 1}</button>
          </div>
        </article>)}
      </div>

      <footer className="workout-program-actions">
        <p className={notice.includes('published') ? 'program-success' : ''} role="status">{notice || 'Drafts do not create client sessions.'}</p>
        <div><button className="coach-secondary" type="button" disabled={Boolean(busy)} onClick={saveDraft}>{busy === 'draft' ? 'Saving draft…' : 'Save draft'}</button><button className="coach-primary" type="button" disabled={Boolean(busy)} onClick={requestPublish}>Publish 4-week program</button></div>
      </footer>
    </section>

    {confirming && <div className="modal-backdrop"><section className="signal-modal coach-modal workout-publish-confirmation" role="dialog" aria-modal="true" aria-labelledby="workout-publish-title">
      <p className="kicker">PUBLISH PROGRAM</p>
      <h2 id="workout-publish-title">Confirm four-week schedule</h2>
      <p>This publishes {sessionCount} sessions from <strong>{program.active_from} to {endDate}</strong>. The published version is immutable.</p>
      <div className="publish-confirmation-summary"><span>CLIENT<strong>{client.name}</strong></span><span>PROGRAM<strong>{program.name}</strong></span><span>SESSIONS<strong>{sessionCount} sessions</strong></span></div>
      <footer className="coach-modal-footer"><button className="coach-secondary" type="button" disabled={Boolean(busy)} onClick={() => setConfirming(false)}>Cancel</button><button className="coach-primary" type="button" disabled={Boolean(busy)} onClick={publish}>{busy === 'publish' ? 'Publishing…' : 'Confirm publish'}</button></footer>
    </section></div>}
  </div>
}
