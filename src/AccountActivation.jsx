import { useState } from 'react'

export default function AccountActivation({ auth }) {
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
      await auth.activateAccount({ password })
    } catch (reason) {
      setError(reason.message || 'Unable to secure this account.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-shell" aria-labelledby="activation-title">
    <section className="auth-card activation-card">
      <div className="os-brand auth-brand"><span className="xp-mark">XP</span><span><strong>XFORM</strong><small>COACHING OS</small></span></div>
      <p className="kicker">CLIENT WORKSPACE ACTIVATION</p>
      <h1 id="activation-title">Set your password.</h1>
      <p>Your coach has prepared your workspace. Create a password to finish secure access.</p>
      <form onSubmit={submit}>
        <label>New password<input type="password" autoComplete="new-password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" minLength="8" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="lime-button" disabled={submitting || password.length < 8}>{submitting ? 'Securing account…' : 'Activate workspace'}</button>
      </form>
      <button className="auth-text-button" type="button" onClick={auth.signOut}>Use another account</button>
    </section>
  </main>
}
