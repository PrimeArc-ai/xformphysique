import { useEffect, useState } from 'react'

const today = new Date().toISOString().slice(0, 10)
const formatDate = (value) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const viewLabel = (view) => `${view[0].toUpperCase()}${view.slice(1)}`

function Arrow() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
}

function PageHeading({ eyebrow, title, copy, badge }) {
  return <header className="feature-heading"><div><p className="kicker">{eyebrow}</p><h2>{title}</h2><p>{copy}</p></div>{badge && <span className="local-state"><i />{badge}</span>}</header>
}

const sentiments = [['Great', 'excellent'], ['Good', 'good'], ['Stalled', 'okay'], ['Difficult', 'low']]

export function CheckInsPage({ checkIns, onSave }) {
  const [sentiment, setSentiment] = useState('good')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const lastCheckIn = checkIns[0]

  const submit = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await onSave({
        energy_score: Number(formData.get('energy')),
        sleep_score: Number(formData.get('sleep')),
        sentiment,
        observation: formData.get('observation') || 'No additional observation provided.',
        concern: formData.get('concern') || null,
      })
      setSaved(true)
    } catch (requestError) {
      setError(requestError.message || 'Could not save check-in.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="client-page" aria-labelledby="checkin-title">
    <PageHeading eyebrow="CLIENT / WEEKLY CHECK-IN" title="Check in with yourself." copy="A clear signal helps your coach make better decisions." badge="LIVE API" />
    <section className="checkin-status-row">
      <article><p>CHECK-IN STATUS</p><strong>{lastCheckIn ? 'Submitted' : 'Due soon'}</strong><span>{lastCheckIn ? `Last saved ${formatDate(lastCheckIn.date)}` : 'Complete before Sunday'}</span></article>
      <article><p>PRIVATE BY DESIGN</p><strong>Coach only</strong><span>Responses never appear to other clients.</span></article>
      <article><p>WHAT TO SHARE</p><strong>Honest signal</strong><span>Energy, adherence, concerns, context.</span></article>
    </section>
    <form className="panel checkin-form" onSubmit={submit}>
      <header><div><p className="kicker">WEEKLY SIGNAL</p><span>Take two minutes. No perfect answer required.</span></div></header>
      <div className="checkin-fields">
        <fieldset><legend>Energy this week</legend><div className="score-scale">{[1, 2, 3, 4, 5].map((value) => <label key={value}><input type="radio" name="energy" value={value} defaultChecked={value === 4} /><span>{value}</span></label>)}</div><div className="scale-copy"><span>Low</span><span>Excellent</span></div></fieldset>
        <fieldset><legend>Sleep quality</legend><div className="score-scale">{[1, 2, 3, 4, 5].map((value) => <label key={value}><input type="radio" name="sleep" value={value} defaultChecked={value === 3} /><span>{value}</span></label>)}</div><div className="scale-copy"><span>Poor</span><span>Restful</span></div></fieldset>
        <fieldset className="sentiment-field"><legend>How has progress felt?</legend><div className="sentiment-options">{sentiments.map(([label, value]) => <button className={sentiment === value ? 'selected' : ''} type="button" onClick={() => setSentiment(value)} key={value}>{label}</button>)}</div></fieldset>
        <label className="long-answer">What went well?<textarea name="observation" rows="4" placeholder="Training, nutrition, routine, confidence…" /></label>
        <label className="long-answer">Anything your coach should know?<textarea name="concern" rows="4" placeholder="A concern, barrier, or question…" /></label>
      </div>
      <footer className="form-footer"><p aria-live="polite">{error || (saved ? 'Check-in saved to your private coaching record.' : 'Your coach sees this in the next review.')}</p><button className="lime-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Submit check-in'} <Arrow /></button></footer>
    </form>
  </section>
}

export function PhotosPage({ photos, onUploadPhoto }) {
  const [selectedView, setSelectedView] = useState('front')
  const [selectedPhotoId, setSelectedPhotoId] = useState(null)
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const viewPhotos = photos.filter((photo) => photo.view === selectedView)
  const currentPhoto = viewPhotos.find((photo) => photo.id === selectedPhotoId) ?? viewPhotos[0]
  const comparisonPhoto = viewPhotos.find((photo) => photo.id !== currentPhoto?.id)

  const selectPhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setNotice('')
    try {
      const photo = await onUploadPhoto(file, selectedView)
      setSelectedPhotoId(photo.id)
      setNotice(`${viewLabel(selectedView)} photo saved to private storage.`)
    } catch (requestError) {
      setNotice(requestError.message || 'Could not upload photo.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return <section className="client-page" aria-labelledby="photos-title">
    <PageHeading eyebrow="CLIENT / PROGRESS PHOTOS" title="Private progress, in view." copy="Front, side, and back photos stay inside your coaching workspace." badge="PRIVATE STORAGE" />
    <section className="photo-layout">
      <article className="panel photo-stage">
        <header><div><p className="kicker">{viewLabel(selectedView).toUpperCase()} VIEW</p><span>{currentPhoto ? `Captured ${formatDate(currentPhoto.date)}` : 'No image selected'}</span></div><span className="range-label">PRIVATE</span></header>
        <div className="photo-canvas">{currentPhoto ? <img src={currentPhoto.url} alt={`${viewLabel(selectedView)} progress upload`} /> : <div className="photo-empty"><strong>Nothing captured yet.</strong><span>Choose a view to upload a private progress photo.</span></div>}</div>
      </article>
      <article className="panel photo-control-panel">
        <header><div><p className="kicker">UPLOAD VIEW</p><span>One clear image at a time.</span></div></header>
        <div className="photo-view-switch">{['front', 'side', 'back'].map((view) => <button type="button" className={selectedView === view ? 'selected' : ''} onClick={() => { setSelectedView(view); setSelectedPhotoId(null) }} key={view}><span>{viewLabel(view)}</span><i className={photos.some((photo) => photo.view === view) ? 'complete' : ''} /></button>)}</div>
        <label className="photo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={selectPhoto} /><span>{uploading ? 'Uploading…' : `Choose ${selectedView} photo`}</span><Arrow /></label>
        <p className="photo-hint" aria-live="polite">{notice || 'JPEG, PNG or WebP. Stored privately with client-owned access.'}</p>
      </article>
    </section>
    <article className="panel photo-gallery-panel"><header><div><p className="kicker">DATED GALLERY</p><span>Select a saved image to review it.</span></div><span className="range-label">{photos.length} SAVED</span></header>{photos.length ? <div className="photo-gallery">{photos.map((photo) => <button type="button" onClick={() => { setSelectedView(photo.view); setSelectedPhotoId(photo.id) }} key={photo.id}><img src={photo.url} alt={`${photo.view} progress upload`} /><span><strong>{viewLabel(photo.view)}</strong><small>{formatDate(photo.date)}</small></span></button>)}</div> : <div className="gallery-empty">No private photos saved yet.</div>}</article>
    <article className="panel photo-compare-panel"><header><div><p className="kicker">COMPARISON</p><span>Compare same view over time.</span></div><span className="range-label">{comparisonPhoto ? 'READY' : 'ADD TWO PHOTOS'}</span></header>{currentPhoto && comparisonPhoto ? <div className="compare-photos"><figure><img src={comparisonPhoto.url} alt={`Earlier ${selectedView} progress upload`} /><figcaption>Earlier</figcaption></figure><figure><img src={currentPhoto.url} alt={`Latest ${selectedView} progress upload`} /><figcaption>Latest</figcaption></figure></div> : <div className="compare-empty"><span>Before</span><div>+</div><span>After</span><p>Add two photos of same view to compare.</p></div>}</article>
  </section>
}

export function NutritionPage({ nutrition, onSetAdherence, onGetRecipe }) {
  const [selectedMeal, setSelectedMeal] = useState('')
  const [recipe, setRecipe] = useState(null)
  const [savingMeal, setSavingMeal] = useState('')
  const [notice, setNotice] = useState('')
  const meals = nutrition?.meals ?? []

  useEffect(() => {
    if (!selectedMeal && meals[0]) setSelectedMeal(meals[0].id)
  }, [meals, selectedMeal])

  const loggedMeals = meals.filter((meal) => meal.adherence_status !== 'pending').length
  const setAdherence = async (mealId, status) => {
    setSavingMeal(mealId)
    setNotice('')
    try {
      await onSetAdherence(mealId, status)
      setNotice('Meal status saved.')
    } catch (requestError) {
      setNotice(requestError.message || 'Could not save meal status.')
    } finally {
      setSavingMeal('')
    }
  }
  const generateRecipe = async (event) => {
    event.preventDefault()
    if (!selectedMeal) return
    setNotice('')
    try {
      setRecipe(await onGetRecipe(selectedMeal))
    } catch (requestError) {
      setNotice(requestError.message || 'Could not create preparation guide.')
    }
  }

  const targets = nutrition?.daily_targets ?? {}
  return <section className="client-page" aria-labelledby="nutrition-title">
    <PageHeading eyebrow="CLIENT / NUTRITION" title="Follow plan. Keep it simple." copy="Assigned quantities and targets stay coach-led." badge="PLAN ACTIVE" />
    <section className="nutrition-summary"><article><p>DAILY TARGET</p><strong>{targets.calories_kcal?.toLocaleString() ?? '—'} <small>kcal</small></strong><span>Coach-assigned target</span></article><article><p>PLAN STATUS</p><strong>{loggedMeals}/{meals.length}</strong><span>Meals logged today</span></article><article><p>RESTRICTIONS</p><strong>{nutrition?.restrictions.length ?? 0} active</strong><span>{nutrition?.restrictions.join(' · ') || 'None recorded'}</span></article></section>
    <section className="nutrition-grid">
      <article className="panel meal-plan-panel"><header><div><p className="kicker">TODAY’S MEALS</p><span>Log adherence. Quantities stay locked.</span></div><span className="range-label">{nutrition?.date ?? today}</span></header><div className="meal-rows">{meals.map((meal) => <div className="meal-row" key={meal.id}><span className="meal-time">{meal.time}</span><div><strong>{meal.name}</strong><small>{meal.ingredients.map((item) => item.name).join(' · ')}</small></div><span className="meal-kcal">{meal.calories_kcal} kcal</span><div className="adherence-control">{[['Followed', 'followed'], ['Partly', 'partly'], ['Missed', 'missed']].map(([label, status]) => <button type="button" disabled={savingMeal === meal.id} className={meal.adherence_status === status ? status : ''} onClick={() => setAdherence(meal.id, status)} key={status}>{label}</button>)}</div></div>)}</div></article>
      <article className="panel macro-panel"><header><div><p className="kicker">PLAN MACROS</p><span>Reference only. Coach controls targets.</span></div></header><div className="macro-list"><div><span>Protein</span><strong>{targets.protein_g ?? '—'}g</strong><i><b style={{ width: '78%' }} /></i></div><div><span>Carbohydrate</span><strong>{targets.carbs_g ?? '—'}g</strong><i><b style={{ width: '67%' }} /></i></div><div><span>Fat</span><strong>{targets.fat_g ?? '—'}g</strong><i><b style={{ width: '58%' }} /></i></div></div><p>Need a plan change? Add a note to your weekly check-in.</p></article>
    </section>
    <section className="panel recipe-panel"><header><div><p className="kicker">RECIPE HELPER</p><span>Uses assigned ingredients only. Does not change your plan.</span></div><span className="range-label">SERVER-GUIDED</span></header><form onSubmit={generateRecipe}><label>Meal <select value={selectedMeal} onChange={(event) => setSelectedMeal(event.target.value)}>{meals.map((meal) => <option value={meal.id} key={meal.id}>{meal.name}</option>)}</select></label><button className="lime-button" type="submit">Generate preparation guide <Arrow /></button></form>{(recipe || notice) && <div className="recipe-result"><p>SERVER RESPONSE</p>{recipe && <><strong>{recipe.meal_name}</strong><span>{recipe.guide}</span></>}<span>{notice}</span></div>}</section>
  </section>
}

export function WorkoutPage({ workout, onSave }) {
  const [completed, setCompleted] = useState(workout?.status === 'completed')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [load, setLoad] = useState('')
  const [reps, setReps] = useState('10')
  const [difficulty, setDifficulty] = useState('moderate')
  const [note, setNote] = useState('')
  const exercises = workout?.exercises ?? []
  const firstExercise = exercises[0]

  const submit = async (event) => {
    event.preventDefault()
    if (!workout || !firstExercise) return
    setSaving(true)
    setError('')
    try {
      await onSave(workout.session_id, {
        status: 'completed',
        overall_difficulty: difficulty,
        note: note || null,
        exercise_logs: [{ plan_exercise_id: firstExercise.plan_exercise_id, sets: [{ set_number: 1, reps: Number(reps) || 0, load_kg: Number(load) || 0, difficulty }] }],
      })
      setCompleted(true)
      setSaved(true)
    } catch (requestError) {
      setError(requestError.message || 'Could not save workout.')
    } finally {
      setSaving(false)
    }
  }

  if (!workout) return null
  return <section className="client-page" aria-labelledby="workout-title">
    <PageHeading eyebrow="CLIENT / WORKOUT" title={`Today: ${workout.title.toLowerCase()}.`} copy="Move with control. Actual load and difficulty stay part of your log." badge={workout.week_label.toUpperCase()} />
    <section className="workout-summary"><article><p>SESSION</p><strong>{workout.estimated_duration_minutes} <small>min</small></strong><span>{workout.title}</span></article><article><p>MOVEMENTS</p><strong>{exercises.length}</strong><span>Planned exercises</span></article><article><p>STATUS</p><strong className={completed ? 'lime-text' : ''}>{completed ? 'Done' : workout.status}</strong><span>{completed ? 'Saved to coach record' : 'Ready to start'}</span></article></section>
    <section className="workout-grid"><article className="panel workout-plan"><header><div><p className="kicker">ASSIGNED SESSION</p><span>Coach notes: {workout.coach_note}</span></div><span className="range-label">{workout.week_label.toUpperCase()}</span></header><div className="exercise-rows">{exercises.map((exercise, index) => <div className="exercise-row" key={exercise.plan_exercise_id}><span>0{index + 1}</span><div><strong>{exercise.name}</strong><small>{exercise.prescription.sets} × {exercise.prescription.reps} · {exercise.prescription.rest_seconds} sec rest</small></div><button type="button" onClick={() => setCompleted(false)}>Log sets <Arrow /></button></div>)}</div></article>
      <form className="panel workout-log" onSubmit={submit}><header><div><p className="kicker">SESSION LOG</p><span>Log first working set; coach sees actual work and note.</span></div></header><div className="workout-log-fields"><label>Actual load<input type="number" min="0" step="0.5" value={load} onChange={(event) => setLoad(event.target.value)} placeholder="e.g. 20" /></label><label>Reps<input type="number" min="0" value={reps} onChange={(event) => setReps(event.target.value)} /></label><label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Challenging</option></select></label><label>Session note<textarea rows="4" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth noting…" /></label></div><footer className="form-footer"><p aria-live="polite">{error || (saved ? 'Session saved to your coaching record.' : 'Your form stays editable until saved.')}</p><button className="lime-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Complete session'} <Arrow /></button></footer></form></section>
  </section>
}

export function HealthSummaryPage({ health }) {
  const wellbeing = health?.wellbeing ?? {}
  const context = health?.planning_context ?? {}
  const display = (value) => Array.isArray(value) ? value.join(' · ') : value
  return <section className="client-page" aria-labelledby="health-title">
    <PageHeading eyebrow="CLIENT / HEALTH SUMMARY" title="Your health context, protected." copy="Coach-approved information. No diagnosis or medical advice." badge="PRIVATE RECORD" />
    <section className="health-cards"><article><p>WELLBEING SIGNAL</p><strong>{wellbeing.energy_score ? `${wellbeing.energy_score}/5` : '—'}</strong><span>{wellbeing.source_check_in_id ? 'Energy from latest check-in' : 'Add weekly check-in to update'}</span></article><article><p>PROGRESS SENTIMENT</p><strong>{wellbeing.sentiment ?? '—'}</strong><span>Client-reported signal</span></article><article><p>HEALTH DATA</p><strong>Private</strong><span>Visible to you and your coach only</span></article></section>
    <section className="health-grid"><article className="panel health-panel"><header><div><p className="kicker">COACH-APPROVED SUMMARY</p><span>Current preferences and records used for planning.</span></div></header><dl><div><dt>Dietary preferences</dt><dd>{display(context.dietary_preferences) || 'Not recorded'}</dd></div><div><dt>Allergies</dt><dd>{display(context.allergies) || 'Not recorded'}</dd></div><div><dt>Training consideration</dt><dd>{display(context.training_considerations) || 'Not recorded'}</dd></div><div><dt>Coach note</dt><dd>{context.coach_note || 'No current note'}</dd></div></dl></article><article className="panel health-panel"><header><div><p className="kicker">SAFETY BOUNDARY</p><span>This workspace supports coaching, not medical care.</span></div></header><div className="health-notice"><strong>Need clinical advice?</strong><p>{health?.safety_notice || 'Contact a qualified health professional.'}</p></div></article></section>
  </section>
}

export function ProfilePage({ profile, onSave }) {
  const [form, setForm] = useState({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile) setForm(profile)
  }, [profile])

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        primary_goal: form.primary_goal,
        target_weight_kg: Number(form.target_weight_kg),
        check_in_day: form.check_in_day,
        timezone: form.timezone,
        dietary_preferences: form.dietary_preferences,
        allergies_injuries: form.allergies_injuries,
      })
      setSaved(true)
    } catch (requestError) {
      setError(requestError.message || 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="client-page" aria-labelledby="profile-title">
    <PageHeading eyebrow="CLIENT / PROFILE" title="Your plan starts with context." copy="Keep goals and preferences current for your coach." badge="LIVE API" />
    <form className="panel profile-form" onSubmit={submit}><header><div><p className="kicker">PROFILE & PREFERENCES</p><span>These fields update your client planning context.</span></div></header><div className="profile-fields"><label>Primary goal<select value={form.primary_goal ?? ''} onChange={(event) => update('primary_goal', event.target.value)}><option value="body_recomposition">Body recomposition</option><option value="fat_loss">Fat loss</option><option value="strength">Strength</option><option value="performance">Performance</option></select></label><label>Target weight<div className="input-with-unit"><input type="number" value={form.target_weight_kg ?? ''} min="0.1" step="0.1" onChange={(event) => update('target_weight_kg', event.target.value)} /><span>kg</span></div></label><label>Weekly check-in day<select value={form.check_in_day ?? ''} onChange={(event) => update('check_in_day', event.target.value)}>{['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => <option value={day} key={day}>{day[0].toUpperCase()}{day.slice(1)}</option>)}</select></label><label>Timezone<input value={form.timezone ?? ''} onChange={(event) => update('timezone', event.target.value)} /></label><label className="wide-field">Dietary preferences<textarea rows="3" value={form.dietary_preferences ?? ''} onChange={(event) => update('dietary_preferences', event.target.value)} /></label><label className="wide-field">Allergies and injuries<textarea rows="3" value={form.allergies_injuries ?? ''} onChange={(event) => update('allergies_injuries', event.target.value)} /></label></div><footer className="form-footer"><p aria-live="polite">{error || (saved ? 'Profile saved to your planning record.' : 'Keep this context current for your coach.')}</p><button className="lime-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'} <Arrow /></button></footer></form>
    <section className="profile-security"><article><p>ACCOUNT</p><strong>{profile?.email ?? '—'}</strong><span>Authentication joins this workspace in a later phase.</span></article><article><p>DATA CONTROL</p><strong>Private workspace</strong><span>Consent, retention and deletion controls follow with account APIs.</span></article></section>
  </section>
}
