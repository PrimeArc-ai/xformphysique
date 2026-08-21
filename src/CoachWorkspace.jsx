import { useMemo, useState } from 'react'
import { coachApi } from './api/coach'

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

const reviewTabs = ['Overview', 'Progress', 'Check-ins', 'Photos', 'Plans', 'Notes', 'Setup']
const foodItems = [
  ['Chicken breast', 'Protein', '31g P · 165 kcal'],
  ['Greek yoghurt', 'Dairy', '10g P · 73 kcal'],
  ['Basmati rice', 'Carbohydrate', '28g C · 130 kcal'],
  ['Avocado', 'Fats', '15g F · 160 kcal'],
]
const exerciseItems = [
  ['Goblet squat', 'Lower body', 'Strength'],
  ['Romanian deadlift', 'Lower body', 'Strength'],
  ['Incline dumbbell press', 'Upper body', 'Strength'],
  ['Cable row', 'Upper body', 'Strength'],
]

const clientPreviews = {
  'XP-0017': { average: '68.8 kg', tracking: '86%', start: '70.1 kg', change: '−1.7 kg', points: '15,37 100,52 185,70 270,82 355,117 440,128 525,151 625,164', targetWeight: '65.0 kg', targetWaist: '71.0 cm', targetProgress: '74%', waistProgress: '62%', targetDate: '18 Oct 2026', energy: '4/5', sleep: '3/5', sentiment: 'Good', adherence: '4/5', whatWentWell: 'Training felt more consistent and meals were easier to prepare this week.', context: 'Right knee felt sensitive after a long walk. No pain during training.', restrictions: 'Dairy-aware · shellfish-free', consideration: 'Monitor right knee comfort', alert: null, alertDetail: null, program: 'Lower body strength', programWeek: 'Week 03', sessions: '3/4', nutrition: '1,860', protein: '135', mealPlan: 'Recomposition baseline', meals: [['Breakfast', 'Greek yoghurt bowl', '420 kcal', 'P 35 · C 41 · F 13'], ['Lunch', 'Chicken harvest salad', '530 kcal', 'P 45 · C 51 · F 15'], ['Dinner', 'Miso salmon bowl', '610 kcal', 'P 46 · C 58 · F 21']] },
  'XP-0024': { average: '82.6 kg', tracking: '43%', start: '86.2 kg', change: '−4.1 kg', points: '15,39 100,55 185,75 270,83 355,108 440,129 525,146 625,160', targetWeight: '78.0 kg', targetWaist: '88.0 cm', targetProgress: '50%', waistProgress: '38%', targetDate: '25 Nov 2026', energy: '2/5', sleep: '2/5', sentiment: 'Difficult', adherence: '2/5', whatWentWell: 'Meals were easier on weekdays when prepared in advance.', context: 'Travel disrupted routine. Ask for check-in before changing plan.', restrictions: 'Vegetarian weekdays · lactose-light', consideration: 'Keep running volume gradual', alert: 'Weight not recorded for 4 days.', alertDetail: 'Threshold: 3 days.', program: 'Strength foundation', programWeek: 'Week 02', sessions: '2/4', nutrition: '2,140', protein: '150', mealPlan: 'Fat-loss baseline', meals: [['Breakfast', 'Protein oats', '460 kcal', 'P 34 · C 51 · F 14'], ['Lunch', 'Paneer grain bowl', '610 kcal', 'P 42 · C 62 · F 20'], ['Dinner', 'Lentil curry plate', '580 kcal', 'P 38 · C 68 · F 16']] },
  'XP-0031': { average: '—', tracking: '0%', start: '—', change: '—', points: null, targetWeight: 'Set target', targetWaist: 'Set target', targetProgress: '0%', waistProgress: '0%', targetDate: 'Not set', energy: '—', sleep: '—', sentiment: 'No check-in', adherence: '—', whatWentWell: 'No weekly check-in submitted yet.', context: 'Complete onboarding and request first body entry.', restrictions: 'Not recorded', consideration: 'Not recorded', alert: 'No body entry for 9 days.', alertDetail: 'Onboarding data is incomplete.', program: 'No workout plan', programWeek: 'Not assigned', sessions: '—', nutrition: '—', protein: '—', mealPlan: 'No nutrition plan', meals: [] },
  'XP-0034': { average: '75.1 kg', tracking: '100%', start: '76.0 kg', change: '−1.2 kg', points: '15,42 100,48 185,61 270,79 355,86 440,108 525,121 625,139', targetWeight: '72.0 kg', targetWaist: '78.0 cm', targetProgress: '31%', waistProgress: '24%', targetDate: '06 Dec 2026', energy: '5/5', sleep: '4/5', sentiment: 'Great', adherence: '5/5', whatWentWell: 'All planned sessions completed with good energy.', context: 'Ready for a small load progression next review.', restrictions: 'No active restrictions', consideration: 'Monitor shoulder range during pressing', alert: null, alertDetail: null, program: 'Performance build', programWeek: 'Week 05', sessions: '4/4', nutrition: '2,380', protein: '160', mealPlan: 'Performance baseline', meals: [['Breakfast', 'Egg and rice bowl', '510 kcal', 'P 37 · C 59 · F 15'], ['Lunch', 'Chicken rice plate', '710 kcal', 'P 55 · C 82 · F 18'], ['Dinner', 'Salmon potato tray', '650 kcal', 'P 49 · C 54 · F 23']] },
}

