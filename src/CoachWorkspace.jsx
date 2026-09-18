import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { coachApi } from './api/coach'
import PhotoJournal from './progress/PhotoJournal'
import { CoachCheckIns } from './progress/WeeklyCheckIns'
import ExerciseHistory from './progress/ExerciseHistory'
import NutritionPlanBuilder from './coach/NutritionPlanBuilder'
import WorkoutProgramBuilder from './coach/WorkoutProgramBuilder'
import FoundationPanel from './coach/FoundationPanel'

const coachNavigation = [
  ['overview', 'Overview'],
  ['clients', 'Clients'],
  ['body', 'Body Tracker'],
  ['nutrition', 'Nutrition'],
  ['workout', 'Workout'],
  ['libraries', 'Libraries'],
  ['settings', 'Settings'],
  ['health', 'Health'],
  ['audit', 'Audit Log'],
]

const initialClients = [
  { id: 'XP-0017', name: 'Maya Shah', initials: 'MS', weight: '68.4 kg', lastEntry: 'Today', checkIn: 'Submitted', status: 'On track', goal: 'Body recomposition', checkInDay: 'Sunday', attention: false },
  { id: 'XP-0024', name: 'Arjun Mehta', initials: 'AM', weight: '82.1 kg', lastEntry: '4 days ago', checkIn: 'Due', status: 'Needs review', goal: 'Fat loss', checkInDay: 'Friday', attention: true },
  { id: 'XP-0031', name: 'Nadia Khan', initials: 'NK', weight: '—', lastEntry: '9 days ago', checkIn: 'No start date', status: 'Missing data', goal: 'Strength', checkInDay: 'Sunday', attention: true },
  { id: 'XP-0034', name: 'Kabir Iyer', initials: 'KI', weight: '74.8 kg', lastEntry: 'Yesterday', checkIn: 'Submitted', status: 'On track', goal: 'Performance', checkInDay: 'Wednesday', attention: false },
]

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed)
}

function weightTrend(entries) {
  const points = [...(entries || [])]
    .filter((entry) => Number.isFinite(Number(entry.weight_kg)))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  if (points.length < 2) return null
  const weights = points.map((entry) => Number(entry.weight_kg))
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const span = max - min || 1
  return {
    points: points.map((entry, index) => {
      const x = (index * 640) / (points.length - 1)
      const y = 210 - ((Number(entry.weight_kg) - min) / span) * 210
      return `${x},${y}`
    }).join(' '),
    startDate: points[0].entry_date,
    endDate: points.at(-1).entry_date,
    startKg: weights[0],
    endKg: weights.at(-1),
    change: Number((weights.at(-1) - weights[0]).toFixed(1)),
  }
}

function setupDraftFromReview(setup) {
  return {
    primary_goal: setup?.primary_goal || 'fat_loss',
    check_in_day: setup?.check_in_day || 'sunday',
    timezone: setup?.timezone || '',
    dietary_preferences: setup?.dietary_preferences || '',
    allergies_injuries: setup?.allergies_injuries || '',
    enabled_measurements: (setup?.enabled_measurements || ['weight_kg', 'waist_cm']).join(','),
    target_weight_kg: setup?.target_weight_kg ?? '',
    target_waist_cm: setup?.target_waist_cm ?? '',
    target_date: setup?.target_date || '',
  }
}

function settingsDraft(settings) {
  return {
    weight_unit: settings?.weight_unit || 'kg',
    default_check_in_day: settings?.default_check_in_day || 'sunday',
    default_missing_weight_threshold_days: settings?.default_missing_weight_threshold_days ?? 3,
    default_measurement_refresh_threshold_days: settings?.default_measurement_refresh_threshold_days ?? 14,
    enabled_measurements: (settings?.enabled_measurements || ['weight_kg', 'waist_cm']).join(','),
  }
}

