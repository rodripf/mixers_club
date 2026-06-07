import { t } from '../i18n'

export function friendlyError(raw: string): string {
  console.error('[Mixers Club] Supabase error:', raw)
  if (raw.includes('users_username_key'))          return t('errUsernameTaken')
  if (raw.includes('users_username_check'))         return t('errInputTooLong')
  if (raw.includes('reviews_body_length_check'))    return t('errInputTooLong')
  if (/email rate limit|over_email_send_rate_limit|security purposes/i.test(raw)) return t('errEmailRateLimit')
  return t('errGeneric')
}
