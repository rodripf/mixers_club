import { describe, it, expect } from 'vitest'
import { detectPage, extractRecipeId } from '../../src/content-script/page-detector'

describe('detectPage', () => {
  it('detects recipe pages', () => {
    expect(detectPage('/recipes/recipe/en-GB/r268795')).toBe('recipe')
    expect(detectPage('/recipes/recipe/es-ES/r12345')).toBe('recipe')
  })

  it('detects home pages', () => {
    expect(detectPage('/foundation/en-GB/for-you')).toBe('home')
    expect(detectPage('/foundation/de-DE/for-you')).toBe('home')
  })

  it('returns other for unrecognised paths', () => {
    expect(detectPage('/search/en-GB')).toBe('other')
    expect(detectPage('/foundation/en-GB/explore')).toBe('other')
    expect(detectPage('/')).toBe('other')
  })
})

describe('extractRecipeId', () => {
  it('extracts the recipe ID from a recipe URL', () => {
    expect(extractRecipeId('/recipes/recipe/en-GB/r268795')).toBe('r268795')
  })

  it('returns null for non-recipe URLs', () => {
    expect(extractRecipeId('/search/en-GB')).toBeNull()
  })
})
