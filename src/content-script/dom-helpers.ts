export function waitForElement(selector: string, timeout = 10000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector)
    if (existing) { resolve(existing); return }

    const timer = setTimeout(() => {
      observer.disconnect()
      const msg = `Element not found: ${selector}`
      console.error(`[Mixers Club] Element not found on ${window.location.hostname}${window.location.pathname}:`, selector)
      reject(new Error(msg))
    }, timeout)

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        clearTimeout(timer)
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

export function gravatarUrl(emailHash: string, size = 48): string {
  return `https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=${size}`
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`${resp.status}`)
  const data = await resp.json() as Array<unknown>
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Unexpected translation response shape')
  }
  return (data[0] as Array<[string]>).map(chunk => chunk[0]).join('')
}
