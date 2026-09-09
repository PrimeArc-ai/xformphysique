import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi } from './api/admin'

const displayDate = value => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function Modal({ title, onClose, children, busy = false }) {
  const ref = useRef(null)
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} className="admin-modal" aria-labelledby="admin-modal-title" onCancel={event => {
    event.preventDefault(); if (!busy) onClose()
  }}>
    <header><h2 id="admin-modal-title">{title}</h2><button type="button" className="admin-close" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button></header>
    {children}
  </dialog>
}

function OnboardCoach({ token, onClose, onCreated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)
  const [copied, setCopied] = useState(false)
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const result = await adminApi.createCoach(data, token)
      setCreated(result); onCreated()
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  return <Modal title={created ? 'Coach account ready' : 'Welcome a new coach'} onClose={onClose} busy={busy}>
    {created ? <div className="admin-credentials">
      <p><strong>{created.full_name}</strong> can now use the Coach portal.</p>
      <p className="admin-muted">Share these credentials privately. The initial password is shown here only until you close this dialog. No email has been sent.</p>
      <label>Login email<input value={created.email} readOnly /></label>
      <label>Initial password<input value={created.initial_password} readOnly autoComplete="off" /></label>
      {!created.audit_recorded && <p role="alert" className="auth-error">Account created, but the audit entry could not be recorded. Contact the system operator; do not create it again.</p>}
      {error && <p role="alert" className="auth-error">{error}</p>}
      <div className="admin-dialog-actions"><button className="ghost-button" onClick={async () => {
        try { await navigator.clipboard.writeText(`Coach portal\nEmail: ${created.email}\nPassword: ${created.initial_password}`); setCopied(true) }
        catch { setError('Clipboard is unavailable. Select and copy the values above.') }
      }}>{copied ? 'Copied' : 'Copy credentials'}</button><button className="lime-button" onClick={onClose}>Done</button></div>
    </div> : <form className="admin-form" onSubmit={submit}>
      <p className="admin-muted">Create a coach workspace with its own client roster. Existing accounts cannot be overwritten.</p>
      <label>Full name<input name="full_name" required minLength={2} maxLength={160} autoComplete="name" autoFocus /></label>
      <label>Email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Professional title<input name="professional_title" required minLength={2} maxLength={120} defaultValue="Fitness Coach" /></label>
      <p className="admin-muted">A secure initial password will be generated for private sharing. Email invitations are not enabled for this flow.</p>
      {error && <p role="alert" className="auth-error">{error}</p>}
      <div className="admin-dialog-actions"><button type="button" className="ghost-button" disabled={busy} onClick={onClose}>Cancel</button><button className="lime-button" disabled={busy}>{busy ? 'Creating account…' : 'Create coach'}</button></div>
    </form>}
  </Modal>
}

function CoachDetail({ coach, token, onClose, onOffboard, onResetPassword }) {
  const [clients, setClients] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setClients(null); setError('')
    adminApi.clients(coach.id, token).then(result => { if (active) setClients(result.items) })
      .catch(reason => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [coach.id, token, retry])
  return <section className="admin-detail" aria-label="Coach details">
    <header><div><span className="kicker">COACH WORKSPACE</span><h2>{coach.full_name}</h2><p>{coach.professional_title || 'Coach'} · {coach.email}</p></div><button className="admin-close" onClick={onClose} aria-label="Close coach details">×</button></header>
    <div className="admin-privacy"><span aria-hidden="true">◈</span><p><strong>Client privacy, by design.</strong><br />Only client codes and assignment dates are shared here. Personal details, health records, notes and photos remain private to the client and their assigned coach.</p></div>
    <h3>Client assignments</h3>
    {error ? <div role="alert"><p className="auth-error">{error}</p><button className="ghost-button" onClick={() => setRetry(value => value + 1)}>Retry clients</button></div>
      : !clients ? <p role="status">Loading assignments…</p>
        : !clients.length ? <p className="admin-empty">No client assignments yet.</p>
          : <div className="admin-table-scroll"><table><thead><tr><th>Client code</th><th>Assigned</th><th>Status</th><th>Ended</th></tr></thead>
            <tbody>{clients.map((client, index) => <tr key={`${client.client_code}-${client.assigned_at}-${index}`}><td>{client.client_code}</td><td>{displayDate(client.assigned_at)}</td><td><span className={`admin-status ${client.ended_at ? 'inactive' : ''}`}>{client.ended_at ? 'Ended' : 'Assigned'}</span></td><td>{displayDate(client.ended_at)}</td></tr>)}</tbody></table></div>}
    {coach.is_active ? <footer><p>Reset keeps the same login email and issues a new password. Offboarding suspends coach access and ends current assignments. Client accounts and records are kept.</p><div className="admin-detail-actions"><button className="ghost-button" onClick={() => onResetPassword(coach)}>Reset password</button><button className="admin-danger" onClick={() => onOffboard(coach)}>Offboard coach</button></div></footer>
      : <footer><p>This coach is offboarded. Client records have been preserved. You can still issue a new password; Coach portal access stays blocked until an operator reactivates them.</p><div className="admin-detail-actions"><button className="ghost-button" onClick={() => onResetPassword(coach)}>Reset password</button></div></footer>}
  </section>
}

