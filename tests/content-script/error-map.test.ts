import { vi, describe, it, expect } from 'vitest'

vi.mock('../../src/i18n', () => ({ t: (key: string) => key }))

describe('friendlyError', () => {
  it('maps username uniqueness constraint to errUsernameTaken', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('duplicate key value violates unique constraint "users_username_key"'))
      .toBe('errUsernameTaken')
  })

  it('maps username format constraint to errInputTooLong', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('new row violates check constraint "users_username_check"'))
      .toBe('errInputTooLong')
  })

  it('maps body length constraint to errInputTooLong', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('new row violates check constraint "reviews_body_length_check"'))
      .toBe('errInputTooLong')
  })

  it('maps email rate limit to errEmailRateLimit', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('Email rate limit exceeded'))
      .toBe('errEmailRateLimit')
  })

  it('maps unknown errors to errGeneric', async () => {
    const { friendlyError } = await import('../../src/content-script/error-map')
    expect(friendlyError('some internal postgres error'))
      .toBe('errGeneric')
  })
})
