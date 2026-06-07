import type { Message, PublicSession } from '../types'
import { t } from '../i18n'
import { friendlyError } from './error-map'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

function makeInput(type: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input')
  input.type = type
  input.placeholder = placeholder
  input.style.cssText = [
    'width:100%',
    'box-sizing:border-box',
    'padding:14px 16px',
    'border:1.5px solid #e5e7eb',
    'border-radius:10px',
    'font-size:1rem',
    'margin-bottom:12px',
    'outline:none',
    'font-family:inherit',
    'color:#23282a',
  ].join(';')
  input.addEventListener('focus', () => { input.style.borderColor = '#23282a' })
  input.addEventListener('blur', () => { input.style.borderColor = '#e5e7eb' })
  return input
}

function makeBtn(text: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'button--primary'
  btn.style.cssText = 'width:100%;padding:14px;font-size:1rem;box-sizing:border-box;cursor:pointer'
  btn.textContent = text
  return btn
}

function makeError(): HTMLParagraphElement {
  const el = document.createElement('p')
  el.style.cssText = 'color:#dc2626;font-size:0.85rem;margin:0 0 10px;display:none'
  return el
}

function makeHeader(title: string, subtitle: string, iconText: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'text-align:center;margin-bottom:24px'

  const icon = document.createElement('div')
  icon.style.cssText = 'font-size:2.5rem;margin-bottom:12px'
  icon.textContent = iconText

  const h3 = document.createElement('h3')
  h3.style.cssText = 'margin:0 0 6px;font-size:1.25rem;font-weight:700;color:#23282a;font-family:inherit'
  h3.textContent = title

  const p = document.createElement('p')
  p.style.cssText = 'margin:0;color:#6b7280;font-size:0.9rem;line-height:1.5;font-family:inherit'
  p.textContent = subtitle

  wrap.appendChild(icon)
  wrap.appendChild(h3)
  wrap.appendChild(p)
  return wrap
}

export function showAuthModal(onAuthenticated: () => void): void {
  if (document.getElementById('mc-auth-modal')) return

  const overlay = document.createElement('div')
  overlay.id = 'mc-auth-modal'
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(0,0,0,.55)',
    'z-index:10000',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:16px',
  ].join(';')

  const modal = document.createElement('div')
  modal.style.cssText = [
    'background:#fff',
    'border-radius:24px',
    'padding:36px 32px 32px',
    'max-width:420px',
    'width:100%',
    'position:relative',
    'box-shadow:rgba(0,0,0,.2) 0 20px 60px',
  ].join(';')

  const closeBtn = document.createElement('button')
  closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:none;border:none;cursor:pointer;font-size:1.3rem;padding:4px;line-height:1;color:#9ca3af'
  closeBtn.textContent = '✕'
  closeBtn.addEventListener('click', () => overlay.remove())
  modal.appendChild(closeBtn)

  const content = document.createElement('div')
  modal.appendChild(content)

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  showLogin()

  function showLogin() {
    content.innerHTML = ''
    content.appendChild(makeHeader(t('authLoginTitle'), t('authLoginSubtitle'), '🍳'))

    const emailInput = makeInput('email', t('authEmailPlaceholder'))
    const errorEl = makeError()
    const btn = makeBtn(t('authSendLink'))

    btn.addEventListener('click', async () => {
      const email = emailInput.value.trim()
      if (!email) { errorEl.textContent = t('authErrEmail'); errorEl.style.display = ''; return }
      btn.disabled = true
      btn.textContent = t('authSending')
      errorEl.style.display = 'none'
      const result = await send({ action: 'sendMagicLink', email })
      if (result.error) {
        errorEl.textContent = friendlyError(result.error ?? '')
        errorEl.style.display = ''
        btn.disabled = false
        btn.textContent = t('authSendLink')
      } else {
        showEmailSent(email)
      }
    })
    emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click() })

    const privacyNote = document.createElement('p')
    privacyNote.style.cssText = 'margin:-4px 0 12px;font-size:0.78rem;color:#9ca3af;line-height:1.4'
    privacyNote.textContent = 'Your email is used for login only. '
    const privacyLink = document.createElement('a')
    privacyLink.href = 'https://github.com/rodripf/mixers_club/blob/master/PRIVACY.md'
    privacyLink.target = '_blank'
    privacyLink.rel = 'noopener noreferrer'
    privacyLink.textContent = 'Privacy Policy'
    privacyLink.style.cssText = 'color:#6b7280;text-decoration:underline;font-size:0.78rem'
    privacyNote.appendChild(privacyLink)

    content.appendChild(emailInput)
    content.appendChild(privacyNote)
    content.appendChild(errorEl)
    content.appendChild(btn)
  }

  function showEmailSent(email: string) {
    content.innerHTML = ''

    const header = makeHeader(t('authEmailSentTitle'), '', '📧')
    const subtitle = document.createElement('p')
    subtitle.style.cssText = 'margin:0;color:#6b7280;font-size:0.9rem;line-height:1.5'
    subtitle.textContent = t('authEmailSentPrefix')
    const strong = document.createElement('strong')
    strong.style.color = '#23282a'
    strong.textContent = email
    subtitle.appendChild(strong)
    subtitle.append(t('authEmailSentSuffix'))
    header.appendChild(subtitle)
    content.appendChild(header)

    const senderNote = document.createElement('p')
    senderNote.style.cssText = 'margin:0 0 16px;font-size:0.78rem;color:#9ca3af;text-align:center;line-height:1.4'
    senderNote.textContent = 'Expect the email from noreply@mail.app.supabase.io'
    content.appendChild(senderNote)

    const btn = makeBtn(t('authClickedLink'))
    const hint = document.createElement('p')
    hint.style.cssText = 'color:#6b7280;font-size:0.85rem;text-align:center;margin:10px 0 0;min-height:1.2em'

    btn.addEventListener('click', async () => {
      btn.disabled = true
      btn.textContent = t('authChecking')
      hint.textContent = ''
      const result = await send<PublicSession>({ action: 'getSession' })
      if (!result.data) {
        hint.textContent = t('authNotVerified')
        btn.disabled = false
        btn.textContent = t('authClickedLink')
      } else if (!result.data.username) {
        showUsernameForm()
      } else {
        overlay.remove()
        onAuthenticated()
      }
    })

    content.appendChild(btn)
    content.appendChild(hint)
  }

  function showUsernameForm() {
    content.innerHTML = ''
    content.appendChild(makeHeader(t('authUsernameTitle'), t('authUsernameSubtitle'), '👤'))

    const usernameInput = makeInput('text', t('authUsernamePlaceholder'))
    const errorEl = makeError()
    const btn = makeBtn(t('authSaveUsername'))

    btn.addEventListener('click', async () => {
      const username = usernameInput.value.trim()
      if (!username) { errorEl.textContent = t('authErrUsername'); errorEl.style.display = ''; return }
      btn.disabled = true
      btn.textContent = t('authSavingUsername')
      errorEl.style.display = 'none'
      const result = await send({ action: 'setUsername', username })
      if (result.error) {
        errorEl.textContent = friendlyError(result.error ?? '')
        errorEl.style.display = ''
        btn.disabled = false
        btn.textContent = t('authSaveUsername')
      } else {
        overlay.remove()
        onAuthenticated()
      }
    })
    usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click() })

    content.appendChild(usernameInput)
    content.appendChild(errorEl)
    content.appendChild(btn)
  }
}
