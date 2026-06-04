import md5 from 'blueimp-md5'

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

export function gravatarUrl(email: string, size = 48): string {
  const hash = md5(email.trim().toLowerCase())
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`
}