function relativeDate(value) {
  if (!value) return 'No entry'
  const today = new Date()
  const entry = new Date(`${value}T00:00:00`)
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - entry) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${Math.max(days, 0)} days ago`
}

function apiClientToWorkspaceClient(item) {
  const name = item.full_name || 'Client'
  return {
    id: item.id,
    code: item.client_code,
    name,
    initials: name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    weight: item.latest_weight_kg == null ? '—' : `${item.latest_weight_kg} kg`,
    lastEntry: relativeDate(item.latest_entry_date),
    checkIn: item.check_in_schedule?.current_status || (item.latest_checkin_period_start ? 'Submitted' : 'Due'),
    schedule: item.check_in_schedule,
    status: item.needs_attention ? 'Needs attention' : 'On track',
    goal: item.primary_goal.replaceAll('_', ' '),
    checkInDay: item.check_in_day[0].toUpperCase() + item.check_in_day.slice(1),
    foundation_intake_status: item.foundation_intake_status || 'not_required',
    attention: item.needs_attention || item.check_in_schedule?.current_status === 'overdue',
    attention_reasons: item.attention_reasons || [],
  }
}

function CoachGlyph({ name }) {
  const icon = {
    overview: '⌂', clients: '◉', body: '◌', nutrition: '⌁', workout: '↗', libraries: '▦', settings: '⚙', health: '＋', audit: '☰', review: '◈', chevron: '›', close: '×', search: '⌕', plus: '+', switch: '⇄', filter: '≡', export: '⇩', note: '□', photo: '▧', alert: '!', check: '✓', lock: '⌑', file: '▤', food: '◒', exercise: '↗', upload: '⇧', trend: '⌁', plan: '◇', archive: '⊘', menu: '☰',
  }
  return <span className="coach-glyph" aria-hidden="true">{icon[name] ?? '·'}</span>
}

function CoachHeading({ eyebrow, title, copy, action, children }) {
  return <header className="coach-heading"><div><p className="kicker">{eyebrow}</p><h2>{title}</h2><p>{copy}</p></div>{action || children}</header>
}

function Status({ children, tone = '', className = '' }) {
  return <span className={`coach-status ${tone} ${className}`.trim()}>{children}</span>
}

function ClientSelect({ clientId, clients, onChange }) {
  return <label className="coach-client-select">CLIENT<select value={clientId} onChange={(event) => onChange(event.target.value)}>{clients.map((client) => <option value={client.id} key={client.id}>{client.name} · {client.code || client.id}</option>)}</select></label>
}

function CoachOverview({ clients, selectClient, navigate, onCreate }) {
  const attention = clients.filter((client) => client.attention)
  return <section className="coach-page">
    <CoachHeading eyebrow="XFORMPHYSIQUE / COACH" title={<>Control system.<em> See signal.</em></>} copy="Progress intelligence and client operations in one controlled workspace." action={<button className="coach-primary" onClick={onCreate}><CoachGlyph name="plus" />New client</button>} />
    <section className="coach-metric-grid">
      <article><p>ACTIVE CLIENTS</p><strong>{clients.length}</strong><span>Client workspaces</span></article>
      <article><p>NEEDS REVIEW</p><strong className="attention-text">{attention.length}</strong><span>Missing signal or overdue check-in</span></article>
      <article><p>MISSED CHECK-INS</p><strong>{clients.reduce((total, c) => total + (c.schedule?.missed_count || 0), 0)}</strong><span>From each client’s seven-day schedule</span></article>
      <article><p>WEEKLY CHECK-INS</p><strong className="lime-text">{clients.filter(c => c.schedule?.current_status === 'submitted').length}<small>/{clients.length}</small></strong><span>Submitted this cycle</span></article>
    </section>
    <section className="panel progress-panel"><h3>Upcoming client check-ins</h3>{clients.length ? clients.map(c => <div className="progress-actions" key={c.id}><span>{c.name} · {c.schedule?.due_on || c.checkInDay} · {c.schedule?.current_status || 'Schedule pending'}<small> · next {c.schedule?.next_due_on || '—'} · {c.schedule?.timezone || ''}</small></span><button onClick={() => selectClient(c.id)}>Review {c.name}</button></div>) : <p>No assigned clients yet.</p>}</section>
    <section className="coach-overview-grid">
      <article className="panel coach-pulse-panel"><header><div><p className="kicker">CLIENT PULSE</p><span>Start with what needs attention.</span></div><button className="quiet-link" onClick={() => navigate('Clients')}>View roster <CoachGlyph name="chevron" /></button></header><div className="coach-table" role="table" aria-label="Client pulse"><div className="coach-table-head" role="row"><span>CLIENT</span><span>WEIGHT</span><span>LAST ENTRY</span><span>CHECK-IN</span><span>STATUS</span><span /></div>{clients.map((client) => <div className="coach-table-row" role="row" key={client.id}><span className="client-cell"><i>{client.initials}</i><b>{client.name}<small>{client.id}</small></b></span><span>{client.weight}</span><span>{client.lastEntry}</span><span>{client.checkIn}</span><Status tone={client.attention ? 'warning' : 'good'}>{client.status}</Status><button className="row-open" onClick={() => selectClient(client.id)}>Review <CoachGlyph name="chevron" /></button></div>)}</div></article>
      <article className="panel coach-attention-panel"><header><div><p className="kicker">ATTENTION QUEUE</p><span>Rule-based preview.</span></div></header><div className="attention-list">{attention.map((client) => <button key={client.id} onClick={() => selectClient(client.id)}><span className="attention-icon"><CoachGlyph name="alert" /></span><span><strong>{client.name}</strong><small>{(client.attention_reasons || []).join(', ')}</small></span><CoachGlyph name="chevron" /></button>)}</div><p className="panel-footnote">Derived from body-entry age and check-in schedule.</p></article>
    </section>
    <section className="coach-action-strip"><button onClick={() => navigate('Body Tracker')}><CoachGlyph name="trend" /><span><strong>Review body signal</strong><small>Trends, targets and data quality.</small></span></button><button onClick={() => navigate('Nutrition')}><CoachGlyph name="food" /><span><strong>Open nutrition plans</strong><small>Assignments and adherence.</small></span></button><button onClick={() => navigate('Workout')}><CoachGlyph name="exercise" /><span><strong>Open workout plans</strong><small>Templates and published sessions.</small></span></button></section>
  </section>
}

function NewClientForm({ onCancel, onCreate }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await onCreate({
        full_name: data.get('fullName'),
        email: data.get('email'),
        primary_goal: data.get('goal'),
        check_in_day: data.get('checkInDay'),
        timezone: data.get('timezone'),
        target_weight_kg: data.get('targetWeight') ? Number(data.get('targetWeight')) : null,
        dietary_preferences: data.get('dietaryPreferences'),
        allergies_injuries: data.get('allergiesInjuries'),
        enabled_measurements: data.get('enabledMeasurements').split(','),
        private_coach_note: data.get('privateCoachNote'),
      })
      onCancel()
    } catch (reason) {
      setError(reason.message || 'Could not create this client workspace.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-backdrop"><form className="signal-modal coach-modal" onSubmit={submit}><button className="modal-close" type="button" onClick={onCancel} disabled={saving} aria-label="Close client onboarding"><CoachGlyph name="close" /></button><p className="kicker">COACH / ONBOARDING</p><h2>Create client workspace</h2><p>A secure invitation lets the client set their own password. No credentials are sent in email.</p><div className="coach-form-grid"><label>Full name<input name="fullName" required placeholder="Client name" /></label><label>Email<input name="email" type="email" required placeholder="client@example.com" /></label><label>Primary goal<select name="goal" defaultValue="fat_loss"><option value="fat_loss">Fat loss</option><option value="body_recomposition">Body recomposition</option><option value="strength">Strength</option><option value="performance">Performance</option></select></label><label>Check-in day<select name="checkInDay" defaultValue="sunday">{['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => <option value={day} key={day}>{day[0].toUpperCase()}{day.slice(1)}</option>)}</select></label><label>Target weight (kg)<input name="targetWeight" type="number" min="0.1" step="0.1" placeholder="Optional" /></label><label>Enabled measurements<select name="enabledMeasurements" defaultValue="weight_kg,waist_cm"><option value="weight_kg">Weight only</option><option value="weight_kg,waist_cm">Weight, waist</option><option value="weight_kg,waist_cm,body_fat_pct">Weight, waist, body fat</option><option value="weight_kg,waist_cm,hip_cm,body_fat_pct">Full body measurements</option></select></label><label>Timezone<input name="timezone" defaultValue="Asia/Kolkata" required /></label><label className="wide-field">Dietary preferences<textarea name="dietaryPreferences" rows="2" placeholder="Vegetarian, food preferences…" /></label><label className="wide-field">Allergies, restrictions, injuries<textarea name="allergiesInjuries" rows="3" placeholder="Planning context for the client record…" /></label><label className="wide-field">Private coach note<textarea name="privateCoachNote" rows="3" placeholder="Internal context. Never shown to the client." /></label></div><footer className="coach-modal-footer"><span role="status">{error || 'The client receives a time-limited account-setup link.'}</span><button className="coach-primary" type="submit" disabled={saving}>{saving ? 'Creating invitation…' : <>Create & email invite <CoachGlyph name="chevron" /></>}</button></footer></form></div>
}

function CoachClients({ clients, onSelectClient, onCreateClient, notice }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const matches = useMemo(() => clients.filter((client) => (`${client.name} ${client.id}`).toLowerCase().includes(query.toLowerCase()) && (filter === 'All' || (filter === 'Needs attention' && client.attention) || client.status === filter)), [clients, query, filter])
  return <section className="coach-page"><CoachHeading eyebrow="COACH / CLIENT OPERATIONS" title="Clients" copy="Every client record, one controlled workspace." action={<button className="coach-primary" onClick={() => setShowCreate(true)}><CoachGlyph name="plus" />New client</button>} /><div className="coach-roster-tools"><label className="coach-search"><CoachGlyph name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients or ID" /></label><div className="coach-filter-group" aria-label="Client filters">{['All', 'Needs attention', 'On track', 'Missing data'].map((option) => <button className={filter === option ? 'selected' : ''} onClick={() => setFilter(option)} key={option}>{option}</button>)}</div><button className="coach-quiet-button" onClick={() => notice('CSV preview needs backend validation endpoint.')}><CoachGlyph name="export" />CSV preview</button></div><section className="coach-client-list">{matches.map((client) => <article key={client.id}><div className="roster-avatar">{client.initials}</div><div className="roster-primary"><div className="coach-roster-title"><strong>{client.name}</strong>{client.foundation_intake_status === 'pending' ? <Status tone="warn" className="coach-roster-chip">Intake pending</Status> : null}</div><span>{client.id} · {client.goal}</span></div><div><small>WEIGHT</small><span>{client.weight}</span></div><div><small>LAST ENTRY</small><span>{client.lastEntry}</span></div><div><small>CHECK-IN</small><span>{client.checkIn}</span></div><Status tone={client.attention ? 'warning' : 'good'}>{client.status}</Status><button className="row-open" onClick={() => onSelectClient(client.id)}>Review <CoachGlyph name="chevron" /></button></article>)}</section>{!matches.length && <div className="coach-empty"><CoachGlyph name="search" /><strong>No matching clients</strong><span>Change search or filter.</span></div>}{showCreate && <NewClientForm onCancel={() => setShowCreate(false)} onCreate={onCreateClient} />}</section>
}

function CoachNutrition({ clientId, clients, setClientId, accessToken }) {
  const client = clients.find((item) => item.id === clientId) ?? clients[0]
  return <section className="coach-page"><CoachHeading eyebrow="COACH / NUTRITION PLANS" title="Nutrition" copy="Build precise meal plans. Assign portions, targets and substitutions." action={<ClientSelect clientId={clientId} clients={clients} onChange={setClientId} />} /><NutritionPlanBuilder client={client} accessToken={accessToken} /></section>
}

function CoachWorkout({ clientId, clients, setClientId, accessToken }) {
  const client = clients.find((item) => item.id === clientId) ?? clients[0]
  return <section className="coach-page"><CoachHeading eyebrow="COACH / WORKOUT PLANS" title="Workout" copy="Build days, select exercises and publish training programs." action={<ClientSelect clientId={clientId} clients={clients} onChange={setClientId} />} /><WorkoutProgramBuilder client={client} accessToken={accessToken} /></section>
}

function foodDetail(item) {
  const parts = []
  if (item.protein_g != null) parts.push(`${item.protein_g}g P`)
  if (item.carbs_g != null) parts.push(`${item.carbs_g}g C`)
  if (item.fat_g != null) parts.push(`${item.fat_g}g F`)
  if (item.calories_kcal != null) parts.push(`${item.calories_kcal} kcal`)
  return parts.join(' · ') || 'No macros recorded'
}

function optionalNumber(value) {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function emptyFoodDraft(item) {
  return {
    name: item?.name || '',
    category: item?.category || '',
    calories_kcal: item?.calories_kcal ?? '',
    protein_g: item?.protein_g ?? '',
    carbs_g: item?.carbs_g ?? '',
    fat_g: item?.fat_g ?? '',
  }
}

function emptyExerciseDraft(item) {
  return {
    name: item?.name || '',
    body_region: item?.body_region || '',
    training_focus: item?.training_focus || '',
    guidance: item?.guidance || '',
  }
}

function CoachLibraries({ notice, accessToken }) {
  const [library, setLibrary] = useState('Food Library')
  const [query, setQuery] = useState('')
  const [food, setFood] = useState([])
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editor, setEditor] = useState(null)
  const isFood = library === 'Food Library'
  const items = isFood ? food : exercises
  const filtered = items.filter((item) => {
    const haystack = isFood
      ? `${item.name} ${item.category} ${foodDetail(item)}`
      : `${item.name} ${item.body_region} ${item.training_focus} ${item.guidance || ''}`
    return haystack.toLowerCase().includes(query.toLowerCase())
  })

  const load = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true)
    try {
      const result = await coachApi.getLibraries(accessToken)
      setFood(result.food || [])
      setExercises(result.exercises || [])
    } catch (reason) {
      notice(reason.message || 'Could not load libraries.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [accessToken, notice])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setFormError('')
    setEditor({ mode: 'create', kind: isFood ? 'food' : 'exercise', draft: isFood ? emptyFoodDraft() : emptyExerciseDraft() })
  }

  const openEdit = (item) => {
    setFormError('')
    setEditor({
      mode: 'edit',
      kind: isFood ? 'food' : 'exercise',
      id: item.id,
      draft: isFood ? emptyFoodDraft(item) : emptyExerciseDraft(item),
    })
  }

  const setDraftField = (field, value) => {
    setEditor((current) => current ? { ...current, draft: { ...current.draft, [field]: value } } : current)
  }

  const saveEditor = async (event) => {
    event.preventDefault()
    if (!editor) return
    setSaving(true)
    setFormError('')
    try {
      if (editor.kind === 'food') {
        const payload = {
          name: editor.draft.name,
          category: editor.draft.category,
          calories_kcal: optionalNumber(editor.draft.calories_kcal),
          protein_g: optionalNumber(editor.draft.protein_g),
          carbs_g: optionalNumber(editor.draft.carbs_g),
          fat_g: optionalNumber(editor.draft.fat_g),
        }
        if (editor.mode === 'create') await coachApi.createFoodLibraryItem(payload, accessToken)
        else await coachApi.updateFoodLibraryItem(editor.id, payload, accessToken)
      } else {
        const payload = {
          name: editor.draft.name,
          body_region: editor.draft.body_region,
          training_focus: editor.draft.training_focus,
          guidance: editor.draft.guidance,
        }
        if (editor.mode === 'create') await coachApi.createExerciseLibraryItem(payload, accessToken)
        else await coachApi.updateExerciseLibraryItem(editor.id, payload, accessToken)
      }
      setEditor(null)
      notice(editor.mode === 'create' ? 'Library item saved.' : 'Library item updated.')
      await load({ silent: true })
    } catch (reason) {
      setFormError(reason.message || 'Could not save this library item.')
    } finally {
      setSaving(false)
    }
  }

  const disableItem = async (item) => {
    try {
      if (isFood) await coachApi.updateFoodLibraryItem(item.id, { is_active: false }, accessToken)
      else await coachApi.updateExerciseLibraryItem(item.id, { is_active: false }, accessToken)
      notice(`${item.name} disabled.`)
      await load({ silent: true })
    } catch (reason) {
      notice(reason.message || 'Could not disable this library item.')
    }
  }

  return (
    <section className="coach-page">
      <CoachHeading
        eyebrow="COACH / SOURCE LIBRARIES"
        title="Libraries"
        copy="Source-of-truth food and exercise references for plans."
        action={<button className="coach-primary" type="button" onClick={openCreate}><CoachGlyph name="plus" />Add item</button>}
      />
      <div className="coach-library-tools">
        <div className="coach-tab-switch">
          {['Food Library', 'Exercise Library'].map((item) => (
            <button className={library === item ? 'selected' : ''} onClick={() => setLibrary(item)} key={item} type="button">{item}</button>
          ))}
        </div>
        <label className="coach-search">
          <CoachGlyph name="search" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isFood ? 'Search foods' : 'Search exercises'} />
        </label>
      </div>
      {loading ? (
        <div className="coach-empty"><CoachGlyph name="search" /><strong>Loading libraries…</strong></div>
      ) : (
        <>
          <section className="coach-library-list">
            {filtered.map((item) => (
              <article key={item.id}>
                <span className="library-icon"><CoachGlyph name={isFood ? 'food' : 'exercise'} /></span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{isFood ? `${item.category} · ${foodDetail(item)}` : `${item.body_region} · ${item.training_focus}`}</small>
                </div>
                <Status tone={item.is_active ? 'good' : 'warning'}>{item.is_active ? 'ACTIVE' : 'INACTIVE'}</Status>
                <button type="button" onClick={() => openEdit(item)}>Edit</button>
                <button type="button" onClick={() => disableItem(item)} disabled={!item.is_active}>Disable</button>
              </article>
            ))}
          </section>
          {!filtered.length && (
            <div className="coach-empty">
              <CoachGlyph name="search" />
              <strong>{items.length ? `No matching ${library.toLowerCase()}` : `No ${isFood ? 'food' : 'exercise'} items yet.`}</strong>
              <span>{items.length ? 'Change search or library tab.' : 'Add an item to use it in plan builders.'}</span>
            </div>
          )}
        </>
      )}
      {editor && (
        <div className="modal-backdrop">
          <form className="signal-modal coach-modal" onSubmit={saveEditor}>
            <button className="modal-close" type="button" onClick={() => setEditor(null)} disabled={saving} aria-label="Close library editor"><CoachGlyph name="close" /></button>
            <p className="kicker">COACH / LIBRARIES</p>
            <h2>{editor.mode === 'create' ? 'Add' : 'Edit'} {editor.kind === 'food' ? 'food' : 'exercise'}</h2>
            <p>Saved items stay available to this coach. Disable keeps history instead of deleting.</p>
            <div className="coach-form-grid">
              <label>Name<input value={editor.draft.name} onChange={(event) => setDraftField('name', event.target.value)} required maxLength="180" /></label>
              {editor.kind === 'food' ? (
                <>
                  <label>Category<input value={editor.draft.category} onChange={(event) => setDraftField('category', event.target.value)} required maxLength="80" /></label>
                  <label>Calories (kcal)<input type="number" min="0" step="0.1" value={editor.draft.calories_kcal} onChange={(event) => setDraftField('calories_kcal', event.target.value)} /></label>
                  <label>Protein (g)<input type="number" min="0" step="0.1" value={editor.draft.protein_g} onChange={(event) => setDraftField('protein_g', event.target.value)} /></label>
                  <label>Carbs (g)<input type="number" min="0" step="0.1" value={editor.draft.carbs_g} onChange={(event) => setDraftField('carbs_g', event.target.value)} /></label>
                  <label>Fat (g)<input type="number" min="0" step="0.1" value={editor.draft.fat_g} onChange={(event) => setDraftField('fat_g', event.target.value)} /></label>
                </>
              ) : (
                <>
                  <label>Body region<input value={editor.draft.body_region} onChange={(event) => setDraftField('body_region', event.target.value)} required maxLength="80" /></label>
                  <label>Training focus<input value={editor.draft.training_focus} onChange={(event) => setDraftField('training_focus', event.target.value)} required maxLength="80" /></label>
                  <label className="wide-field">Guidance<textarea rows="3" maxLength="3000" value={editor.draft.guidance} onChange={(event) => setDraftField('guidance', event.target.value)} /></label>
                </>
              )}
            </div>
            <footer className="coach-modal-footer">
              <span role="status">{formError || 'Optional macros stay blank when unknown. Duplicate names are rejected.'}</span>
              <button className="coach-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
            </footer>
          </form>
        </div>
      )}
    </section>
  )
}

function CoachProfilePhoto({ account, profilePhoto, onUploadProfilePhoto }) {
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const initials = (account?.full_name || 'Coach').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  const selectPhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setNotice('')
    try {
      await onUploadProfilePhoto(file)
      setNotice('Profile photo saved privately.')
    } catch (requestError) {
      setNotice(requestError.message || 'Could not save profile photo.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return <section className="panel profile-photo-card coach-profile-photo-card">
    <div className="profile-photo-preview">{profilePhoto?.url ? <img src={profilePhoto.url} alt="Your profile" /> : <span>{initials}</span>}</div>
    <div><p className="kicker">COACH PROFILE PHOTO</p><strong>{profilePhoto ? 'Current photo protected' : 'Add a profile photo'}</strong><span>One compact image for your authenticated coaching workspace.</span></div>
    <label className="profile-photo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={selectPhoto} /><span>{uploading ? 'Uploading…' : 'Upload photo'}</span></label>
    <small aria-live="polite">{notice || 'JPEG, PNG or WebP · 2 MB max · securely optimized.'}</small>
  </section>
}

function CoachSettings({ notice, account, profilePhoto, onUploadProfilePhoto, accessToken }) {
  const [active, setActive] = useState('System setup')
  const [draft, setDraft] = useState(settingsDraft())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const settings = await coachApi.getSettings(accessToken)
      setDraft(settingsDraft(settings))
    } catch (reason) {
      notice(reason.message || 'Could not load settings.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, notice])

  useEffect(() => { load() }, [load])

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }))

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const settings = await coachApi.saveSettings({
        weight_unit: draft.weight_unit,
        default_check_in_day: draft.default_check_in_day,
        default_missing_weight_threshold_days: Number(draft.default_missing_weight_threshold_days),
        default_measurement_refresh_threshold_days: Number(draft.default_measurement_refresh_threshold_days),
        enabled_measurements: draft.enabled_measurements.split(',').filter(Boolean),
      }, accessToken)
      setDraft(settingsDraft(settings))
      notice('Settings saved.')
    } catch (reason) {
      notice(reason.message || 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="coach-page">
      <CoachHeading eyebrow="COACH / SYSTEM CONFIGURATION" title="Settings" copy="Measurement logic, targets, units and safe data operations." />
      <CoachProfilePhoto account={account} profilePhoto={profilePhoto} onUploadProfilePhoto={onUploadProfilePhoto} />
      <div className="coach-settings-layout">
        <nav>
          {['System setup', 'Data tools', 'Security'].map((item) => (
            <button className={active === item ? 'selected' : ''} onClick={() => setActive(item)} key={item} type="button">{item}</button>
          ))}
        </nav>
        <section className="panel">
          {active === 'System setup' && (
            <>
              <header>
                <div>
                  <p className="kicker">TRACKING CONFIGURATION</p>
                  <span>Coach-wide defaults. Backend is the source of truth.</span>
                </div>
                <Status tone="good">LIVE</Status>
              </header>
              {loading ? (
                <div className="coach-empty"><CoachGlyph name="settings" /><strong>Loading settings…</strong></div>
              ) : (
                <form className="coach-settings-form" onSubmit={save}>
                  <label>Weight unit
                    <select value={draft.weight_unit} onChange={(event) => setField('weight_unit', event.target.value)}>
                      <option value="kg">Kilograms (kg)</option>
                      <option value="lb">Pounds (lb)</option>
                    </select>
                  </label>
                  <label>Default check-in day
                    <select value={draft.default_check_in_day} onChange={(event) => setField('default_check_in_day', event.target.value)}>
                      {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                        <option value={day} key={day}>{day[0].toUpperCase()}{day.slice(1)}</option>
                      ))}
                    </select>
                  </label>
                  <label>Missing weight threshold (days)
                    <input type="number" min="1" max="90" value={draft.default_missing_weight_threshold_days} onChange={(event) => setField('default_missing_weight_threshold_days', event.target.value)} required />
                  </label>
                  <label>Measurement refresh threshold (days)
                    <input type="number" min="1" max="365" value={draft.default_measurement_refresh_threshold_days} onChange={(event) => setField('default_measurement_refresh_threshold_days', event.target.value)} required />
                  </label>
                  <label className="wide-field">Enabled measurements
                    <select value={draft.enabled_measurements} onChange={(event) => setField('enabled_measurements', event.target.value)}>
                      <option value="weight_kg">Weight only</option>
                      <option value="weight_kg,waist_cm">Weight, waist</option>
                      <option value="weight_kg,waist_cm,body_fat_pct">Weight, waist, body fat</option>
                      <option value="weight_kg,waist_cm,hip_cm,body_fat_pct">Full body measurements</option>
                    </select>
                  </label>
                  <footer>
                    <span>Saving writes coach settings and an audit record.</span>
                    <button className="coach-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
                  </footer>
                </form>
              )}
            </>
          )}
          {active === 'Data tools' && (
            <>
              <header>
                <div>
                  <p className="kicker">DATA TOOLS</p>
                  <span>CSV contract preview. No local file processing yet.</span>
                </div>
              </header>
              <div className="coach-data-tools">
                <article>
                  <CoachGlyph name="upload" />
                  <div><strong>Import clients</strong><span>Validate required fields, duplicate IDs and invalid values before commit.</span></div>
                  <button className="coach-primary" type="button" onClick={() => notice('CSV import is not in this slice')}>Preview import</button>
                </article>
                <article>
                  <CoachGlyph name="export" />
                  <div><strong>Export client data</strong><span>Generate controlled export by client and time range.</span></div>
                  <button className="coach-secondary" type="button" onClick={() => notice('CSV export is not in this slice')}>Prepare export</button>
                </article>
              </div>
            </>
          )}
          {active === 'Security' && (
            <>
              <header>
                <div>
                  <p className="kicker">SECURITY BOUNDARY</p>
                  <span>Authentication and data isolation belong to backend.</span>
                </div>
              </header>
              <div className="coach-security-list">
                <div><strong>Client ownership</strong><span>Server-enforced per coach/client relationship.</span></div>
                <div><strong>Private notes</strong><span>Access-controlled and audited.</span></div>
                <div><strong>Photos and health records</strong><span>Private object storage with consent and retention.</span></div>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  )
}

function CoachHealth({ clientId, clients, setClientId, accessToken, navigate }) {
  const client = clients.find((item) => item.id === clientId) ?? clients[0]
  const reviewRequest = useRef(0)
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!client?.id) return
    const requestId = ++reviewRequest.current
    setLoading(true)
    setError('')
    try {
      const result = await coachApi.getClientReview(client.id, accessToken)
      if (requestId !== reviewRequest.current) return
      setReview(result)
    } catch (reason) {
      if (requestId === reviewRequest.current) setError(reason.message || 'Could not load this protected client record.')
    } finally {
      if (requestId === reviewRequest.current) setLoading(false)
    }
  }, [accessToken, client?.id])

  useEffect(() => { load() }, [load])

  const stale = Boolean(review?.client?.id && client?.id && review.client.id !== client.id)
  const allergies = review?.setup?.allergies_injuries || ''
  const context = review?.coaching_context || {}
  const considerations = context.training_considerations || []

  return <section className="coach-page">
    <CoachHeading eyebrow="COACH / HEALTH CONTEXT" title="Health" copy="Coaching support only. Not medical advice. Safety context from the assigned client record — not a lab archive." action={<ClientSelect clientId={clientId} clients={clients} onChange={setClientId} />} />
    {!stale && client?.id ? <FoundationPanel clientId={client.id} accessToken={accessToken} Status={Status} /> : null}
    {(loading || stale) && <div className="coach-empty"><CoachGlyph name="health" /><strong>Loading health context…</strong><span>Assigned-client safety fields only.</span></div>}
    {!loading && !stale && error && <section className="coach-empty"><CoachGlyph name="alert" /><strong>Protected client record unavailable</strong><span>{error}</span><button className="coach-secondary" type="button" onClick={load}>Try again</button></section>}
    {!loading && !stale && !error && review && <article className="panel">
      <header>
        <div>
          <p className="kicker">ASSIGNED CLIENT SAFETY</p>
          <span>Live from review setup and coaching context. Coaching support only. Not medical advice.</span>
        </div>
        <Status tone="good">LIVE</Status>
      </header>
      <div className="coach-security-list">
        <div><strong>Allergies, restrictions, injuries</strong><span>{allergies || 'None recorded.'}</span></div>
        <div><strong>Safety notice</strong><span>{context.safety_notice || 'None recorded.'}</span></div>
        <div><strong>Training considerations</strong><span>{considerations.length ? considerations.join(', ') : 'None recorded.'}</span></div>
        <div><strong>Client-visible coach note</strong><span>{context.client_visible_coach_note || 'None recorded.'}</span></div>
      </div>
      <footer><button className="coach-secondary" type="button" onClick={() => navigate('Review')}>Edit in Review</button></footer>
    </article>}
  </section>
}

function CoachAudit({ accessToken }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await coachApi.listAuditEvents(accessToken)
      setItems(result.items || [])
    } catch (reason) {
      setError(reason.message || 'Could not load audit events.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { load() }, [load])

  return <section className="coach-page">
    <CoachHeading eyebrow="COACH / ACTIVITY RECORD" title="Audit Log" copy="Actions this authenticated coach recorded. Other coaches’ rows are never listed." />
    {loading && <div className="coach-empty"><CoachGlyph name="audit" /><strong>Loading recorded actions…</strong></div>}
    {!loading && error && <section className="coach-empty"><CoachGlyph name="alert" /><strong>Audit log unavailable</strong><span>{error}</span><button className="coach-secondary" type="button" onClick={load}>Try again</button></section>}
    {!loading && !error && !items.length && <div className="coach-empty"><CoachGlyph name="file" /><strong>No recorded actions yet.</strong><span>Publish, notes, libraries and settings writes will appear here.</span></div>}
    {!loading && !error && items.length > 0 && <article className="panel coach-data-table">
      <header><div><p className="kicker">YOUR AUDIT EVENTS</p><span>Newest first. Metadata as stored.</span></div><Status tone="good">LIVE</Status></header>
      <div className="coach-table" role="table" aria-label="Coach audit events">
        <div className="coach-table-head" role="row"><span>WHEN</span><span>ACTION</span><span>ENTITY</span><span>CLIENT</span><span>METADATA</span></div>
        {items.map((event) => <div className="coach-table-row" role="row" key={event.id}><span>{formatDateTime(event.occurred_at)}</span><span>{event.action}</span><span>{event.entity_type}</span><span>{event.client_id || '—'}</span><span>{JSON.stringify(event.metadata || {})}</span></div>)}
      </div>
    </article>}
  </section>
}

function CoachNoClient({ loading, onCreate }) {
  return <section className="coach-page"><section className="coach-empty"><CoachGlyph name={loading ? 'trend' : 'clients'} /><strong>{loading ? 'Loading your authorized clients…' : 'No client workspace is available yet.'}</strong><span>{loading ? 'The roster is being checked against your coach assignment.' : 'Create a client, then their body entries and check-ins will appear here.'}</span>{!loading && <button className="coach-primary" type="button" onClick={onCreate}>New client</button>}</section></section>
}

function PersistedCoachReview({ client, accessToken, navigate, onNotice, bodyOnly = false }) {
  const loadWorkoutHistory = useCallback(() => coachApi.getWorkoutHistory(client.id, accessToken), [client.id, accessToken])
  const reviewRequest = useRef(0)
  const [feedbackRevision, setFeedbackRevision] = useState(0)
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [savingSetup, setSavingSetup] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [draft, setDraft] = useState({ client_visible_coach_note: '', training_considerations: '', safety_notice: '' })
  const [setupDraft, setSetupDraft] = useState(setupDraftFromReview())
  const photoUrls = useRef([])
  const releasePhotoUrls = useCallback(() => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url))
    photoUrls.current = []
  }, [])
  useEffect(() => () => releasePhotoUrls(), [releasePhotoUrls])
  const load = useCallback(async () => {
    const requestId = ++reviewRequest.current
    setLoading(true)
    setError('')
    releasePhotoUrls()
    try {
      const result = await coachApi.getClientReview(client.id, accessToken)
      if (requestId !== reviewRequest.current) return
      setReview(result)
      setNoteDraft('')
      setDraft({
        client_visible_coach_note: result.coaching_context.client_visible_coach_note || '',
        training_considerations: (result.coaching_context.training_considerations || []).join('\n'),
        safety_notice: result.coaching_context.safety_notice || '',
      })
      setSetupDraft(setupDraftFromReview(result.setup))
    } catch (reason) {
      if (requestId === reviewRequest.current) setError(reason.message || 'Could not load this protected client record.')
    } finally {
      if (requestId === reviewRequest.current) setLoading(false)
    }
  }, [accessToken, client.id, releasePhotoUrls])
  useEffect(() => { load() }, [load])

  const saveGuidance = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const context = await coachApi.updateClientCoachingContext(client.id, {
        client_visible_coach_note: draft.client_visible_coach_note,
        training_considerations: draft.training_considerations.split('\n').map((item) => item.trim()).filter(Boolean),
        safety_notice: draft.safety_notice,
      }, accessToken)
      setReview((current) => ({ ...current, coaching_context: context }))
      onNotice(`Client-visible guidance saved for ${client.name}.`)
    } catch (reason) {
      onNotice(reason.message || 'Could not save client guidance.')
    } finally {
      setSaving(false)
    }
  }

  const saveNote = async (event) => {
    event.preventDefault()
    const note = noteDraft.trim()
    if (!note) return
    setSavingNote(true)
    try {
      const created = await coachApi.createPrivateNote(client.id, { note }, accessToken)
      setReview((current) => ({ ...current, private_notes: [created, ...(current.private_notes || [])] }))
      setNoteDraft('')
      onNotice('Private note saved.')
    } catch (reason) {
      onNotice(reason.message || 'Could not save private note.')
    } finally {
      setSavingNote(false)
    }
  }

  const saveSetup = async (event) => {
    event.preventDefault()
    setSavingSetup(true)
    try {
      const setup = await coachApi.updateClientSetup(client.id, {
        primary_goal: setupDraft.primary_goal,
        check_in_day: setupDraft.check_in_day,
        dietary_preferences: setupDraft.dietary_preferences,
        allergies_injuries: setupDraft.allergies_injuries,
        enabled_measurements: setupDraft.enabled_measurements.split(','),
        target_weight_kg: setupDraft.target_weight_kg === '' ? null : Number(setupDraft.target_weight_kg),
        target_waist_cm: setupDraft.target_waist_cm === '' ? null : Number(setupDraft.target_waist_cm),
        target_date: setupDraft.target_date || null,
      }, accessToken)
      setReview((current) => ({ ...current, setup }))
      setSetupDraft(setupDraftFromReview(setup))
      onNotice('Setup saved.')
    } catch (reason) {
      onNotice(reason.message || 'Could not save client setup.')
    } finally {
      setSavingSetup(false)
    }
  }

  if (loading || (review && review.client.id !== client.id)) return <CoachNoClient loading />
  if (error) return <section className="coach-page"><section className="coach-empty"><CoachGlyph name="alert" /><strong>Protected client record unavailable</strong><span>{error}</span><button className="coach-secondary" type="button" onClick={load}>Try again</button></section></section>
  const bodyEntries = review.body_entries || []
  const checkins = review.checkins || []
  const trend = bodyOnly ? null : weightTrend(bodyEntries)
  const latest = bodyEntries.at(-1)
  const heading = bodyOnly ? 'Body Tracker' : review.client.full_name
  const copy = bodyOnly ? 'Raw entries recorded by this client. No calculated health conclusions are shown.' : 'Live client signals and client-scoped coaching context.'
  const setSetupField = (field, value) => setSetupDraft((current) => ({ ...current, [field]: value }))
  return <section className="coach-page coach-has-photo-gallery">
    <CoachHeading eyebrow={`CLIENT REVIEW / ${review.client.client_code}`} title={heading} copy={copy} action={<button className="coach-quiet-button" onClick={() => navigate('Clients')}><CoachGlyph name="clients" />Back to clients</button>} />
    {!bodyOnly ? <FoundationPanel clientId={client.id} accessToken={accessToken} Status={Status} /> : null}
    {!bodyOnly && <PhotoJournal key={client.id} clientId={client.id} token={accessToken} profile={review.client} checkIns={checkins} feedbackRevision={feedbackRevision} />}
    <section className="coach-metric-grid coach-three"><article><p>LATEST WEIGHT</p><strong>{latest ? `${latest.weight_kg}` : '—'}{latest && <small> kg</small>}</strong><span>{latest ? `Logged ${formatDate(latest.entry_date)}` : 'No body entry yet'}</span></article><article><p>BODY ENTRIES</p><strong>{bodyEntries.length}</strong><span>Last 100 authorized records</span></article><article><p>CHECK-INS</p><strong className={checkins.length ? 'lime-text' : 'attention-text'}>{checkins.length}</strong><span>{checkins.length ? `Latest ${formatDate(checkins[0].period_start)}` : 'No check-in submitted'}</span></article></section>
    {!bodyOnly && (trend ? <article className="panel coach-progress-panel"><header><div><p className="kicker">WEIGHT TREND</p><span>Chronological client-recorded weights.</span></div><Status tone="good">LIVE</Status></header><div className="coach-line-chart"><svg viewBox="0 0 640 210" preserveAspectRatio="none"><path d="M0 40H640M0 105H640M0 170H640" /><polyline points={trend.points} /></svg><span>{trend.startKg} kg</span><strong>{trend.endKg} kg</strong></div><footer><span>{formatDate(trend.startDate)}</span><span>{trend.change > 0 ? '+' : trend.change < 0 ? '−' : ''}{Math.abs(trend.change)} kg</span><span>{formatDate(trend.endDate)}</span></footer></article> : <div className="coach-empty"><CoachGlyph name="trend" /><strong>No trend yet</strong><span>Two weight entries are required before a trend can be drawn.</span></div>)}
    <article className="panel coach-data-table"><header><div><p className="kicker">CLIENT-RECORDED BODY DATA</p><span>Visible only to this client and their assigned coach.</span></div><Status tone="good">LIVE</Status></header>{bodyEntries.length ? <div className="coach-table"><div className="coach-table-head"><span>DATE</span><span>WEIGHT</span><span>WAIST</span><span>HIP</span><span>BODY FAT</span><span>RECORD</span></div>{bodyEntries.map((entry) => <div className="coach-table-row" key={entry.id}><span>{formatDate(entry.entry_date)}</span><span>{entry.weight_kg} kg</span><span>{entry.waist_cm == null ? '—' : `${entry.waist_cm} cm`}</span><span>{entry.hip_cm == null ? '—' : `${entry.hip_cm} cm`}</span><span>{entry.body_fat_pct == null ? '—' : `${entry.body_fat_pct}%`}</span><Status tone="good">CLIENT</Status></div>)}</div> : <div className="coach-empty"><CoachGlyph name="trend" /><strong>No body entry yet</strong><span>Data will appear after this client records a check-in metric.</span></div>}</article>
    {!bodyOnly && <><CoachCheckIns clientId={client.id} token={accessToken} onFeedbackSaved={() => setFeedbackRevision(value => value + 1)} /><ExerciseHistory load={loadWorkoutHistory} /><section className="coach-review-grid"><form className="panel coach-setup-panel" onSubmit={saveGuidance}><header><div><p className="kicker">CLIENT-VISIBLE GUIDANCE</p><span>Only the selected client and their assigned coach can read this.</span></div><Status tone="good">SCOPED</Status></header><div className="coach-settings-form"><label className="wide-field">Coach note<textarea rows="4" value={draft.client_visible_coach_note} onChange={(event) => setDraft((current) => ({ ...current, client_visible_coach_note: event.target.value }))} placeholder="Clear, actionable coaching guidance…" /></label><label className="wide-field">Training considerations <small>One per line</small><textarea rows="3" value={draft.training_considerations} onChange={(event) => setDraft((current) => ({ ...current, training_considerations: event.target.value }))} placeholder="e.g. Monitor knee comfort" /></label><label className="wide-field">Safety boundary<textarea rows="2" value={draft.safety_notice} onChange={(event) => setDraft((current) => ({ ...current, safety_notice: event.target.value }))} /></label><footer><span>Saving creates an audit event; it never changes another client’s record.</span><button className="coach-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save client guidance'}</button></footer></div></form><section className="panel"><form className="coach-note-form" onSubmit={saveNote}><header><div><p className="kicker">PRIVATE COACH NOTES</p><span>Not visible to the client.</span></div><Status tone="good">COACH ONLY</Status></header><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows="5" maxLength="5000" placeholder="Add decision context, follow-up or plan rationale…" /><footer><span>Saving writes the note and an audit record.</span><button className="coach-primary" type="submit" disabled={savingNote || !noteDraft.trim()}>{savingNote ? 'Saving…' : 'Save note'}</button></footer></form>{review.private_notes.length ? <div className="coach-note-list">{review.private_notes.map((note) => <div key={note.id}><strong>{formatDate(note.created_at)}</strong><p>{note.note}</p></div>)}</div> : <div className="coach-empty"><CoachGlyph name="note" /><strong>No private notes</strong><span>Private notes continue to be separate from client-visible guidance.</span></div>}</section></section><article className="panel coach-setup-panel"><header><div><p className="kicker">CLIENT SETUP</p><span>Goals, check-in cadence, restrictions and tracking choices.</span></div><Status tone="good">LIVE</Status></header><form onSubmit={saveSetup} className="coach-settings-form"><label>Primary goal<select value={setupDraft.primary_goal} onChange={(event) => setSetupField('primary_goal', event.target.value)}><option value="fat_loss">Fat loss</option><option value="body_recomposition">Body recomposition</option><option value="strength">Strength</option><option value="performance">Performance</option></select></label><label>Weekly check-in day<select value={setupDraft.check_in_day} onChange={(event) => setSetupField('check_in_day', event.target.value)}>{['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => <option value={day} key={day}>{day[0].toUpperCase()}{day.slice(1)}</option>)}</select></label><label>Timezone<input value={setupDraft.timezone} readOnly /></label><label>Enabled measurements<select value={setupDraft.enabled_measurements} onChange={(event) => setSetupField('enabled_measurements', event.target.value)}><option value="weight_kg">Weight only</option><option value="weight_kg,waist_cm">Weight, waist</option><option value="weight_kg,waist_cm,body_fat_pct">Weight, waist, body fat</option><option value="weight_kg,waist_cm,hip_cm,body_fat_pct">Full body measurements</option></select></label><label>Weight target (kg)<input type="number" min="0.1" step="0.1" value={setupDraft.target_weight_kg} onChange={(event) => setSetupField('target_weight_kg', event.target.value)} /></label><label>Waist target (cm)<input type="number" min="0.1" step="0.1" value={setupDraft.target_waist_cm} onChange={(event) => setSetupField('target_waist_cm', event.target.value)} /></label><label>Target date<input type="date" value={setupDraft.target_date} onChange={(event) => setSetupField('target_date', event.target.value)} /></label><label className="wide-field">Dietary preferences<textarea rows="2" value={setupDraft.dietary_preferences} onChange={(event) => setSetupField('dietary_preferences', event.target.value)} /></label><label className="wide-field">Allergies, restrictions, injuries<textarea rows="3" value={setupDraft.allergies_injuries} onChange={(event) => setSetupField('allergies_injuries', event.target.value)} /></label><footer><span>Saving updates this client’s profile, measurements and active targets.</span><button className="coach-primary" type="submit" disabled={savingSetup}>{savingSetup ? 'Saving…' : 'Save setup'}</button></footer></form></article></>}
  </section>
}

export default function CoachWorkspace({ account, accessToken, onSignOut }) {
  const [active, setActive] = useState('Overview')
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [rosterLoading, setRosterLoading] = useState(true)
  const [rosterError, setRosterError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [profilePhoto, setProfilePhoto] = useState(null)
  const profilePhotoUrl = useRef(null)
  const accountName = account?.full_name || 'Coach'
  const accountEmail = account?.email || ''
  const accountInitials = accountName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0]
  const replaceProfilePhoto = useCallback((nextPhoto) => {
    if (profilePhotoUrl.current) URL.revokeObjectURL(profilePhotoUrl.current)
    profilePhotoUrl.current = nextPhoto?.url || null
    setProfilePhoto(nextPhoto)
  }, [])
  useEffect(() => () => {
    if (profilePhotoUrl.current) URL.revokeObjectURL(profilePhotoUrl.current)
  }, [])
  useEffect(() => {
    let cancelled = false
    const loadProfilePhoto = async () => {
      try {
        const response = await coachApi.getProfilePhoto(accessToken)
        if (!response.photo) {
          if (!cancelled) replaceProfilePhoto(null)
          return
        }
        const url = await coachApi.getPrivateProfilePhotoUrl(response.photo.content_url, accessToken)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        replaceProfilePhoto({ ...response.photo, url })
      } catch {
        if (!cancelled) replaceProfilePhoto(null)
      }
    }
    loadProfilePhoto()
    return () => { cancelled = true }
  }, [accessToken, replaceProfilePhoto])
  const uploadProfilePhoto = useCallback(async (file) => {
    const response = await coachApi.uploadProfilePhoto(file, accessToken)
    const nextPhoto = {
      ...response.photo,
      url: await coachApi.getPrivateProfilePhotoUrl(response.photo.content_url, accessToken),
    }
    replaceProfilePhoto(nextPhoto)
    return nextPhoto
  }, [accessToken, replaceProfilePhoto])
  const loadClients = useCallback(async () => {
    setRosterLoading(true)
    setRosterError('')
    try {
      const response = await coachApi.listClients(accessToken)
      const nextClients = response.items.map(apiClientToWorkspaceClient)
      setClients(nextClients)
      setSelectedClientId((current) => nextClients.some((client) => client.id === current) ? current : (nextClients[0]?.id || ''))
    } catch (reason) {
      setClients([])
      setSelectedClientId('')
      setRosterError(reason.message || 'Could not load your assigned client roster.')
    } finally {
      setRosterLoading(false)
    }
  }, [accessToken])
  useEffect(() => { loadClients() }, [loadClients])
  const pageCopy = { Overview: ['Command Center', 'Precision coaching, progress intelligence and client operations.'], Clients: ['Clients', 'Every client record, one controlled workspace.'], Review: ['Client Review', 'Unified history, plans and private coach context.'], 'Body Tracker': ['Body Tracker', 'Raw data, calculation engine and longitudinal progress.'], Nutrition: ['Nutrition', 'Build precise plans from controlled nutrition data.'], Workout: ['Workout', 'Build, publish and review training programs.'], Libraries: ['Libraries', 'Food and exercise source libraries.'], Settings: ['Settings', 'Coach-wide configuration and controlled data tools.'], Health: ['Health', 'Assigned-client safety context. Not medical advice.'], 'Audit Log': ['Audit Log', 'Actions recorded for this authenticated coach.'] }
  const choose = (label) => { setActive(label); setNotice('') }
  const openReview = (id = selectedClientId) => { setSelectedClientId(id); choose('Review') }
  const addClient = (created) => {
    const name = created.full_name
    const client = {
      id: created.id,
      code: created.client_code,
      name,
      initials: name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      weight: '—',
      lastEntry: 'No entry',
      checkIn: 'Invitation sent',
      status: 'Needs setup',
      goal: created.primary_goal.replaceAll('_', ' '),
      checkInDay: created.check_in_day[0].toUpperCase() + created.check_in_day.slice(1),
      attention: true,
    }
    setClients((current) => [...current, client])
    setSelectedClientId(client.id)
    return client
  }
  const createClient = async (draft) => {
    const created = await coachApi.createClient(draft, accessToken)
    const client = addClient(created)
    await loadClients()
    setNotice(`${client.name} was created and sent a secure account-setup invitation.`)
    return created
  }
  const requiresClient = ['Review', 'Body Tracker', 'Nutrition', 'Workout', 'Health'].includes(active)
  const unavailableClientPage = requiresClient && (!selectedClient || rosterLoading)
  const page = unavailableClientPage ? <CoachNoClient loading={rosterLoading} onCreate={() => setShowCreate(true)} />
    : active === 'Overview' ? <CoachOverview clients={clients} selectClient={openReview} navigate={choose} onCreate={() => setShowCreate(true)} />
    : active === 'Clients' ? <CoachClients clients={clients} onSelectClient={openReview} onCreateClient={createClient} notice={setNotice} />
      : active === 'Review' ? <PersistedCoachReview key={selectedClient.id} client={selectedClient} accessToken={accessToken} navigate={choose} onNotice={setNotice} />
        : active === 'Body Tracker' ? <PersistedCoachReview key={selectedClient.id} client={selectedClient} accessToken={accessToken} navigate={choose} onNotice={setNotice} bodyOnly />
          : active === 'Nutrition' ? <CoachNutrition clientId={selectedClientId} clients={clients} setClientId={setSelectedClientId} accessToken={accessToken} />
            : active === 'Workout' ? <CoachWorkout clientId={selectedClientId} clients={clients} setClientId={setSelectedClientId} accessToken={accessToken} />
              : active === 'Libraries' ? <CoachLibraries notice={setNotice} accessToken={accessToken} />
                : active === 'Settings' ? <CoachSettings notice={setNotice} account={account} profilePhoto={profilePhoto} onUploadProfilePhoto={uploadProfilePhoto} accessToken={accessToken} />
                  : active === 'Health' ? <CoachHealth key={selectedClient.id} clientId={selectedClientId} clients={clients} setClientId={setSelectedClientId} accessToken={accessToken} navigate={choose} />
                    : <CoachAudit accessToken={accessToken} />
  return <div className="os-shell coach-shell">
    <aside className="os-sidebar">
      <div className="os-brand" aria-label="XForm Coaching OS"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
      <p className="workspace-label">COACH WORKSPACE</p>
      <nav className="os-navigation" aria-label="Coach navigation">{coachNavigation.map(([icon, label]) => <button className={active === label ? 'active' : ''} onClick={() => choose(label)} key={label}><CoachGlyph name={icon} /><span>{label}</span></button>)}</nav>
      <div className="account-block"><div className="account-detail"><span className="account-avatar">{profilePhoto?.url ? <img src={profilePhoto.url} alt="" /> : accountInitials}</span><span><strong>{accountName}</strong><small>{accountEmail}</small></span></div><button onClick={onSignOut}>Sign out</button></div>
    </aside>
    <main className="os-main">
      <header className="os-topbar"><button className="mobile-menu" onClick={() => setNotice('Use bottom navigation on mobile.')} aria-label="Open navigation"><CoachGlyph name="menu" /></button><div><h1>{pageCopy[active][0]}</h1><p>{pageCopy[active][1]}</p></div><div className="coach-top-actions"><span className="online-state"><i />Authenticated coach</span></div></header>
      <div className="os-content">{(notice || rosterError) && <div className="os-notice" role="status"><span>{notice || rosterError}</span><button onClick={() => { setNotice(''); setRosterError('') }} aria-label="Dismiss message"><CoachGlyph name="close" /></button></div>}{page}</div>
    </main>
    <nav className="mobile-navigation coach-mobile-nav" aria-label="Mobile coach navigation">{coachNavigation.map(([icon, label]) => <button onClick={() => choose(label)} className={active === label ? 'active' : ''} key={label}><CoachGlyph name={icon} /><span>{label === 'Body Tracker' ? 'Body' : label}</span></button>)}</nav>
    {showCreate && <NewClientForm onCancel={() => setShowCreate(false)} onCreate={createClient} />}
  </div>
}
