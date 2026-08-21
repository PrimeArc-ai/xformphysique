import { useState } from 'react'
import BodyTracker from './BodyTracker'
import { CheckInsPage, HealthSummaryPage, NutritionPage, PhotosPage, ProfilePage, WorkoutPage } from './ClientPages'
import CoachWorkspace from './CoachWorkspace'
import useClientData from './hooks/useClientData'
import useAuth from './hooks/useAuth'
import AuthGate from './AuthGate'
import AccountActivation from './AccountActivation'

const navigation = [
  ['dashboard', 'Dashboard'],
  ['tracker', 'Body Tracker'],
  ['checkin', 'Check-ins'],
  ['photos', 'Progress Photos'],
  ['nutrition', 'Nutrition'],
  ['workout', 'Workout'],
  ['health', 'Health Summary'],
  ['profile', 'Profile'],
]

function Icon({ name, size = 18, stroke = 1.7 }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const paths = {
    dashboard: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    tracker: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    checkin: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M9 11h6M9 15h6" /></>,
    photos: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.4" /><path d="m21 16-5.4-5.4L6 20" /></>,
    nutrition: <><path d="M7 4v7M4.5 4v5A2 2 0 0 0 6.5 11h1A2 2 0 0 0 9.5 9V4M7 11v9" /><path d="M16 4v16M16 4c2 0 3.5 2.1 3.5 4.8H16" /></>,
    workout: <><path d="M7 7v10M4 9v6M17 7v10M20 9v6M7 12h10" /></>,
    health: <><path d="M20 12c-2.5 5.1-8 8-8 8s-5.5-2.9-8-8c2.5-5.1 8-8 8-8s5.5 2.9 8 8Z" /><path d="M8 12h2l1.5-2.5 2 5 1.5-2.5H17" /></>,
    profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  }
  return <svg {...props}>{paths[name]}</svg>
}

const Metric = ({ label, value, unit, caption, tone = '' }) => (
  <article className="signal-metric"><p>{label}</p><h3 className={tone}>{value}{unit && <small>{unit}</small>}</h3><span>{caption}</span></article>
)

