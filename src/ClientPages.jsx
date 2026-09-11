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

export { default as CheckInsPage } from './progress/WeeklyCheckIns'
export { default as PhotosPage } from './progress/PhotoJournal'
export { default as NutritionPage } from './progress/NutritionPage'
export { default as WorkoutPage } from './progress/WorkoutPage'

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

export function ProfilePage({ profile, profilePhoto, onSave, onUploadPhoto }) {
  const [form, setForm] = useState({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [photoNotice, setPhotoNotice] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

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

  const selectPhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    setPhotoNotice('')
    try {
      await onUploadPhoto(file)
      setPhotoNotice('Profile photo saved privately.')
    } catch (requestError) {
      setPhotoNotice(requestError.message || 'Could not save profile photo.')
    } finally {
      setUploadingPhoto(false)
      event.target.value = ''
    }
  }

  return <section className="client-page" aria-labelledby="profile-title">
    <PageHeading eyebrow="CLIENT / PROFILE" title="Your plan starts with context." copy="Keep goals and preferences current for your coach." badge="LIVE API" />
    <section className="panel profile-photo-card">
      <div className="profile-photo-preview">{profilePhoto?.url ? <img src={profilePhoto.url} alt="Your profile" /> : <span>{profile?.name?.[0] ?? 'C'}</span>}</div>
      <div><p className="kicker">PRIVATE PROFILE PHOTO</p><strong>{profilePhoto ? 'Current photo protected' : 'Add a profile photo'}</strong><span>One compact image, visible only to your authenticated account.</span></div>
      <label className="profile-photo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingPhoto} onChange={selectPhoto} /><span>{uploadingPhoto ? 'Uploading…' : 'Upload photo'}</span></label>
      <small aria-live="polite">{photoNotice || 'JPEG, PNG or WebP · 2 MB max · securely optimized.'}</small>
    </section>
    <form className="panel profile-form" onSubmit={submit}><header><div><p className="kicker">PROFILE & PREFERENCES</p><span>These fields update your client planning context.</span></div></header><div className="profile-fields"><label>Primary goal<select value={form.primary_goal ?? ''} onChange={(event) => update('primary_goal', event.target.value)}><option value="body_recomposition">Body recomposition</option><option value="fat_loss">Fat loss</option><option value="strength">Strength</option><option value="performance">Performance</option></select></label><label>Target weight<div className="input-with-unit"><input type="number" value={form.target_weight_kg ?? ''} min="0.1" step="0.1" onChange={(event) => update('target_weight_kg', event.target.value)} /><span>kg</span></div></label><label>Weekly check-in day<select value={form.check_in_day ?? ''} onChange={(event) => update('check_in_day', event.target.value)}>{['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => <option value={day} key={day}>{day[0].toUpperCase()}{day.slice(1)}</option>)}</select></label><label>Timezone<input value={form.timezone ?? ''} onChange={(event) => update('timezone', event.target.value)} /></label><label className="wide-field">Dietary preferences<textarea rows="3" value={form.dietary_preferences ?? ''} onChange={(event) => update('dietary_preferences', event.target.value)} /></label><label className="wide-field">Allergies and injuries<textarea rows="3" value={form.allergies_injuries ?? ''} onChange={(event) => update('allergies_injuries', event.target.value)} /></label></div><footer className="form-footer"><p aria-live="polite">{error || (saved ? 'Profile saved to your planning record.' : 'Keep this context current for your coach.')}</p><button className="lime-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'} <Arrow /></button></footer></form>
    <section className="profile-security"><article><p>ACCOUNT</p><strong>{profile?.email ?? '—'}</strong><span>Authentication joins this workspace in a later phase.</span></article><article><p>DATA CONTROL</p><strong>Private workspace</strong><span>Consent, retention and deletion controls follow with account APIs.</span></article></section>
  </section>
}
