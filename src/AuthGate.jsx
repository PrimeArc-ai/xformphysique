import { useState } from 'react'

export default function AuthGate({ auth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [portal, setPortal] = useState('client')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(auth.error)

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

  return <main className="auth-shell">
    <section className="auth-card auth-login" aria-labelledby="auth-title">
      <div className="auth-hero">
        <div className="os-brand auth-brand"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
        <div className="auth-hero-copy"><p className="kicker">PRECISION. WITH PULSE.</p><h2>Your work.<br /><span>Your progress.</span></h2><p>Small steps. Consistent progress.<br />Coaching built around you.</p></div>
      </div>
      <div className="auth-login-body">
      <p className="kicker">SECURE WORKSPACE ACCESS</p>
      <h1 id="auth-title">Welcome back.</h1>
      <p>Your space to move forward. Choose your portal and sign in.</p>
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
        <button className="lime-button" disabled={submitting || !auth.configured}>{submitting ? 'Signing in…' : 'Sign in securely'}<span aria-hidden="true">→</span></button>
      </form>
      {!auth.configured && <div className="auth-error" role="alert">Supabase configuration is missing. Add the local environment values, then restart Vite.</div>}
      <small className="auth-footnote">Your account permissions protect each workspace. Selecting a portal does not change your access.</small>
      <p className="auth-privacy">Private by design. Personal by default.</p>
      </div>
    </section>
  </main>
}
