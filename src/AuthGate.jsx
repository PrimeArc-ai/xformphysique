import { useState } from 'react'

export default function AuthGate({ auth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(auth.error)

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await auth.signIn({ email, password })
    } catch (reason) {
      setError(reason.message || 'Unable to sign in. Please check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-shell">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="os-brand auth-brand"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
      <p className="kicker">SECURE WORKSPACE ACCESS</p>
      <h1 id="auth-title">Welcome back.</h1>
      <p>Sign in to open the workspace assigned to your account. Client and coach access are determined server-side.</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="lime-button" disabled={submitting || !auth.configured}>{submitting ? 'Signing in…' : 'Sign in securely'}</button>
      </form>
      {!auth.configured && <div className="auth-error" role="alert">Supabase configuration is missing. Add the local environment values, then restart Vite.</div>}
      <small className="auth-footnote">No role can be selected here. XForm verifies your account and opens only the authorised workspace.</small>
    </section>
  </main>
}
