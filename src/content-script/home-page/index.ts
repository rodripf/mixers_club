import type { Message, TrendingRecipe } from '../../types'
import { waitForElement } from '../dom-helpers'
import { buildTrendingSection } from './trending-section'

function send<T = void>(msg: Message): Promise<{ data: T | null; error: string | null }> {
  return chrome.runtime.sendMessage(msg)
}

export async function initHomePage(_domain: string): Promise<void> {
  try {
    await waitForElement('div.l-main section')
    const main = document.querySelector<HTMLElement>('div.l-main')!

    const result = await send<TrendingRecipe[]>({ action: 'getTrending' })
    const recipes = result.data ?? []

    const section = buildTrendingSection(recipes)
    main.insertBefore(section, main.firstChild)
  } catch (err) {
    // waitForElement already logged the timeout error
  }
}
