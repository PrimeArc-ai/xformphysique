import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, supabaseConfigured, initialRecoveryRedirect } from '../lib/supabase'

const DEMO_WORKSPACES = {
  client: { id: 'cl_001', email: 'maya@xform.local', first_name: 'Maya', full_name: 'Maya Shah', role: 'client' },
  coach: { id: 'local-demo-coach', email: 'coach@xform.local', first_name: 'Aarav', full_name: 'Aarav Rao', role: 'coach' },
  admin: { id: 'local-demo-admin', email: 'admin@xform.local', first_name: 'Navaneet', full_name: 'Navaneet Deshpande', role: 'admin' },
}

function demoSession(portal) {
  const workspace = DEMO_WORKSPACES[['client', 'coach', 'admin'].includes(portal) ? portal : 'client']
  return {
    workspace,
    session: {
      access_token: `local-demo-${workspace.role}`,
      user: { id: workspace.id, email: workspace.email, user_metadata: {} },
    },
  }
}

async function getWorkspace(accessToken, portal) {
  let response
  try {
    response = await fetch(`/api/v1/auth/me${portal ? `?portal=${encodeURIComponent(portal)}` : ''}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
  } catch {
    throw new Error('Unable to reach the XForm server. Check your connection and try again.')
  }
  // A stopped backend can produce an empty or HTML proxy response, not API JSON.
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof payload?.error?.message === 'string' ? payload.error.message : null
    throw new Error(message || (response.status >= 500
      ? 'XForm server is temporarily unavailable. Please try signing in again shortly.'
      : 'Unable to load your XForm workspace. Please try signing in again.'))
  }
  if (!payload?.id || !['client', 'coach', 'admin'].includes(payload.role)) {
    throw new Error('XForm returned an invalid response. Please try signing in again.')
  }
  return payload
}

export default function useAuth() {
  const [state, setState] = useState({ loading: true, session: null, workspace: null, error: '' })
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [passwordResetComplete, setPasswordResetComplete] = useState(false)
  const recovering = useRef(initialRecoveryRedirect)
  const signingIn = useRef(false)
  const generation = useRef(0)

  const recoveryRedirect = () => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    return hash.get('type') === 'recovery' || query.get('type') === 'recovery'
  }

  const loadWorkspace = useCallback(async (session) => {
    if (!session) return null
    return getWorkspace(session.access_token)
  }, [])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setState({ loading: false, session: null, workspace: null, error: 'Supabase authentication is not configured.' })
      return undefined
    }

    let active = true
    const hydrate = async (session, event) => {
      if (signingIn.current) return
      if (linkFailed) return
      const current = ++generation.current
      if (!session && recovering.current) {
        if (active) {
          window.history.replaceState(null, '', window.location.pathname)
          setState({ loading: false, session: null, workspace: null, error: 'This reset link is incomplete or has expired. Request a new link.' })
        }
        return
      }
      if (session && (event === 'PASSWORD_RECOVERY' || recoveryRedirect() || recovering.current || sessionStorage.getItem('xform.recovery-user') === session.user.id)) {
        if (active && current === generation.current) {
          recovering.current = true
          sessionStorage.setItem('xform.recovery-user', session.user.id)
          setPasswordRecovery(true)
          setState({ loading: false, session, workspace: null, error: '' })
        }
        return
      }
      try {
        const workspace = await loadWorkspace(session)
        if (active && current === generation.current) {
          setPasswordRecovery(false)
          setState({ loading: false, session, workspace, error: '' })
        }
      } catch (error) {
        if (active && current === generation.current) {
          setPasswordRecovery(false)
          setState({ loading: false, session, workspace: null, error: error.message })
        }
      }
    }

    const linkParams = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search.slice(1))
    const linkFailed = linkParams.has('error') || linkParams.has('error_code')
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || linkFailed) throw error || new Error('This reset link has expired or already been used. Request a new link.')
      return hydrate(data.session)
    }).catch((error) => {
      if (active) setState({ loading: false, session: null, workspace: null, error: linkFailed ? 'This reset link has expired or already been used. Request a new link.' : error.message })
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => { hydrate(session, event) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadWorkspace])

  const signIn = useCallback(async ({ email, password, portal }) => {
    setPasswordResetComplete(false)
    recovering.current = false
    sessionStorage.removeItem('xform.recovery-user')
    setPasswordRecovery(false)
    if (!supabaseConfigured || !supabase) {
      const demo = demoSession(portal)
      setState({ loading: false, session: demo.session, workspace: demo.workspace, error: '' })
      return demo.workspace
    }
    signingIn.current = true
    ++generation.current // Invalidate in-flight auth listener hydration; no wrong-portal flash.
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const workspace = await getWorkspace(data.session.access_token, portal)
      setState({ loading: false, session: data.session, workspace, error: '' })
      return workspace
    } catch (error) {
      await supabase.auth.signOut({ scope: 'local' })
      setState({ loading: false, session: null, workspace: null, error: error.message })
      throw error
    } finally {
      signingIn.current = false
    }
  }, [])

  const signOut = useCallback(async () => {
    ++generation.current
    recovering.current = false
    sessionStorage.removeItem('xform.recovery-user')
    setPasswordRecovery(false)
    if (supabase) await supabase.auth.signOut()
    setState({ loading: false, session: null, workspace: null, error: '' })
  }, [])

  const requestPasswordReset = useCallback(async ({ email }) => {
    if (!supabaseConfigured || !supabase) throw new Error('Password recovery requires configured authentication. No email was sent from this local demo.')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    })
    if (error) throw error
    return { sent: true, localDemo: false }
  }, [])

  const completePasswordReset = useCallback(async ({ password }) => {
    if (!supabase || !state.session || !passwordRecovery) throw new Error('Your reset link has expired. Request a new one from the sign-in page.')
    if (password.length < 8) throw new Error('Use at least eight characters.')
    signingIn.current = true
    ++generation.current
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      // Suppress USER_UPDATED hydration: recovery ends at confirmation/login,
      // never at a portal before the user explicitly signs in again.
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) await supabase.auth.signOut({ scope: 'local' })
      recovering.current = false
      sessionStorage.removeItem('xform.recovery-user')
      setPasswordRecovery(false)
      setPasswordResetComplete(true)
      window.history.replaceState(null, '', window.location.pathname)
      setState({ loading: false, session: null, workspace: null, error: '' })
    } finally {
      signingIn.current = false
    }
  }, [passwordRecovery, state.session])

  const activateAccount = useCallback(async ({ password }) => {
    if (!supabase || !state.session) throw new Error('Your activation link has expired. Ask your coach to send a new invitation.')
    const { data, error } = await supabase.auth.updateUser({
      password,
      data: { ...state.session.user?.user_metadata, xform_password_set: true },
    })
    if (error) throw error
    const session = { ...state.session, user: data.user }
    const workspace = await loadWorkspace(session)
    setState({ loading: false, session, workspace, error: '' })
    return workspace
  }, [loadWorkspace, state.session])

  const activationRequired = Boolean(
    state.session?.user?.user_metadata?.xform_invitation
    && !state.session?.user?.user_metadata?.xform_password_set,
  )

  return {
    ...state,
    configured: supabaseConfigured,
    localDemo: !supabaseConfigured,
    activationRequired,
    passwordRecovery,
    passwordResetComplete,
    signIn,
    signOut,
    activateAccount,
    requestPasswordReset,
    completePasswordReset,
  }
}
