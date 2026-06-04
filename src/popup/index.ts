import type { Message, Session } from '../types'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

function render(session: Session | null) {
  const app = document.getElementById('app')!

  if (!session) {
    app.innerHTML = `
      <h3 style="margin:0 0 12px">Mixers Club</h3>
      <p id="mc-status"></p>
      <input id="mc-email" type="email" placeholder="your@email.com" />
      <button id="mc-send">Send magic link</button>
    `
    document.getElementById('mc-send')!.addEventListener('click', async () => {
      const email = (document.getElementById('mc-email') as HTMLInputElement).value.trim()
      if (!email) return
      const status = document.getElementById('mc-status')!
      status.textContent = 'Sending…'
      const result = await send({ action: 'sendMagicLink', email })
      status.textContent = result.error ? `Error: ${result.error}` : 'Check your email for the link!'
    })
    return
  }

  if (!session.username) {
    app.innerHTML = `
      <h3 style="margin:0 0 12px">Choose a username</h3>
      <p id="mc-status"></p>
      <input id="mc-username" type="text" placeholder="e.g. chef_rodriguez" />
      <button id="mc-save">Save</button>
    `
    document.getElementById('mc-save')!.addEventListener('click', async () => {
      const username = (document.getElementById('mc-username') as HTMLInputElement).value.trim()
      if (!username) return
      const status = document.getElementById('mc-status')!
      status.textContent = 'Saving…'
      const result = await send({ action: 'setUsername', username })
      if (result.error) { status.textContent = `Error: ${result.error}`; return }
      const refreshed = await send<Session>({ action: 'getSession' })
      render(refreshed.data)
    })
    return
  }

  app.innerHTML = `
    <h3 style="margin:0 0 8px">Mixers Club</h3>
    <p>Signed in as <strong id="mc-username-display"></strong></p>
    <button id="mc-logout">Sign out</button>
  `
  document.getElementById('mc-username-display')!.textContent = session.username
  document.getElementById('mc-logout')!.addEventListener('click', async () => {
    await send({ action: 'signOut' })
    render(null)
  })
}

async function init() {
  const result = await send<Session>({ action: 'getSession' })
  render(result.data)
}

init()
