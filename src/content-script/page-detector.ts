export type PageType = 'recipe' | 'home' | 'other'

export function detectPage(pathname: string): PageType {
  if (/\/recipes\/recipe\/[^/]+\/r\w+/.test(pathname)) return 'recipe'
  if (/\/foundation\/[^/]+\/for-you$/.test(pathname)) return 'home'
  return 'other'
}

export function extractRecipeId(pathname: string): string | null {
  return pathname.match(/\/recipes\/recipe\/[^/]+\/(r\w+)/)?.[1] ?? null
}
