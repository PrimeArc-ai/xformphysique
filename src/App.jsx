import { useState } from 'react'
import BodyTracker from './BodyTracker'
import ClientDashboard from './ClientDashboard'
import { CheckInsPage, HealthSummaryPage, NutritionPage, PhotosPage, ProfilePage, WorkoutPage } from './ClientPages'
import CoachWorkspace from './CoachWorkspace'
import AdminWorkspace from './AdminWorkspace'
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
                ? <ProfilePage profile={client.profile} profilePhoto={client.profilePhoto} onSave={client.saveProfile} onUploadPhoto={client.uploadProfilePhoto} />
                : <ClientDashboard dashboard={client.dashboard} bodyEntries={client.bodyEntries} workout={client.workout} navigate={chooseSection} />

  return <div className="os-shell">
      <aside className="os-sidebar">
        <div className="os-brand" aria-label="XForm Coaching OS"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
        <p className="workspace-label">CLIENT PORTAL</p>
        <nav className="os-navigation" aria-label="Client navigation">{navigation.map(([icon, label]) => <button className={active === label ? 'active' : ''} onClick={() => chooseSection(label)} key={label}><Icon name={icon} size={17} /><span>{label}</span></button>)}</nav>
        <div className="account-block"><div className="account-detail"><span className="account-avatar">{client.profilePhoto?.url ? <img src={client.profilePhoto.url} alt="" /> : (client.profile?.name?.[0] ?? 'M')}</span><span><strong>{client.profile?.name ?? auth.workspace.full_name}</strong><small>{client.profile?.email ?? auth.workspace.email}</small></span></div><button onClick={auth.signOut}>Sign out</button></div>
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
  if (auth.workspace.role === 'admin') return <AdminWorkspace account={auth.workspace} accessToken={auth.session.access_token} onSignOut={auth.signOut} />
  if (auth.workspace.role === 'coach') return <CoachWorkspace account={auth.workspace} accessToken={auth.session.access_token} onSignOut={auth.signOut} />
  if (auth.workspace.role === 'client') return <ClientWorkspace auth={auth} />
  return <main className="auth-shell"><section className="auth-card"><h1>Workspace unavailable.</h1><button onClick={auth.signOut}>Sign out</button></section></main>
}

export default App
