import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('[Mixers Club] Missing Supabase env vars. Check .env file.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => chrome.storage.local.get(key).then(r => {
        const v = r[key]
        return typeof v === 'string' ? v : null
      }),
      setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
      removeItem: (key) => chrome.storage.local.remove(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