function getClientPreview(client) {
  return clientPreviews[client.id] ?? { average: '—', tracking: '0%', start: '—', change: '—', points: null, targetWeight: 'Set target', targetWaist: 'Set target', targetProgress: '0%', waistProgress: '0%', targetDate: 'Not set', energy: '—', sleep: '—', sentiment: 'No check-in', adherence: '—', whatWentWell: 'No check-in in this local preview.', context: 'Complete client setup before interpreting progress.', restrictions: 'Not recorded', consideration: 'Not recorded', alert: 'No entries recorded.', alertDetail: 'Add first client body signal.', program: 'No workout plan', programWeek: 'Not assigned', sessions: '—', nutrition: '—', protein: '—', mealPlan: 'No nutrition plan', meals: [] }
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

function Status({ children, tone = '' }) {
  return <span className={`coach-status ${tone}`}>{children}</span>
}

function ClientSelect({ clientId, clients, onChange }) {
  return <label className="coach-client-select">CLIENT<select value={clientId} onChange={(event) => onChange(event.target.value)}>{clients.map((client) => <option value={client.id} key={client.id}>{client.name} · {client.id}</option>)}</select></label>
}

function CoachOverview({ clients, selectClient, navigate, onCreate }) {
  const attention = clients.filter((client) => client.attention)
  return <section className="coach-page">
    <CoachHeading eyebrow="XFORMPHYSIQUE / COACH" title={<>Control system.<em> See signal.</em></>} copy="Progress intelligence and client operations in one controlled workspace." action={<button className="coach-primary" onClick={onCreate}><CoachGlyph name="plus" />New client</button>} />
    <section className="coach-metric-grid">
      <article><p>ACTIVE CLIENTS</p><strong>{clients.length}</strong><span>Client workspaces</span></article>
      <article><p>NEEDS REVIEW</p><strong className="attention-text">{attention.length}</strong><span>Missing signal or overdue check-in</span></article>
      <article><p>PUBLISHED PLANS</p><strong>6</strong><span>Training + nutrition</span></article>
      <article><p>WEEKLY CHECK-INS</p><strong className="lime-text">75<small>%</small></strong><span>Submitted this cycle</span></article>
    </section>
    <section className="coach-overview-grid">
      <article className="panel coach-pulse-panel"><header><div><p className="kicker">CLIENT PULSE</p><span>Start with what needs attention.</span></div><button className="quiet-link" onClick={() => navigate('Clients')}>View roster <CoachGlyph name="chevron" /></button></header><div className="coach-table" role="table" aria-label="Client pulse"><div className="coach-table-head" role="row"><span>CLIENT</span><span>WEIGHT</span><span>LAST ENTRY</span><span>CHECK-IN</span><span>STATUS</span><span /></div>{clients.map((client) => <div className="coach-table-row" role="row" key={client.id}><span className="client-cell"><i>{client.initials}</i><b>{client.name}<small>{client.id}</small></b></span><span>{client.weight}</span><span>{client.lastEntry}</span><span>{client.checkIn}</span><Status tone={client.attention ? 'warning' : 'good'}>{client.status}</Status><button className="row-open" onClick={() => selectClient(client.id)}>Review <CoachGlyph name="chevron" /></button></div>)}</div></article>
      <article className="panel coach-attention-panel"><header><div><p className="kicker">ATTENTION QUEUE</p><span>Rule-based preview.</span></div><Status tone="preview">LOCAL</Status></header><div className="attention-list">{attention.map((client) => <button key={client.id} onClick={() => selectClient(client.id)}><span className="attention-icon"><CoachGlyph name="alert" /></span><span><strong>{client.name}</strong><small>{client.status === 'Missing data' ? 'No body entry for 9 days' : 'Weekly check-in due'}</small></span><CoachGlyph name="chevron" /></button>)}</div><p className="panel-footnote">Thresholds and reminders connect when backend arrives.</p></article>
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
  return <section className="coach-page"><CoachHeading eyebrow="COACH / CLIENT OPERATIONS" title="Clients" copy="Every client record, one controlled workspace." action={<button className="coach-primary" onClick={() => setShowCreate(true)}><CoachGlyph name="plus" />New client</button>} /><div className="coach-roster-tools"><label className="coach-search"><CoachGlyph name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients or ID" /></label><div className="coach-filter-group" aria-label="Client filters">{['All', 'Needs attention', 'On track', 'Missing data'].map((option) => <button className={filter === option ? 'selected' : ''} onClick={() => setFilter(option)} key={option}>{option}</button>)}</div><button className="coach-quiet-button" onClick={() => notice('CSV preview needs backend validation endpoint.')}><CoachGlyph name="export" />CSV preview</button></div><section className="coach-client-list">{matches.map((client) => <article key={client.id}><div className="roster-avatar">{client.initials}</div><div className="roster-primary"><strong>{client.name}</strong><span>{client.id} · {client.goal}</span></div><div><small>WEIGHT</small><span>{client.weight}</span></div><div><small>LAST ENTRY</small><span>{client.lastEntry}</span></div><div><small>CHECK-IN</small><span>{client.checkIn}</span></div><Status tone={client.attention ? 'warning' : 'good'}>{client.status}</Status><button className="row-open" onClick={() => onSelectClient(client.id)}>Review <CoachGlyph name="chevron" /></button></article>)}</section>{!matches.length && <div className="coach-empty"><CoachGlyph name="search" /><strong>No matching clients</strong><span>Change search or filter.</span></div>}{showCreate && <NewClientForm onCancel={() => setShowCreate(false)} onCreate={onCreateClient} />}</section>
}

function CoachReview({ client, navigate }) {
  const preview = getClientPreview(client)
  const [tab, setTab] = useState('Overview')
  const [note, setNote] = useState('')
  const [notes, setNotes] = useState([preview.context])
  const [setupSaved, setSetupSaved] = useState(false)
  const [setup, setSetup] = useState({ goal: client.goal, targetWeight: preview.targetWeight, checkInDay: client.checkInDay, measurements: 'Weight, waist', context: `${preview.restrictions}. ${preview.consideration}.`, note: preview.context })
  const saveNote = (event) => { event.preventDefault(); if (!note.trim()) return; setNotes((current) => [note.trim(), ...current]); setNote('') }
  const setSetupField = (field, value) => setSetup((current) => ({ ...current, [field]: value }))
  const hasSignal = Boolean(preview.points)
  const content = {
    Overview: <><section className="coach-review-metrics"><article><p>CURRENT WEIGHT</p><strong>{client.weight}</strong><span>Last entry {client.lastEntry.toLowerCase()}</span></article><article><p>CHECK-IN</p><strong>{client.checkIn}</strong><span>Scheduled {client.checkInDay}</span></article><article><p>PLAN ADHERENCE</p><strong>{preview.adherence}</strong><span>Logged sessions this week</span></article><article><p>DATA QUALITY</p><strong className={client.attention ? 'attention-text' : 'lime-text'}>{client.attention ? 'Review' : 'Good'}</strong><span>{client.attention ? 'Signal needs attention' : 'Enough recent data'}</span></article></section><section className="coach-review-grid"><article className="panel"><header><div><p className="kicker">COACH SUMMARY</p><span>Single client context.</span></div><button className="quiet-link" onClick={() => setTab('Setup')}>Edit setup <CoachGlyph name="chevron" /></button></header><dl className="coach-detail-list"><div><dt>Goal</dt><dd>{setup.goal}</dd></div><div><dt>Target</dt><dd>{setup.targetWeight} · {preview.targetWaist}</dd></div><div><dt>Restrictions</dt><dd>{preview.restrictions}</dd></div><div><dt>Training consideration</dt><dd>{preview.consideration}</dd></div></dl></article><article className="panel"><header><div><p className="kicker">NEXT REVIEW</p><span>Priority signal.</span></div><Status tone={client.attention ? 'warning' : 'good'}>{client.status}</Status></header><div className="coach-review-callout"><CoachGlyph name={client.attention ? 'alert' : 'check'} /><div><strong>{client.attention ? 'Close missing signal first.' : 'Client is progressing steadily.'}</strong><span>{client.attention ? preview.context : 'Review check-in, then consider next target adjustment.'}</span></div></div></article></section></>,
    Progress: hasSignal ? <section className="coach-review-grid"><article className="panel coach-progress-panel"><header><div><p className="kicker">WEIGHT TREND</p><span>Selected client local preview.</span></div><Status tone="preview">LOCAL</Status></header><div className="coach-line-chart"><svg viewBox="0 0 640 210" preserveAspectRatio="none"><path d="M0 40H640M0 105H640M0 170H640" /><polyline points={preview.points} /></svg><span>{preview.start}</span><strong>{client.weight}</strong></div><footer><span>14 AUG</span><span>{preview.change}</span><span>20 AUG</span></footer></article><article className="panel"><header><div><p className="kicker">TARGETS & PACE</p><span>Coach-owned targets.</span></div></header><div className="coach-target-list"><div><span>Weight target</span><strong>{setup.targetWeight}</strong><i><b style={{ width: preview.targetProgress }} /></i></div><div><span>Waist target</span><strong>{preview.targetWaist}</strong><i><b style={{ width: preview.waistProgress }} /></i></div><div><span>Target date</span><strong>{preview.targetDate}</strong></div></div></article></section> : <div className="coach-empty"><CoachGlyph name="trend" /><strong>No trend yet</strong><span>First body entry starts selected client progress.</span></div>,
    'Check-ins': <article className="panel"><header><div><p className="kicker">WEEKLY CHECK-IN</p><span>Selected client-reported context.</span></div><Status tone={client.checkIn === 'Submitted' ? 'good' : 'warning'}>{client.checkIn.toUpperCase()}</Status></header><div className="coach-checkin-grid"><div><small>ENERGY</small><strong>{preview.energy}</strong></div><div><small>SLEEP</small><strong>{preview.sleep}</strong></div><div><small>PROGRESS</small><strong>{preview.sentiment}</strong></div><div><small>ADHERENCE</small><strong>{preview.adherence} days</strong></div></div><div className="coach-checkin-copy"><strong>What went well</strong><p>{preview.whatWentWell}</p><strong>Coach context</strong><p>{preview.context}</p></div></article>,
    Photos: <section className="coach-photo-review">{['Front', 'Side', 'Back'].map((view, index) => <article key={view}><span>{view.toUpperCase()}</span><div>{hasSignal && index < 2 ? 'Private photo preview\nbackend storage required' : 'No photo uploaded'}</div><small>{hasSignal && index < 2 ? 'Review after secure upload' : '—'}</small></article>)}</section>,
    Plans: <section className="coach-review-grid"><article className="panel"><header><div><p className="kicker">WORKOUT PLAN</p><span>{preview.program} · {preview.programWeek}</span></div><button className="quiet-link" onClick={() => navigate('Workout')}>Open plan <CoachGlyph name="chevron" /></button></header><div className="coach-mini-plan"><strong>{preview.sessions === '—' ? 'Not assigned' : '4 movements'}</strong><span>{preview.sessions === '—' ? 'Assign workout plan from coach workspace.' : `${preview.sessions} sessions this week · published preview`}</span></div></article><article className="panel"><header><div><p className="kicker">MEAL PLAN</p><span>{preview.mealPlan} · {preview.nutrition === '—' ? 'No target' : `${preview.nutrition} kcal`}</span></div><button className="quiet-link" onClick={() => navigate('Nutrition')}>Open plan <CoachGlyph name="chevron" /></button></header><div className="coach-mini-plan"><strong>{preview.meals.length ? '3 meal blocks' : 'Not assigned'}</strong><span>{preview.meals.length ? `${preview.restrictions} · reviewed preview` : 'Assign nutrition plan from coach workspace.'}</span></div></article></section>,
    Notes: <section className="coach-review-grid"><form className="panel coach-note-form" onSubmit={saveNote}><header><div><p className="kicker">PRIVATE COACH NOTE</p><span>Visible to coach only.</span></div><Status tone="preview">LOCAL</Status></header><textarea value={note} onChange={(event) => setNote(event.target.value)} rows="6" placeholder="Add decision context, follow-up or plan rationale…" /><footer><span>Backend adds author, timestamp and audit record.</span><button className="coach-primary" type="submit">Save note</button></footer></form><article className="panel"><header><div><p className="kicker">RECENT NOTES</p><span>{notes.length} in preview</span></div></header><div className="coach-note-list">{notes.map((item, index) => <div key={`${item}-${index}`}><strong>Coach · today</strong><p>{item}</p></div>)}</div></article></section>,
    Setup: <article className="panel coach-setup-panel"><header><div><p className="kicker">CLIENT SETUP</p><span>Goals, check-in cadence, restrictions and tracking choices.</span></div><Status tone="preview">LOCAL</Status></header><form onSubmit={(event) => { event.preventDefault(); setSetupSaved(true) }} className="coach-settings-form"><label>Primary goal<select value={setup.goal} onChange={(event) => setSetupField('goal', event.target.value)}><option>Fat loss</option><option>Body recomposition</option><option>Strength</option><option>Performance</option></select></label><label>Weight target<input value={setup.targetWeight} onChange={(event) => setSetupField('targetWeight', event.target.value)} /></label><label>Weekly check-in day<select value={setup.checkInDay} onChange={(event) => setSetupField('checkInDay', event.target.value)}><option>Sunday</option><option>Wednesday</option><option>Friday</option></select></label><label>Enabled measurements<select value={setup.measurements} onChange={(event) => setSetupField('measurements', event.target.value)}><option>Weight, waist</option><option>Weight, waist, body fat</option><option>Weight only</option></select></label><label className="wide-field">Preferences, allergies and injuries<textarea rows="4" value={setup.context} onChange={(event) => setSetupField('context', event.target.value)} /></label><label className="wide-field">Private coach context<textarea rows="3" value={setup.note} onChange={(event) => setSetupField('note', event.target.value)} /></label><footer><span>{setupSaved ? 'Setup saved in local preview.' : 'Changes remain in local preview.'}</span><button className="coach-primary">Save setup</button></footer></form></article>,
  }
  return <section className="coach-page"><CoachHeading eyebrow={`CLIENT REVIEW / ${client.id}`} title={client.name} copy={`${setup.goal} · one unified review surface.`} action={<button className="coach-quiet-button" onClick={() => navigate('Clients')}><CoachGlyph name="clients" />Back to clients</button>} /><div className="coach-review-tabs">{reviewTabs.map((item) => <button className={tab === item ? 'selected' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div><div className="coach-review-content">{content[tab]}</div></section>
}

function CoachBodyTracker({ clientId, clients, setClientId, openReview }) {
  const client = clients.find((item) => item.id === clientId) ?? clients[0]
  const preview = getClientPreview(client)
  const hasSignal = Boolean(preview.points)
  const alerts = preview.alert ? [[preview.alert, preview.alertDetail], ['Measurements need review.', client.attention ? 'Update client setup before interpreting trends.' : 'Last waist entry is still current.']] : []
  return <section className="coach-page"><CoachHeading eyebrow="COACH / BODY INTELLIGENCE" title="Body Tracker" copy="Raw entries, protected calculations, targets and data quality." action={<ClientSelect clientId={client.id} clients={clients} onChange={setClientId} />} /><section className="coach-metric-grid coach-four"><article><p>CURRENT WEIGHT</p><strong>{client.weight}</strong><span>Latest client entry</span></article><article><p>7 DAY AVERAGE</p><strong>{preview.average}</strong><span>Rolling calculation</span></article><article><p>TRACKING RATE</p><strong className={client.attention ? 'attention-text' : 'lime-text'}>{preview.tracking}</strong><span>Last 7 days</span></article><article><p>DATA QUALITY</p><strong className={client.attention ? 'attention-text' : 'lime-text'}>{client.attention ? 'Review' : 'Good'}</strong><span>Threshold preview</span></article></section><section className="coach-review-grid"><article className="panel coach-progress-panel"><header><div><p className="kicker">WEIGHT TREND</p><span>Daily raw entries, rolling average available.</span></div><button className="quiet-link" onClick={openReview}>Open client review <CoachGlyph name="chevron" /></button></header>{hasSignal ? <><div className="coach-line-chart"><svg viewBox="0 0 640 210" preserveAspectRatio="none"><path d="M0 40H640M0 105H640M0 170H640" /><polyline points={preview.points} /></svg><span>{preview.start}</span><strong>{client.weight}</strong></div><footer><span>14 AUG</span><span>{preview.change}</span><span>20 AUG</span></footer></> : <div className="coach-empty"><CoachGlyph name="trend" /><strong>No selected-client trend</strong><span>Add first body entry to calculate progress.</span></div>}</article><article className="panel"><header><div><p className="kicker">STATUS & ALERTS</p><span>Derived from configured thresholds.</span></div><Status tone={client.attention ? 'warning' : 'good'}>{client.status}</Status></header>{alerts.length ? <div className="coach-alert-list">{alerts.map(([message, detail]) => <div key={message}><CoachGlyph name="alert" /><span><strong>{message}</strong><small>{detail}</small></span></div>)}</div> : <div className="coach-review-callout"><CoachGlyph name="check" /><div><strong>No active body-data alert.</strong><span>Selected client has recent signal in this local preview.</span></div></div>}<button className="coach-secondary" onClick={() => openReview()}>Review client context</button></article></section><article className="panel coach-data-table"><header><div><p className="kicker">WEEKLY DATA QUALITY</p><span>Raw data stays separate from calculated results.</span></div><Status tone="preview">PREVIEW</Status></header>{hasSignal ? <div className="coach-table"><div className="coach-table-head"><span>WEEK</span><span>AVG WEIGHT</span><span>Δ WEEK</span><span>WAIST</span><span>ENTRIES</span><span>CHECK-IN</span></div><div className="coach-table-row"><span>18–24 AUG</span><span>{preview.average}</span><span className="lime-text">{preview.change}</span><span>{preview.targetWaist}</span><span>{preview.tracking}</span><span>{client.checkIn}</span></div></div> : <div className="coach-empty"><CoachGlyph name="file" /><strong>No weekly data yet</strong><span>First entries make data-quality review available.</span></div>}</article></section>
}

function CoachNutrition({ clientId, clients, setClientId, notice }) {
  const client = clients.find((item) => item.id === clientId) ?? clients[0]
  const preview = getClientPreview(client)
  const hasPlan = preview.meals.length > 0
  return <section className="coach-page"><CoachHeading eyebrow="COACH / NUTRITION PLANS" title="Nutrition" copy="Build precise meal plans. Assign portions, targets and substitutions." action={<div className="coach-heading-actions"><ClientSelect clientId={clientId} clients={clients} onChange={setClientId} /><button className="coach-primary" onClick={() => notice('Nutrition plan builder is frontend preview only.')}>New plan</button></div>} /><section className="coach-metric-grid coach-three"><article><p>ACTIVE PLAN</p><strong>{preview.nutrition}{preview.nutrition !== '—' && <small> kcal</small>}</strong><span>{preview.mealPlan}</span></article><article><p>MACRO TARGET</p><strong>{preview.protein}{preview.protein !== '—' && <small> g</small>}</strong><span>Protein target for selected client</span></article><article><p>ADHERENCE</p><strong className={client.attention ? 'attention-text' : 'lime-text'}>{preview.adherence}</strong><span>Meal days logged this week</span></article></section><section className="coach-review-grid"><article className="panel coach-plan-panel"><header><div><p className="kicker">ASSIGNED MEAL PLAN</p><span>{hasPlan ? 'One option per meal. Alternatives never double-counted.' : 'No plan assigned to selected client.'}</span></div>{hasPlan && <button className="quiet-link" onClick={() => notice('Plan editing connects to backend publishing later.')}>Edit plan <CoachGlyph name="chevron" /></button>}</header>{hasPlan ? <div className="coach-meal-list">{preview.meals.map(([time, name, energy, macros]) => <div key={time}><span>{time}</span><strong>{name}<small>{macros}</small></strong><b>{energy}</b><button onClick={() => notice(`${name} plan preview opened.`)}>View</button></div>)}</div> : <div className="coach-empty"><CoachGlyph name="food" /><strong>No nutrition plan</strong><span>Create or assign one for {client.name}.</span></div>}</article><article className="panel"><header><div><p className="kicker">ASSIGNMENT CONTEXT</p><span>Plan constraints travel with assignment.</span></div></header><dl className="coach-detail-list"><div><dt>Restrictions</dt><dd>{preview.restrictions}</dd></div><div><dt>Substitutions</dt><dd>{hasPlan ? 'Approved only' : 'No plan context'}</dd></div><div><dt>Version</dt><dd>{hasPlan ? 'v3 · published preview' : 'Not assigned'}</dd></div><div><dt>Recipe helper</dt><dd>{hasPlan ? 'Assigned ingredients only' : 'Unavailable without plan'}</dd></div></dl></article></section><article className="panel coach-version-panel"><header><div><p className="kicker">PLAN VERSIONS</p><span>Published plan history appears after backend integration.</span></div><Status tone="preview">LOCAL</Status></header><div><strong>{hasPlan ? `v3 · ${preview.mealPlan}` : 'No plan version'}</strong><span>{hasPlan ? 'Current selected-client preview' : 'Assign plan to start version history.'}</span></div></article></section>
}

function CoachWorkout({ clientId, clients, setClientId, notice }) {
  const [builder, setBuilder] = useState(false)
  const [published, setPublished] = useState(false)
  const client = clients.find((item) => item.id === clientId) ?? clients[0]
  const preview = getClientPreview(client)
  const hasPlan = preview.sessions !== '—'
  const programTitle = published ? 'Preview program' : preview.program
  const programWeek = published ? 'Week 04' : preview.programWeek
  return <section className="coach-page"><CoachHeading eyebrow="COACH / WORKOUT PLANS" title="Workout" copy="Build days, select exercises and publish training programs." action={<div className="coach-heading-actions"><ClientSelect clientId={clientId} clients={clients} onChange={setClientId} /><button className="coach-primary" onClick={() => setBuilder(true)}>New plan</button></div>} /><section className="coach-metric-grid coach-three"><article><p>ACTIVE PROGRAM</p><strong>{programWeek}</strong><span>{programTitle}</span></article><article><p>COMPLETION</p><strong className={client.attention ? 'attention-text' : 'lime-text'}>{preview.sessions}</strong><span>Sessions this week</span></article><article><p>PROGRAM VERSION</p><strong>{published ? 'v3' : hasPlan ? 'v2' : '—'}</strong><span>{published ? 'Published in local preview' : hasPlan ? 'Published preview' : 'No assigned program'}</span></article></section><section className="coach-review-grid"><article className="panel coach-plan-panel"><header><div><p className="kicker">PUBLISHED PROGRAM</p><span>{hasPlan ? `${programTitle} · 3 days/week.` : 'No workout plan assigned to selected client.'}</span></div>{hasPlan && <button className="quiet-link" onClick={() => setBuilder(true)}>Edit plan <CoachGlyph name="chevron" /></button>}</header>{hasPlan ? <div className="coach-workout-days">{[['Day 01', 'Lower strength', 'Goblet squat · Romanian deadlift · Split squat'], ['Day 02', 'Upper strength', 'Incline press · Cable row · Lateral raise'], ['Day 03', 'Conditioning', 'Intervals · Carry · Core']].map(([day, title, moves]) => <div key={day}><span>{day}</span><strong>{title}<small>{moves}</small></strong><Status tone="good">PUBLISHED</Status></div>)}</div> : <div className="coach-empty"><CoachGlyph name="exercise" /><strong>No workout plan</strong><span>Create or assign one for {client.name}.</span></div>}</article><article className="panel"><header><div><p className="kicker">COACH REVIEW</p><span>Selected-client session signal.</span></div></header><div className="coach-session-list">{hasPlan ? <><div><strong>{programTitle}</strong><span>{client.attention ? 'Needs check-in' : 'Completed · RPE 7'}</span></div><div><strong>Next session</strong><span>{client.attention ? 'Pause for review' : 'Planned · Thu'}</span></div></> : <div><strong>No session data</strong><span>Assign program first</span></div>}</div><button className="coach-secondary" onClick={() => notice('Session adjustments need API persistence.')}>Adjust client session</button></article></section>{builder && <WorkoutBuilder onClose={() => { setBuilder(false); notice('Workout draft saved in local preview.') }} onPublish={() => { setBuilder(false); setPublished(true); notice('Workout plan published in local preview.') }} />}</section>
}

function WorkoutBuilder({ onClose, onPublish }) {
  return <div className="modal-backdrop"><section className="signal-modal coach-modal coach-builder"><button className="modal-close" onClick={onClose} aria-label="Close workout builder"><CoachGlyph name="close" /></button><p className="kicker">WORKOUT BUILDER</p><h2>Lower strength plan</h2><p>Build plan structure now. Exercise library and publishing connect later.</p><label>Plan name<input defaultValue="Lower strength · Week 04" /></label><label>Coach notes<textarea rows="3" defaultValue="Move with control. Leave two reps in reserve." /></label><div className="coach-builder-days"><div><span>DAY 01</span><strong>Lower strength</strong><button>+ Add exercise</button></div><div><span>DAY 02</span><strong>Upper strength</strong><button>+ Add exercise</button></div></div><footer className="coach-modal-footer"><button className="coach-secondary" onClick={onClose}>Save draft</button><button className="coach-primary" onClick={onPublish}>Publish plan</button></footer></section></div>
}

function CoachLibraries({ notice }) {
  const [library, setLibrary] = useState('Food Library')
  const [query, setQuery] = useState('')
  const items = library === 'Food Library' ? foodItems : exerciseItems
  const filtered = items.filter((item) => item.join(' ').toLowerCase().includes(query.toLowerCase()))
  return <section className="coach-page"><CoachHeading eyebrow="COACH / SOURCE LIBRARIES" title="Libraries" copy="Source-of-truth food and exercise references for plans." action={<button className="coach-primary" onClick={() => notice('Library editing connects to backend storage later.')}><CoachGlyph name="plus" />Add item</button>} /><div className="coach-library-tools"><div className="coach-tab-switch">{['Food Library', 'Exercise Library'].map((item) => <button className={library === item ? 'selected' : ''} onClick={() => setLibrary(item)} key={item}>{item}</button>)}</div><label className="coach-search"><CoachGlyph name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={library === 'Food Library' ? 'Search foods' : 'Search exercises'} /></label></div><section className="coach-library-list">{filtered.map(([name, group, detail]) => <article key={name}><span className="library-icon"><CoachGlyph name={library === 'Food Library' ? 'food' : 'exercise'} /></span><div><strong>{name}</strong><small>{group} · {detail}</small></div><Status tone="good">ACTIVE</Status><button onClick={() => notice(`${name} edit form is preview-only.`)}>Edit</button><button onClick={() => notice(`${name} disable action needs backend.`)}>Disable</button></article>)}</section>{!filtered.length && <div className="coach-empty"><CoachGlyph name="search" /><strong>No matching {library.toLowerCase()}</strong></div>}</section>
}

function CoachSettings({ notice }) {
  const [active, setActive] = useState('System setup')
  return <section className="coach-page"><CoachHeading eyebrow="COACH / SYSTEM CONFIGURATION" title="Settings" copy="Measurement logic, targets, units and safe data operations." /><div className="coach-settings-layout"><nav>{['System setup', 'Data tools', 'Security'].map((item) => <button className={active === item ? 'selected' : ''} onClick={() => setActive(item)} key={item}>{item}</button>)}</nav><section className="panel">{active === 'System setup' && <><header><div><p className="kicker">TRACKING CONFIGURATION</p><span>Coach-wide defaults. Backend becomes source of truth.</span></div><Status tone="preview">LOCAL</Status></header><form className="coach-settings-form" onSubmit={(event) => { event.preventDefault(); notice('System settings saved in local preview.') }}><label>Weight unit<select defaultValue="Kilograms (kg)"><option>Kilograms (kg)</option><option>Pounds (lb)</option></select></label><label>Default check-in day<select defaultValue="Sunday"><option>Sunday</option><option>Wednesday</option><option>Friday</option></select></label><label>Missing weight threshold<input defaultValue="3 days" /></label><label>Measurement refresh threshold<input defaultValue="14 days" /></label><label className="wide-field">Enabled measurements<textarea rows="3" defaultValue="Weight, waist, hip, body fat percentage" /></label><label className="wide-field">Formula registry<textarea rows="3" defaultValue="BMI, fat mass, lean mass, rolling average, rate of change" /></label><footer><span>Formula calculations stay server-owned later.</span><button className="coach-primary">Save settings</button></footer></form></>}{active === 'Data tools' && <><header><div><p className="kicker">DATA TOOLS</p><span>CSV contract preview. No local file processing yet.</span></div></header><div className="coach-data-tools"><article><CoachGlyph name="upload" /><div><strong>Import clients</strong><span>Validate required fields, duplicate IDs and invalid values before commit.</span></div><button className="coach-primary" onClick={() => notice('CSV import validation needs backend endpoint.')}>Preview import</button></article><article><CoachGlyph name="export" /><div><strong>Export client data</strong><span>Generate controlled export by client and time range.</span></div><button className="coach-secondary" onClick={() => notice('Client export needs backend data access.')}>Prepare export</button></article></div></>}{active === 'Security' && <><header><div><p className="kicker">SECURITY BOUNDARY</p><span>Authentication and data isolation belong to backend.</span></div></header><div className="coach-security-list"><div><strong>Client ownership</strong><span>Server-enforced per coach/client relationship.</span></div><div><strong>Private notes</strong><span>Access-controlled and audited.</span></div><div><strong>Photos and health records</strong><span>Private object storage with consent and retention.</span></div></div></>}</section></div></section>
}

function CoachHealth() {
  return <section className="coach-page"><CoachHeading eyebrow="COACH / HEALTH RECORDS" title="Health" copy="Private records need secure storage, access control and review workflow." /><section className="coach-placeholder"><span><CoachGlyph name="lock" /></span><h3>Health record review comes with backend.</h3><p>Blood reports, uploads, extraction, comparison and access audit must not be mocked as real data. This frontend shell reserves protected space without claiming medical analysis.</p><div><Status tone="preview">FRONTEND SHELL</Status><Status>NO DIAGNOSIS</Status></div></section></section>
}

function CoachAudit() {
  return <section className="coach-page"><CoachHeading eyebrow="COACH / ACTIVITY RECORD" title="Audit Log" copy="Sensitive actions need backend-generated, immutable records." /><section className="coach-placeholder"><span><CoachGlyph name="file" /></span><h3>Audit trail waits for real events.</h3><p>Client updates, plan publication, note visibility and exports will appear here once API actions produce signed event records.</p><div><Status tone="preview">BACKEND REQUIRED</Status></div></section></section>
}

export default function CoachWorkspace({ account, accessToken, onSignOut }) {
  const [active, setActive] = useState('Overview')
  const [clients, setClients] = useState(initialClients)
  const [selectedClientId, setSelectedClientId] = useState(initialClients[0].id)
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const accountName = account?.full_name || 'Coach'
  const accountEmail = account?.email || ''
  const accountInitials = accountName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0]
  const pageCopy = { Overview: ['Command Center', 'Precision coaching, progress intelligence and client operations.'], Clients: ['Clients', 'Every client record, one controlled workspace.'], Review: ['Client Review', 'Unified history, plans and private coach context.'], 'Body Tracker': ['Body Tracker', 'Raw data, calculation engine and longitudinal progress.'], Nutrition: ['Nutrition', 'Build precise plans from controlled nutrition data.'], Workout: ['Workout', 'Build, publish and review training programs.'], Libraries: ['Libraries', 'Food and exercise source libraries.'], Settings: ['Settings', 'Coach-wide configuration and controlled data tools.'], Health: ['Health', 'Private records and review boundaries.'], 'Audit Log': ['Audit Log', 'Backend-generated platform activity.'] }
  const choose = (label) => { setActive(label); setNotice('') }
  const openReview = (id = selectedClientId) => { setSelectedClientId(id); choose('Review') }
  const addClient = (created) => {
    const name = created.full_name
    const client = {
      id: created.client_code,
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
    setNotice(`${client.name} was created and sent a secure account-setup invitation.`)
    return created
  }
  const page = active === 'Overview' ? <CoachOverview clients={clients} selectClient={openReview} navigate={choose} onCreate={() => setShowCreate(true)} />
    : active === 'Clients' ? <CoachClients clients={clients} onSelectClient={openReview} onCreateClient={createClient} notice={setNotice} />
      : active === 'Review' ? <CoachReview key={selectedClient.id} client={selectedClient} navigate={choose} />
        : active === 'Body Tracker' ? <CoachBodyTracker clientId={selectedClientId} clients={clients} setClientId={setSelectedClientId} openReview={() => openReview(selectedClientId)} />
          : active === 'Nutrition' ? <CoachNutrition clientId={selectedClientId} clients={clients} setClientId={setSelectedClientId} notice={setNotice} />
            : active === 'Workout' ? <CoachWorkout clientId={selectedClientId} clients={clients} setClientId={setSelectedClientId} notice={setNotice} />
              : active === 'Libraries' ? <CoachLibraries notice={setNotice} />
                : active === 'Settings' ? <CoachSettings notice={setNotice} />
                  : active === 'Health' ? <CoachHealth />
                    : <CoachAudit />
  return <div className="os-shell coach-shell">
    <aside className="os-sidebar">
      <div className="os-brand" aria-label="XForm Coaching OS"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
      <p className="workspace-label">COACH WORKSPACE</p>
      <nav className="os-navigation" aria-label="Coach navigation">{coachNavigation.map(([icon, label]) => <button className={active === label ? 'active' : ''} onClick={() => choose(label)} key={label}><CoachGlyph name={icon} /><span>{label}</span></button>)}</nav>
      <div className="account-block"><div className="account-detail"><span className="account-avatar">{accountInitials}</span><span><strong>{accountName}</strong><small>{accountEmail}</small></span></div><button onClick={onSignOut}>Sign out</button></div>
    </aside>
    <main className="os-main">
      <header className="os-topbar"><button className="mobile-menu" onClick={() => setNotice('Use bottom navigation on mobile.')} aria-label="Open navigation"><CoachGlyph name="menu" /></button><div><h1>{pageCopy[active][0]}</h1><p>{pageCopy[active][1]}</p></div><div className="coach-top-actions"><span className="online-state"><i />Authenticated coach</span></div></header>
      <div className="os-content">{notice && <div className="os-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><CoachGlyph name="close" /></button></div>}{page}</div>
    </main>
    <nav className="mobile-navigation coach-mobile-nav" aria-label="Mobile coach navigation">{coachNavigation.map(([icon, label]) => <button onClick={() => choose(label)} className={active === label ? 'active' : ''} key={label}><CoachGlyph name={icon} /><span>{label === 'Body Tracker' ? 'Body' : label}</span></button>)}</nav>
    {showCreate && <NewClientForm onCancel={() => setShowCreate(false)} onCreate={createClient} />}
  </div>
}
