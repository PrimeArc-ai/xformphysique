import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

async function getWorkspace(accessToken) {
  const response = await fetch('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || 'Unable to load your XForm workspace.')
  return payload
}

export default function useAuth() {
  const [state, setState] = useState({ loading: true, session: null, workspace: null, error: '' })

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
      try {
        const workspace = await loadWorkspace(session)
        if (active) setState({ loading: false, session, workspace, error: '' })
      } catch (error) {
        if (active) setState({ loading: false, session, workspace: null, error: error.message })
      }
    }

    supabase.auth.getSession().then(({ data }) => hydrate(data.session)).catch((error) => {
      if (active) setState({ loading: false, session: null, workspace: null, error: error.message })
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { hydrate(session) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadWorkspace])

  const signIn = useCallback(async ({ email, password }) => {
    if (!supabase) throw new Error('Supabase authentication is not configured.')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const workspace = await loadWorkspace(data.session)
    setState({ loading: false, session: data.session, workspace, error: '' })
    return workspace
  }, [loadWorkspace])

  const signOut = useCallback(async () => {
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
