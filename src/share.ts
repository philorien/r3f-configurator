import { ENV_PRESETS, type EnvPreset } from './env'
import { getBundledModel, partKey } from './models'

export type PartOverride = {
  color?: string
  roughness?: number
  metalness?: number
  hidden?: boolean
}

/** The slice of configurator state that a link can carry. */
export type ShareState = {
  modelId: string
  variant: number
  activePart: string
  overrides: Record<string, PartOverride>
  explode: number
  env: EnvPreset
}

const HEX = /^[0-9a-f]{6}$/i
const round = (n: number) => String(Math.round(n * 100) / 100)
const unit = (raw: string) => {
  const n = Number(raw)
  return raw !== '' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined
}

/**
 * Encode a configuration as a query string, e.g.
 *   m=chair&v=1&p=wood&x=0.4&env=sunset&o.fabric=c:1d3557,r:0.3&o.wood=h:1
 * Only bundled models can be shared. An uploaded file only exists in the sender's browser.
 */
export function serialize(state: ShareState): string {
  const model = getBundledModel(state.modelId)
  if (!model) return ''

  const q = new URLSearchParams()
  q.set('m', model.id)
  if (state.variant > 0) q.set('v', String(state.variant))
  if (state.activePart !== model.parts[0].id) q.set('p', state.activePart)
  if (state.explode > 0) q.set('x', round(state.explode))
  if (state.env !== 'studio') q.set('env', state.env)

  for (const part of model.parts) {
    const o = state.overrides[partKey(model.id, part.id)]
    if (!o) continue
    const tokens: string[] = []
    if (o.color && HEX.test(o.color.replace('#', ''))) tokens.push(`c:${o.color.replace('#', '').toLowerCase()}`)
    if (o.roughness !== undefined) tokens.push(`r:${round(o.roughness)}`)
    if (o.metalness !== undefined) tokens.push(`m:${round(o.metalness)}`)
    if (o.hidden) tokens.push('h:1')
    if (tokens.length) q.set(`o.${part.id}`, tokens.join(','))
  }
  return q.toString().replaceAll('%3A', ':').replaceAll('%2C', ',')
}

/**
 * Decode a query string. Treats it as untrusted: anything unknown or out of range is dropped,
 * so a hand-edited or malicious link can only ever produce a valid configuration.
 */
export function parse(search: string): Partial<ShareState> {
  const q = new URLSearchParams(search)
  const model = getBundledModel(q.get('m') ?? '')
  if (!model) return {}

  const out: Partial<ShareState> = { modelId: model.id }

  const v = Number(q.get('v'))
  if (Number.isInteger(v) && v >= 0 && v < model.variants.length) out.variant = v

  const p = q.get('p')
  if (p && model.parts.some((part) => part.id === p)) out.activePart = p

  const x = unit(q.get('x') ?? '')
  if (x !== undefined) out.explode = model.parts.length > 1 ? x : 0

  const env = q.get('env')
  if (ENV_PRESETS.includes(env as EnvPreset)) out.env = env as EnvPreset

  const overrides: Record<string, PartOverride> = {}
  for (const part of model.parts) {
    const raw = q.get(`o.${part.id}`)
    if (!raw) continue
    const o: PartOverride = {}
    for (const token of raw.split(',')) {
      const i = token.indexOf(':')
      const key = token.slice(0, i)
      const value = token.slice(i + 1)
      if (key === 'c' && HEX.test(value)) o.color = `#${value.toLowerCase()}`
      else if (key === 'r') o.roughness = unit(value)
      else if (key === 'm') o.metalness = unit(value)
      else if (key === 'h' && value === '1') o.hidden = true
    }
    if (Object.values(o).some((val) => val !== undefined)) overrides[partKey(model.id, part.id)] = o
  }
  if (Object.keys(overrides).length) out.overrides = overrides

  return out
}
