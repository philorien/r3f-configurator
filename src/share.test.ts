import { describe, expect, it } from 'vitest'
import { parse, serialize, type ShareState } from './share'

const base: ShareState = {
  modelId: 'chair',
  variant: 0,
  activePart: 'fabric',
  overrides: {},
  explode: 0,
  env: 'studio',
}

describe('serialize', () => {
  it('omits default values', () => {
    expect(serialize(base)).toBe('m=chair')
  })

  it('encodes variant, part, explode, lighting and overrides', () => {
    const q = serialize({
      ...base,
      variant: 1,
      activePart: 'wood',
      explode: 0.4,
      env: 'sunset',
      overrides: {
        'chair:fabric': { color: '#1D3557', roughness: 0.3 },
        'chair:wood': { hidden: true },
      },
    })
    expect(q).toBe('m=chair&v=1&p=wood&x=0.4&env=sunset&o.fabric=c:1d3557,r:0.3&o.wood=h:1')
  })

  it('ignores overrides that belong to another model', () => {
    expect(serialize({ ...base, overrides: { 'shoe:shoe': { color: '#ff0000' } } })).toBe('m=chair')
  })

  it('returns nothing for an uploaded model, which only exists locally', () => {
    expect(serialize({ ...base, modelId: 'custom' })).toBe('')
  })
})

describe('parse', () => {
  it('round-trips a configuration', () => {
    const state: ShareState = {
      modelId: 'chair',
      variant: 1,
      activePart: 'metal',
      explode: 0.55,
      env: 'city',
      overrides: {
        'chair:fabric': { color: '#c1121f', roughness: 0.25, metalness: 0.1 },
        'chair:label': { hidden: true },
      },
    }
    expect(parse(serialize(state))).toEqual(state)
  })

  it('returns nothing without a known model', () => {
    expect(parse('')).toEqual({})
    expect(parse('m=toaster&v=1')).toEqual({})
    expect(parse('v=1')).toEqual({})
  })

  it('drops out-of-range and malformed values instead of trusting them', () => {
    const out = parse('m=chair&v=99&p=nope&x=abc&env=<script>&o.fabric=c:zzzzzz,r:oops')
    expect(out).toEqual({ modelId: 'chair' })
  })

  it('clamps numeric values into 0..1', () => {
    const out = parse('m=chair&x=7&o.fabric=r:-3,m:9')
    expect(out.explode).toBe(1)
    expect(out.overrides?.['chair:fabric']).toEqual({ roughness: 0, metalness: 1 })
  })

  it('ignores parts the model does not have', () => {
    expect(parse('m=shoe&o.fabric=c:ff0000').overrides).toBeUndefined()
  })

  it('does not explode a single-mesh model', () => {
    expect(parse('m=shoe&x=0.8').explode).toBe(0)
  })

  it('rejects non-integer variants', () => {
    expect(parse('m=chair&v=0.5').variant).toBeUndefined()
    expect(parse('m=chair&v=-1').variant).toBeUndefined()
  })
})

describe('bolt links', () => {
  it('round-trips the bolt dimensions', () => {
    const bolt = { size: 12, length: 60, pitch: 1.5, full: true }
    const q = serialize({ modelId: 'bolt', variant: 0, activePart: 'head', overrides: {}, explode: 0, env: 'studio', bolt })
    expect(q).toContain('bd=12')
    expect(parse(q).bolt).toEqual(bolt)
  })

  it('pulls hand-edited dimensions back into range', () => {
    const { bolt } = parse('m=bolt&bd=9&bl=9999&bp=99&bf=yes')
    expect(bolt).toEqual({ size: 8, length: 100, pitch: 2, full: false })
  })

  it('does not attach bolt state to other models', () => {
    expect(parse('m=chair&bd=12').bolt).toBeUndefined()
  })
})