export default function AdminWorkspace({ account, accessToken, onSignOut }) {
  const [coaches, setCoaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [onboarding, setOnboarding] = useState(false)
  const [offboarding, setOffboarding] = useState(null)
  const [resetting, setResetting] = useState(null)
  const [resetResult, setResetResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const reload = useCallback(async () => {
    const current = ++generation.current
    setLoading(true); setError('')
    try { const result = await adminApi.coaches(accessToken); if (current === generation.current) setCoaches(result.items) }
    catch (reason) { if (current === generation.current) setError(reason.message) }
    finally { if (current === generation.current) setLoading(false) }
  }, [accessToken])
  useEffect(() => { reload(); return () => { ++generation.current } }, [reload])
  const selected = coaches.find(coach => coach.id === selectedId)
  const activeCount = coaches.filter(coach => coach.is_active).length
  const visible = coaches.filter(coach => `${coach.full_name} ${coach.email}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || coach.is_active === (filter === 'active')))
  const offboard = async () => {
    setBusy(true); setActionError('')
    try {
      const result = await adminApi.offboardCoach(offboarding.id, accessToken)
      setNotice(`${offboarding.full_name} is offboarded. ${result.released_client_count} client assignment(s) ended; records preserved.`)
      setOffboarding(null); setSelectedId(null); await reload()
    } catch (reason) { setActionError(reason.message) }
    finally { setBusy(false) }
  }
  const resetPassword = async () => {
    setBusy(true); setActionError(''); setCopied(false)
    try {
      const result = await adminApi.resetPassword(resetting.id, accessToken)
      setResetResult(result)
    } catch (reason) { setActionError(reason.message) }
    finally { setBusy(false) }
  }
  const closeReset = () => { setResetting(null); setResetResult(null); setCopied(false); setActionError('') }
  return <div className="os-shell admin-shell">
    <aside className="os-sidebar">
      <div className="os-brand"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
      <p className="workspace-label">ADMIN PORTAL</p>
      <nav className="os-navigation" aria-label="Admin navigation"><button className="active" onClick={() => { setSelectedId(null); setFilter('all'); setQuery('') }}><span aria-hidden="true">▦</span><span>Coaches</span></button></nav>
      <div className="admin-side-note"><strong>People, with boundaries.</strong><p>Manage the coaching team while keeping client information private.</p></div>
      <div className="account-block"><div className="account-detail"><span className="account-avatar">{account.first_name?.[0] || 'A'}</span><span><strong>{account.full_name}</strong><small>Administrator</small></span></div><button onClick={onSignOut}>Sign out</button></div>
    </aside>
    <main className="os-main">
      <header className="os-topbar"><div><p className="kicker">TEAM & ACCESS</p><h1>Coach management</h1><p>A clear view of your team. Client privacy stays intact.</p></div><button className="lime-button" onClick={() => setOnboarding(true)}>+ Onboard coach</button></header>
      <div className="os-content admin-content">
        <div className="admin-mobile-account"><span>Admin · {account.first_name}</span><button className="ghost-button" onClick={onSignOut}>Sign out</button></div>
        {notice && <div className="os-notice" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
        <div className="admin-stats">{[['Total coaches', coaches.length], ['Active coaches', activeCount], ['Offboarded', coaches.length - activeCount], ['Active client assignments', coaches.reduce((count, coach) => count + coach.active_client_count, 0)]].map(([label, value]) => <section key={label}><p>{label}</p><strong>{loading || error ? '—' : value}</strong></section>)}</div>
        <section className="admin-roster" aria-label="Coach roster">
          <header><div><h2>Your coaching team</h2><p>Onboard coaches, review assignments and manage access.</p></div><button className="ghost-button" onClick={reload} disabled={loading}>Refresh</button></header>
          <div className="admin-toolbar"><label><span className="admin-sr-only">Search coaches</span><input type="search" placeholder="Search coaches by name or email" value={query} onChange={event => setQuery(event.target.value)} /></label><label><span className="admin-sr-only">Coach status</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All coaches</option><option value="active">Active</option><option value="inactive">Offboarded</option></select></label></div>
          {error ? <div className="admin-empty" role="alert"><p className="auth-error">{error}</p><button className="ghost-button" onClick={reload}>Retry connection</button></div>
            : loading ? <p className="admin-empty" role="status">Loading your team…</p>
              : !visible.length ? <p className="admin-empty">{coaches.length ? 'No coaches match your search.' : 'Your team starts here. Onboard your first coach.'}</p>
                : <div className="admin-table-scroll"><table><thead><tr><th>Coach</th><th>Status</th><th>Clients</th><th>Joined</th><th><span className="admin-sr-only">Actions</span></th></tr></thead><tbody>{visible.map(coach => <tr key={coach.id} className={coach.id === selectedId ? 'selected' : ''}><td><strong>{coach.full_name}</strong><small>{coach.email}</small><small>{coach.professional_title}</small></td><td><span className={`admin-status ${coach.is_active ? '' : 'inactive'}`}>{coach.is_active ? 'Active' : 'Offboarded'}</span></td><td>{coach.active_client_count}</td><td>{displayDate(coach.created_at)}</td><td><button className="ghost-button" aria-label={`View ${coach.full_name}`} onClick={() => setSelectedId(coach.id)}>View details <span aria-hidden="true">↗</span></button></td></tr>)}</tbody></table></div>}
        </section>
        {selected && !loading && !error && <CoachDetail key={selected.id} coach={selected} token={accessToken} onClose={() => setSelectedId(null)} onOffboard={coach => { setActionError(''); setOffboarding(coach) }} onResetPassword={coach => { setActionError(''); setResetResult(null); setCopied(false); setResetting(coach) }} />}
      </div>
    </main>
    {onboarding && <OnboardCoach token={accessToken} onClose={() => setOnboarding(false)} onCreated={reload} />}
    {offboarding && <Modal title="Offboard this coach?" onClose={() => setOffboarding(null)} busy={busy}><p><strong>{offboarding.full_name}</strong> will lose access to the Coach portal and client data, including with an existing session.</p><p className="admin-muted">Their {offboarding.active_client_count} active client assignment(s) will end. Client logins and records will remain. Reassignment requires operator assistance; it is not part of this admin dashboard yet.</p>{actionError && <p className="auth-error" role="alert">{actionError}</p>}<div className="admin-dialog-actions"><button className="ghost-button" disabled={busy} onClick={() => setOffboarding(null)}>Keep coach active</button><button className="admin-danger" disabled={busy} onClick={offboard}>{busy ? 'Offboarding…' : 'Confirm offboarding'}</button></div></Modal>}
    {resetting && <Modal title={resetResult ? 'New password ready' : 'Reset this password?'} onClose={closeReset} busy={busy}>{resetResult ? <div className="admin-credentials"><p>A new password was generated for <strong>{resetResult.full_name}</strong>. The login email is unchanged.</p><p className="admin-muted">Share these credentials privately. The new password is shown here only until you close this dialog. No email has been sent. The previous password will no longer work.</p><label>Login email<input value={resetResult.email} readOnly /></label><label>New password<input value={resetResult.initial_password} readOnly autoComplete="off" /></label>{!resetResult.audit_recorded && <p role="alert" className="auth-error">Password was reset, but the audit entry could not be recorded. Contact the system operator.</p>}{actionError && <p role="alert" className="auth-error">{actionError}</p>}<div className="admin-dialog-actions"><button className="ghost-button" onClick={async () => { try { await navigator.clipboard.writeText(`Coach portal\nEmail: ${resetResult.email}\nPassword: ${resetResult.initial_password}`); setCopied(true) } catch { setActionError('Clipboard is unavailable. Select and copy the values above.') } }}>{copied ? 'Copied' : 'Copy credentials'}</button><button className="lime-button" onClick={closeReset}>Done</button></div></div> : <><p>Generate a new password for <strong>{resetting.full_name}</strong>?</p><p className="admin-muted">Their login email stays <strong>{resetting.email}</strong>. The previous password will stop working. Share the new password privately; no email will be sent.</p>{actionError && <p className="auth-error" role="alert">{actionError}</p>}<div className="admin-dialog-actions"><button className="ghost-button" disabled={busy} onClick={closeReset}>Cancel</button><button className="lime-button" disabled={busy} onClick={resetPassword}>{busy ? 'Resetting…' : 'Generate new password'}</button></div></>}</Modal>}
  </div>
}