function Dashboard({ dashboard, bodyEntries, openTracker, navigate }) {
  const trend = dashboard.body.trend ?? []
  const latestEntry = bodyEntries[0] ?? null
  const startWeight = trend[0]?.weight_kg ?? latestEntry?.weight ?? 0
  const currentWeight = dashboard.body.current_weight_kg ?? latestEntry?.weight ?? 0
  const change = dashboard.body.change_from_start_kg ?? 0
  const targetProgress = dashboard.body.target_progress_percent
  const volume = dashboard.training_volume
  const firstTrendDate = trend[0]?.date
  const latestTrendDate = trend.at(-1)?.date

  return <>
    <section className="main-signal" aria-labelledby="signal-heading">
      <div><p className="kicker">YOUR CURRENT SIGNAL</p><h2 id="signal-heading">{currentWeight ? currentWeight.toFixed(1) : '—'} <small>{currentWeight ? 'kg' : ''}</small></h2><p className="signal-copy"><strong>{change > 0 ? '+' : '−'}{Math.abs(change).toFixed(1)} kg</strong> since your first recorded weigh-in.</p></div>
      <div className="target-ring" aria-label={`${targetProgress ?? 0} percent of weight target complete`}><span><strong>{targetProgress ?? '—'}{targetProgress != null && '%'}</strong><small>TARGET</small></span></div>
    </section>

    <section className="metric-row" aria-label="Current progress statistics">
      <Metric label="CURRENT WEIGHT" value={currentWeight ? currentWeight.toFixed(1) : '—'} unit={currentWeight ? 'kg' : ''} caption="Latest recorded entry" />
      <Metric label="WAIST" value={dashboard.body.latest_waist_cm?.toFixed(0) ?? '—'} unit={dashboard.body.latest_waist_cm ? 'cm' : ''} caption="Latest measurement" />
      <Metric label="WEIGHT ENTRIES" value={bodyEntries.length} caption="Recorded history" />
      <Metric label="CHECK-INS" value={dashboard.check_ins.count} caption={dashboard.check_ins.status === 'submitted' ? 'Completed this cycle' : 'Awaiting check-in'} tone={dashboard.check_ins.count ? 'lime-text' : ''} />
    </section>

    <section className="signal-grid">
      <article className="panel chart-panel">
        <header><div><p className="kicker">BODY SIGNAL</p><span>Daily weight / trend</span></div><span className="range-label">LAST 7 ENTRIES</span></header>
        <div className="weight-chart" aria-label="Weight trend"><svg viewBox="0 0 680 270" preserveAspectRatio="none"><defs><linearGradient id="signalFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b7ff2c" stopOpacity=".13" /><stop offset="1" stopColor="#b7ff2c" stopOpacity="0" /></linearGradient></defs><path className="grid-line" d="M0 42H680M0 134H680M0 226H680" /><path d="M20 50 C70 70 86 62 126 78 S188 92 226 98 S288 118 326 122 S380 137 418 142 S486 161 525 174 S590 197 660 208 L660 245 L20 245Z" fill="url(#signalFill)" /><path className="signal-path" d="M20 50 C70 70 86 62 126 78 S188 92 226 98 S288 118 326 122 S380 137 418 142 S486 161 525 174 S590 197 660 208" /></svg><span className="chart-start">{startWeight.toFixed(1)} kg</span><span className="chart-end">{currentWeight.toFixed(1)} kg</span></div>
        <footer><span>{firstTrendDate ?? '—'}</span><span>tracked progress</span><span>{latestTrendDate ?? '—'}</span></footer>
      </article>

      <article className="panel action-panel">
        <header><div><p className="kicker">YOUR NEXT ACTION</p><span>Keep your signal current.</span></div></header>
        <div className="action-list"><button onClick={openTracker}><span>Log body progress</span><Icon name="arrow" size={16} /></button><button onClick={() => navigate('Nutrition')}><span>Open nutrition plan</span><Icon name="arrow" size={16} /></button><button onClick={() => navigate('Workout')}><span>Open workout</span><Icon name="arrow" size={16} /></button><button onClick={() => navigate('Health Summary')}><span>View health summary</span><Icon name="arrow" size={16} /></button></div>
      </article>
    </section>

    <section className="panel volume-panel">
      <header><div><h2>Training volume</h2><span>Last 30 days</span></div><span className="range-label">CONSISTENCY SIGNAL</span></header>
      <div className="bar-chart" aria-label="Training volume bar chart for last thirty days"><div className="chart-glow" />{[15, 24, 20, 32, 42, 55, 26, 38, 60, 48, 68, 74, 51, 88, 42, 72, 92, 65, 80, 100, 77, 63, 86, 71, 94, 64, 83, 70, 90, 74].map((height, index) => <i style={{ '--bar-height': `${height}%` }} className={index > 25 ? 'bar-active' : ''} key={index} />)}</div>
      <footer className="volume-summary"><span><strong>{volume.total_kg.toLocaleString()}</strong><small>TOTAL KG</small></span><span><strong>{volume.sessions}</strong><small>SESSIONS</small></span><span><strong>{volume.training_days}</strong><small>TRAINING DAYS</small></span><span><strong>{volume.best_day_kg.toLocaleString()}</strong><small>BEST DAY KG</small></span></footer>
    </section>
  </>
}

