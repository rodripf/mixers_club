import type { MessageResponse, Session } from '../types'
export async function handleSendMagicLink(_email: string): Promise<MessageResponse> { return { data: undefined, error: null } }
export async function handleAuthCallback(_token: string): Promise<MessageResponse> { return { data: undefined, error: null } }
export async function handleGetSession(): Promise<MessageResponse<Session | null>> {
  const r: MessageResponse<Session | null> = { data: null, error: null }
  return r
}
export async function handleSignOut(): Promise<MessageResponse> { return { data: undefined, error: null } }
export async function handleSetUsername(_username: string): Promise<MessageResponse> { return { data: undefined, error: null } }
