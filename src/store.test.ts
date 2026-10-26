import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConfigurator } from './store'

const initial = useConfigurator.getState()

beforeEach(() => {
  useConfigurator.setState(initial, true)
})

describe('configurator store', () => {
  it('switching variant drops color tints but keeps finish overrides', () => {
    const s = useConfigurator.getState()
    s.setModel('chair')
    s.patchPart('fabric', { color: '#ff0000', roughness: 0.2 })
    s.setVariant(1)
    const o = useConfigurator.getState().overrides['chair:fabric']
    expect(o.color).toBeUndefined()
    expect(o.roughness).toBe(0.2)
    expect(useConfigurator.getState().variant).toBe(1)
  })

  it('switching model resets variant, selected part and explode', () => {
    const s = useConfigurator.getState()
    s.setModel('chair')
    s.setVariant(1)
    s.setActivePart('wood')
    s.set({ explode: 0.7 })
    s.setModel('shoe')
    const next = useConfigurator.getState()
    expect(next).toMatchObject({ modelId: 'shoe', variant: 0, activePart: 'shoe', explode: 0 })
  })

  it('reset model clears only the current model\'s overrides', () => {
    const s = useConfigurator.getState()
    s.setModel('shoe')
    s.patchPart('shoe', { color: '#00ff00' })
    s.setModel('chair')
    s.patchPart('fabric', { color: '#ff0000' })
    s.resetModel()
    const { overrides } = useConfigurator.getState()
    expect(overrides['chair:fabric']).toBeUndefined()
    expect(overrides['shoe:shoe']).toEqual({ color: '#00ff00' })
  })

  it('announces changes for screen readers', () => {
    const s = useConfigurator.getState()
    s.setModel('chair')
    s.setVariant(1)
    expect(useConfigurator.getState().announcement).toBe('Variant: Peacock Velvet')
    s.setActivePart('wood')
    expect(useConfigurator.getState().announcement).toBe('Selected part: Wood')
  })

  it('ignores setModel for an unknown or missing custom model', () => {
    useConfigurator.getState().setModel('custom')
    expect(useConfigurator.getState().modelId).toBe('shoe')
  })

  it('removing an uploaded model falls back to a bundled one', () => {
    const revoke = vi.fn()
    vi.stubGlobal('URL', { ...URL, revokeObjectURL: revoke })
    const s = useConfigurator.getState()
    s.setCustom({ id: 'custom', name: 'mine', url: 'blob:x', blurb: '', credit: '', variants: [], parts: [], hotspots: [], custom: true })
    expect(useConfigurator.getState().modelId).toBe('custom')
    s.clearCustom('gone')
    expect(useConfigurator.getState()).toMatchObject({ modelId: 'shoe', custom: null, uploadError: 'gone' })
    expect(revoke).toHaveBeenCalledWith('blob:x')
    vi.unstubAllGlobals()
  })
})

describe('URL hydration', () => {
  it('opens a shared link with its configuration applied', async () => {
    window.history.replaceState(null, '', '/?m=chair&v=1&p=wood&env=dawn&o.fabric=c:1d3557')
    vi.resetModules()
    const { useConfigurator: fresh } = await import('./store')
    expect(fresh.getState()).toMatchObject({
      modelId: 'chair',
      variant: 1,
      activePart: 'wood',
      env: 'dawn',
      overrides: { 'chair:fabric': { color: '#1d3557' } },
    })
    window.history.replaceState(null, '', '/')
  })
})