function ClientWorkspace({ auth }) {
  const [active, setActive] = useState('Dashboard')
  const [notice, setNotice] = useState('')
  const client = useClientData({ enabled: true, accessToken: auth.session.access_token })
  const pageCopy = {
    Dashboard: [`Hello, ${client.profile?.name?.split(' ')[0] ?? 'there'}`, 'Your XForm transformation dashboard.'],
    'Body Tracker': ['Body Tracker', 'Record progress. Keep your signal current.'],
    'Check-ins': ['Weekly Check-in', 'Share signal. Give coach context.'],
    'Progress Photos': ['Progress Photos', 'Private visual progress, in one place.'],
    Nutrition: ['Nutrition', 'Follow plan. Keep it simple.'],
    Workout: ['Workout', 'Assigned training, ready to log.'],
    'Health Summary': ['Health Summary', 'Coach-approved context, protected.'],
    Profile: ['Profile', 'Goals and preferences for your plan.'],
  }

  const chooseSection = (label) => {
    setActive(label)
    setNotice('')
  }

  const activePage = active === 'Body Tracker'
    ? <BodyTracker entries={client.bodyEntries} onAddEntry={client.saveBodyEntry} />
    : active === 'Check-ins'
      ? <CheckInsPage checkIns={client.checkIns} onSave={client.saveCheckIn} />
      : active === 'Progress Photos'
        ? <PhotosPage photos={client.photos} onUploadPhoto={client.uploadPhoto} />
        : active === 'Nutrition'
          ? <NutritionPage nutrition={client.nutrition} onSetAdherence={client.saveMealAdherence} onGetRecipe={client.getRecipeGuide} />
          : active === 'Workout'
            ? <WorkoutPage workout={client.workout} onSave={client.saveWorkout} />
            : active === 'Health Summary'
              ? <HealthSummaryPage health={client.health} />
              : active === 'Profile'
                ? <ProfilePage profile={client.profile} onSave={client.saveProfile} />
                : <Dashboard dashboard={client.dashboard} bodyEntries={client.bodyEntries} openTracker={() => chooseSection('Body Tracker')} navigate={chooseSection} />

  return <div className="os-shell">
      <aside className="os-sidebar">
        <div className="os-brand" aria-label="XForm Coaching OS"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
        <p className="workspace-label">CLIENT PORTAL</p>
        <nav className="os-navigation" aria-label="Client navigation">{navigation.map(([icon, label]) => <button className={active === label ? 'active' : ''} onClick={() => chooseSection(label)} key={label}><Icon name={icon} size={17} /><span>{label}</span></button>)}</nav>
        <div className="account-block"><div className="account-detail"><span className="account-avatar">{client.profile?.name?.[0] ?? 'M'}</span><span><strong>{client.profile?.name ?? auth.workspace.full_name}</strong><small>{client.profile?.email ?? auth.workspace.email}</small></span></div><button onClick={auth.signOut}>Sign out</button></div>
      </aside>

      <main className="os-main">
        <header className="os-topbar"><button className="mobile-menu" onClick={() => setNotice('Use bottom navigation on mobile.')} aria-label="Open navigation"><Icon name="menu" /></button><div><h1>{pageCopy[active][0]}</h1><p>{pageCopy[active][1]}</p></div><div className="coach-top-actions"><span className="online-state"><i />Authenticated</span></div></header>
        <div className="os-content">
          {notice && <div className="os-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><Icon name="close" size={15} /></button></div>}
          {client.loading
            ? <section className="client-load-state"><span className="loading-dot" /><strong>Loading client workspace…</strong><p>Connecting to XForm API.</p></section>
            : client.error
              ? <section className="client-load-state client-load-error"><strong>Client API unavailable</strong><p>{client.error}</p><button className="lime-button" onClick={client.reload}>Retry connection</button></section>
              : activePage}
        </div>
      </main>

      <nav className="mobile-navigation" aria-label="Mobile client navigation">{navigation.map(([icon, label]) => <button onClick={() => chooseSection(label)} className={active === label ? 'active' : ''} key={label}><Icon name={icon} size={18} /><span>{label === 'Health Summary' ? 'Health' : label}</span></button>)}</nav>
    </div>
}

function App() {
  const auth = useAuth()
  if (auth.loading) return <main className="auth-shell"><section className="auth-card"><span className="loading-dot" /><strong>Securing your workspace…</strong></section></main>
  if (!auth.session) return <AuthGate auth={auth} />
  if (!auth.workspace) return <main className="auth-shell"><section className="auth-card"><h1>Workspace unavailable.</h1><p>{auth.error || 'Your account is authenticated but does not have an XForm workspace.'}</p><button className="lime-button" onClick={auth.signOut}>Sign out</button></section></main>
  if (auth.activationRequired) return <AccountActivation auth={auth} />
  if (auth.workspace.role === 'coach') return <CoachWorkspace account={auth.workspace} accessToken={auth.session.access_token} onSignOut={auth.signOut} />
  return <ClientWorkspace auth={auth} />
}

export default App
