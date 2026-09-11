import { useState } from 'react'

export default function PasswordReset({ auth }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await auth.completePasswordReset({ password })
    } catch (reason) {
      setError(reason.message || 'Unable to update this password.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-shell" aria-labelledby="reset-title">
    <section className="auth-card activation-card">
      <div className="os-brand auth-brand"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
      <p className="kicker">RESET PASSWORD</p>
      <h1 id="reset-title">Set a new password.</h1>
      <p>Choose a new password for your XForm workspace. This works for Client, Coach and Admin.</p>
      <form onSubmit={submit}>
        <label>New password<input type="password" autoComplete="new-password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" minLength="8" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="lime-button" disabled={submitting || password.length < 8}>{submitting ? 'Saving password…' : 'Save password'}</button>
      </form>
      <button className="auth-text-button" type="button" disabled={submitting} onClick={auth.signOut}>Back to sign in</button>
    </section>
  </main>
}
