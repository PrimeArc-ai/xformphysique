import { createClient } from '@supabase/supabase-js'

// Capture recovery intent BEFORE the SDK consumes/clears URL tokens. Otherwise
// INITIAL_SESSION can race PASSWORD_RECOVERY and briefly load a workspace.
const initialHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
const initialQuery = new URLSearchParams(window.location.search)
export const initialRecoveryRedirect = initialHash.get('type') === 'recovery' || initialQuery.get('type') === 'recovery'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(url && publishableKey)

export const supabase = supabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
