import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

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
  const signingIn = useRef(false)
  const generation = useRef(0)

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
    const hydrate = async (session) => {
      if (signingIn.current) return
      const current = ++generation.current
      try {
        const workspace = await loadWorkspace(session)
        if (active && current === generation.current) setState({ loading: false, session, workspace, error: '' })
      } catch (error) {
        if (active && current === generation.current) setState({ loading: false, session, workspace: null, error: error.message })
      }
    }

    supabase.auth.getSession().then(({ data }) => hydrate(data.session)).catch((error) => {
      if (active) setState({ loading: false, session: null, workspace: null, error: error.message })
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { hydrate(session) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadWorkspace])

  const signIn = useCallback(async ({ email, password, portal }) => {
    if (!supabase) throw new Error('Supabase authentication is not configured.')
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
    if (supabase) await supabase.auth.signOut()
    setState({ loading: false, session: null, workspace: null, error: '' })
  }, [])

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

  return { ...state, configured: supabaseConfigured, activationRequired, signIn, signOut, activateAccount }
}
