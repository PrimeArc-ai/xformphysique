import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

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
      const current = ++generation.current
      if (event === 'PASSWORD_RECOVERY' || (session && recoveryRedirect())) {
        if (active && current === generation.current) {
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

    supabase.auth.getSession().then(({ data }) => hydrate(data.session)).catch((error) => {
      if (active) setState({ loading: false, session: null, workspace: null, error: error.message })
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => { hydrate(session, event) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadWorkspace])

  const signIn = useCallback(async ({ email, password, portal }) => {
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
    setPasswordRecovery(false)
    if (supabase) await supabase.auth.signOut()
    setState({ loading: false, session: null, workspace: null, error: '' })
  }, [])

  const requestPasswordReset = useCallback(async ({ email }) => {
    if (!supabaseConfigured || !supabase) return { sent: true, localDemo: true }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    })
    if (error) throw error
    return { sent: true, localDemo: false }
  }, [])

  const setPasswordAndSignIn = useCallback(async ({ email, password, confirmPassword, portal }) => {
    if (password !== confirmPassword) throw new Error('Passwords do not match.')
    if (!supabaseConfigured || !supabase) {
      return signIn({ email, password, portal })
    }
    let response
    try {
      response = await fetch('/api/v1/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ email, password, confirm_password: confirmPassword }),
      })
    } catch {
      throw new Error('Unable to reach the XForm server. Check your connection and try again.')
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const fields = Object.values(payload?.error?.fields || {}).join(' ')
      const message = typeof payload?.error?.message === 'string' ? payload.error.message : null
      throw new Error(fields || message || 'Unable to update this password.')
    }
    return signIn({ email, password, portal })
  }, [signIn])

  const beginLocalPasswordRecovery = useCallback(() => {
    setPasswordRecovery(true)
    setState({
      loading: false,
      session: { access_token: 'local-demo-recovery', user: { id: 'local-demo-recovery', email: '', user_metadata: {} } },
      workspace: null,
      error: '',
    })
  }, [])

  const completePasswordReset = useCallback(async ({ password }) => {
    if (!supabaseConfigured || !supabase) {
      setPasswordRecovery(false)
      setState({ loading: false, session: null, workspace: null, error: '' })
      return
    }
    if (!state.session) throw new Error('Your reset link has expired. Request a new one from the sign-in page.')
    const { data, error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    const session = { ...state.session, user: data.user }
    const workspace = await loadWorkspace(session)
    setPasswordRecovery(false)
    if (window.location.hash || window.location.search.includes('type=recovery')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    setState({ loading: false, session, workspace, error: '' })
    return workspace
  }, [loadWorkspace, state.session])

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
    signIn,
    signOut,
    activateAccount,
    requestPasswordReset,
    setPasswordAndSignIn,
    beginLocalPasswordRecovery,
    completePasswordReset,
  }
}
