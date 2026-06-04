import { describe, it, expect, beforeEach } from 'vitest'
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
  it('returns a gravatar URL with identicon fallback', () => {
    const url = gravatarUrl('Test@Example.com', 48)
    expect(url).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{32}\?d=identicon&s=48$/)
  })

  it('is case-insensitive and trims whitespace', () => {
    const a = gravatarUrl('TEST@EXAMPLE.COM', 48)
    const b = gravatarUrl('  test@example.com  ', 48)
    expect(a).toBe(b)
  })
})
