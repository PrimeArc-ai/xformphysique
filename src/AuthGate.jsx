import { useEffect, useState } from 'react'

export default function AuthGate({ auth }) {
  const [email, setEmail] = useState(auth.localDemo ? 'local@xform.demo' : '')
  const [password, setPassword] = useState(auth.localDemo ? 'localdemo' : '')
  const [resetSent, setResetSent] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [portal, setPortal] = useState('client')
  const [view, setView] = useState('login')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(auth.localDemo ? '' : auth.error)

  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  useEffect(() => {
    if (!resendAt) return undefined
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= resendAt) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendAt])

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await auth.signIn({ email, password, portal })
    } catch (reason) {
      setError(reason.message || 'Unable to sign in. Please check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  const requestReset = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await auth.requestPasswordReset({ email })
      setResetSent(true)
      const requestedAt = Date.now()
      setNow(requestedAt)
      setResendAt(requestedAt + 60_000)
    } catch (reason) {
      setError(reason.message || 'Unable to request a reset email. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const openForgot = () => {
    setView('forgot')
    setPassword('')
    setResetSent(false)
    setResendAt(0)
    setError('')
  }

  const backToLogin = () => {
    setView('login')
    setPassword('')
    setResetSent(false)
    setResendAt(0)
    setError('')
  }

  return <main className="auth-shell auth-login-shell">
    <section className="auth-card auth-login" aria-labelledby="auth-title">
      <div className="auth-hero">
        <div className="os-brand auth-brand"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
        <div className="auth-hero-copy"><p className="kicker">PRECISION. WITH PULSE.</p><h2>Your work.<br /><span>Your progress.</span></h2><p>Small steps. Consistent progress.<br />Coaching built around you.</p></div>
      </div>
      <div className="auth-login-body">
      {view === 'login' && <>
      <p className="kicker">SECURE WORKSPACE ACCESS</p>
      <h1 id="auth-title">Welcome back.</h1>
      <p>Your space to move forward. Choose your portal and sign in.</p>
      {auth.passwordResetComplete && <p role="status">Password updated. Sign in with your new password.</p>}
      <form onSubmit={submit}>
        <fieldset className="portal-selector" disabled={submitting}>
          <legend>Choose your portal</legend>
          <div>{['client', 'coach', 'admin'].map(role => <label key={role} className={portal === role ? 'selected' : ''}>
            <input type="radio" name="portal" value={role} checked={portal === role} onChange={() => { setPortal(role); setError('') }} />
            <span>{role[0].toUpperCase() + role.slice(1)}</span>
          </label>)}</div>
        </fieldset>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="lime-button" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign In'}</button>
        <button className="auth-text-button auth-forgot-link" type="button" disabled={submitting} onClick={openForgot}>Forgot password?</button>
      </form>
      </>}
      {view === 'forgot' && <>
      <p className="kicker">RESET ACCESS</p>
      <h1 id="auth-title">Forgot password.</h1>
      <p>Enter your account email. We’ll send a secure, time-limited link to reset your password. The same process works for Client, Coach and Admin.</p>
      <form onSubmit={requestReset}>
        <label>Email<input type="email" autoComplete="email" value={email} disabled={submitting} onChange={(event) => { setEmail(event.target.value); setResetSent(false); setResendAt(0); setError('') }} required autoFocus /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {resetSent && <p role="status">If an account exists for this email, a reset link has been requested. Check your inbox and spam folder. Delivery may take a few minutes.</p>}
        <button className="lime-button" disabled={submitting || resendSeconds > 0}>{submitting ? 'Requesting…' : resendSeconds > 0 ? `Resend in ${resendSeconds}s` : resetSent ? 'Resend reset link' : 'Send reset link'}</button>
        <button className="auth-text-button auth-forgot-link" type="button" disabled={submitting} onClick={backToLogin}>Back to sign in</button>
      </form>
      </>}
      {auth.localDemo && view === 'login' && <p className="auth-footnote">Local demo is on. Choose Client, Coach or Admin and sign in to explore. This is sample data, not live accounts.</p>}
      <small className="auth-footnote">Your account permissions protect each workspace. Selecting a portal does not change your access.</small>
      <p className="auth-privacy">Private by design. Personal by default.</p>
      </div>
    </section>
  </main>
}
