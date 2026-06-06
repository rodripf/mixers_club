import type { MessageResponse, PublicSession } from '../types'
import { supabase } from './supabase'

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim().toLowerCase()))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

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

export async function handleGetSession(): Promise<MessageResponse<PublicSession | null>> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return { data: null, error: error.message }
  if (!data.session) return { data: null, error: null }

  const { user } = data.session
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
  const trimmed = username.trim()
  if (!trimmed) return { data: null, error: 'Username cannot be empty' }

  const { data, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError.message }
  if (!data.session) return { data: null, error: 'Not authenticated' }

  const email_hash = await sha256hex(data.session.user.email ?? '')
  const { error } = await supabase.from('users').upsert({
    id: data.session.user.id,
    username: trimmed,
    email_hash,
  })
  if (error) return { data: null, error: error.message }
  return { data: undefined, error: null }
}
