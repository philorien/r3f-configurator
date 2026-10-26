import { CUSTOM_ID } from './models'
import { serialize } from './share'
import { useConfigurator } from './store'

const DEBOUNCE_MS = 250

export const currentLink = () => {
  const s = useConfigurator.getState()
  if (s.modelId === CUSTOM_ID) return null
  const query = serialize(s)
  return `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`
}

/**
 * Keep the address bar in step with the configuration, so the URL is always shareable.
 * replaceState (not pushState) avoids filling history with one entry per slider tick, and the
 * debounce keeps us under Safari's limit on history API calls.
 */
export function startUrlSync() {
  let timer: ReturnType<typeof setTimeout> | undefined
  const write = () => {
    const s = useConfigurator.getState()
    if (s.modelId === CUSTOM_ID) return // uploaded models can't be linked; leave the URL alone
    const next = `${window.location.pathname}${serialize(s) ? `?${serialize(s)}` : ''}${window.location.hash}`
    try {
      window.history.replaceState(null, '', next)
    } catch {
      // Some sandboxed contexts forbid history writes. The copy-link button still works.
    }
  }
  return useConfigurator.subscribe(() => {
    clearTimeout(timer)
    timer = setTimeout(write, DEBOUNCE_MS)
  })
}
