import { describe, it, expect, beforeEach, vi } from 'vitest'
import { waitForElement, gravatarUrl } from '../../src/content-script/dom-helpers'

describe('waitForElement', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('resolves immediately if element already exists', async () => {
    document.body.innerHTML = '<div id="target"></div>'
    const el = await waitForElement('#target')
    expect(el).toBeTruthy()
    expect(el.id).toBe('target')
  })

  it('resolves when element is added to DOM', async () => {
    const promise = waitForElement('#late', 2000)
    setTimeout(() => {
      document.body.innerHTML = '<div id="late"></div>'
    }, 50)
    const el = await promise
    expect(el.id).toBe('late')
  })

  it('rejects and logs error after timeout', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(waitForElement('#never', 100)).rejects.toThrow('Element not found')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Mixers Club]'),
      expect.stringContaining('#never')
    )
    errorSpy.mockRestore()
  })
})

describe('gravatarUrl', () => {
  it('returns a gravatar URL with a pre-computed SHA-256 hash', () => {
    const hash = 'a'.repeat(64) // 64 hex chars = SHA-256
    const url = gravatarUrl(hash, 48)
    expect(url).toBe(`https://www.gravatar.com/avatar/${hash}?d=identicon&s=48`)
  })

  it('uses the default size of 48', () => {
    const hash = 'b'.repeat(64)
    expect(gravatarUrl(hash)).toBe(`https://www.gravatar.com/avatar/${hash}?d=identicon&s=48`)
  })
})

describe('translateText', () => {
  it('throws on unexpected response shape (not nested array)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: 'object' }),
    }) as unknown as typeof fetch

    const { translateText } = await import('../../src/content-script/dom-helpers')
    await expect(translateText('hello', 'es')).rejects.toThrow('Unexpected translation response shape')
  })

  it('returns joined translated string on valid response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[['Hola', 'hello', null, null, null]], null, 'en'],
    }) as unknown as typeof fetch

    const { translateText } = await import('../../src/content-script/dom-helpers')
    const result = await translateText('hello', 'es')
    expect(result).toBe('Hola')
  })
})
