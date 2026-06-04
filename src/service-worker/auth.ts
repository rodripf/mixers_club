import type { MessageResponse, Session } from '../types'
import { supabase } from './supabase'

export async function handleSendMagicLink(email: string): Promise<MessageResponse> {
  const redirectTo = `chrome-extension://${chrome.runtime.id}/auth-callback.html`
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  })
  if (error) return { data: null, error: error.message }
  return { data: undefined, error: null }
}

export async function handleAuthCallback(token: string): Promise<MessageResponse> {
  // token is the full hash string: "access_token=...&refresh_token=...&..."
  const params = new URLSearchParams(token)
  const access_token = params.get('access_token') ?? ''
  const refresh_token = params.get('refresh_token') ?? ''
  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  if (error) return { data: null, error: error.message }
  return { data: undefined, error: null }
}

export async function handleGetSession(): Promise<MessageResponse<Session | null>> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return { data: null, error: error.message }
  if (!data.session) return { data: null, error: null }

  const { user, access_token, refresh_token } = data.session
  const { data: profile } = await supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .single()

  return {
    data: {
      userId: user.id,
      email: user.email ?? '',
      username: profile?.username ?? null,
      accessToken: access_token,
      refreshToken: refresh_token,
    },
    error: null,
  }
}

export async function handleSignOut(): Promise<MessageResponse> {
  const { error } = await supabase.auth.signOut()
  if (error) return { data: null, error: error.message }
  return { data: undefined, error: null }
}

export async function handleSetUsername(username: string): Promise<MessageResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: 'Not authenticated' }

  const { error } = await supabase.from('users').upsert({
    id: session.user.id,
    username: username.trim(),
    email: session.user.email ?? '',
  })
  if (error) return { data: null, error: error.message }
  return { data: undefined, error: null }
}
