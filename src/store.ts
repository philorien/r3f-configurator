import { create } from 'zustand'
import { getModel, MODELS, partKey } from './models'

export type EnvPreset = 'studio' | 'sunset' | 'city' | 'dawn' | 'forest'
export const ENV_PRESETS: EnvPreset[] = ['studio', 'sunset', 'city', 'dawn', 'forest']

export type PartOverride = {
  color?: string
  roughness?: number
  metalness?: number
  hidden?: boolean
}

export type Finish = { roughness: number; metalness: number }

type State = {
  modelId: string
  variant: number
  activePart: string
  overrides: Record<string, PartOverride>
  /** Original roughness/metalness per part, published by the model once loaded. */
  partBase: Record<string, Finish>
  explode: number
  env: EnvPreset
  autoRotate: boolean
  wireframe: boolean
  hotspots: boolean
  /** Bumped to ask the camera rig to return to its starting pose. */
  resetViewNonce: number

  setModel: (id: string) => void
  setVariant: (index: number) => void
  setActivePart: (partId: string) => void
  patchPart: (partId: string, patch: PartOverride) => void
  clearFinish: (partId: string) => void
  setPartBase: (key: string, finish: Finish) => void
  resetModel: () => void
  resetView: () => void
  set: (patch: Partial<Pick<State, 'explode' | 'env' | 'autoRotate' | 'wireframe' | 'hotspots'>>) => void
}

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const withoutModel = (overrides: Record<string, PartOverride>, modelId: string) =>
  Object.fromEntries(Object.entries(overrides).filter(([k]) => !k.startsWith(`${modelId}:`)))

export const useConfigurator = create<State>()((set, get) => ({
  modelId: MODELS[0].id,
  variant: 0,
  activePart: MODELS[0].parts[0].id,
  overrides: {},
  partBase: {},
  explode: 0,
  env: 'studio',
  autoRotate: !prefersReducedMotion,
  wireframe: false,
  hotspots: true,
  resetViewNonce: 0,

  setModel: (id) =>
    set((s) => ({
      modelId: id,
      variant: 0,
      activePart: getModel(id).parts[0].id,
      explode: 0,
      resetViewNonce: s.resetViewNonce + 1,
    })),

  // A variant is a different base look, so drop color tints that would mask it.
  setVariant: (index) =>
    set((s) => {
      const model = getModel(s.modelId)
      const overrides = { ...s.overrides }
      for (const part of model.parts) {
        const key = partKey(model.id, part.id)
        if (overrides[key]) overrides[key] = { ...overrides[key], color: undefined }
      }
      return { variant: index, overrides }
    }),

  setActivePart: (partId) => set({ activePart: partId }),

  patchPart: (partId, patch) =>
    set((s) => {
      const key = partKey(s.modelId, partId)
      return { overrides: { ...s.overrides, [key]: { ...s.overrides[key], ...patch } } }
    }),

  clearFinish: (partId) =>
    set((s) => {
      const key = partKey(s.modelId, partId)
      return {
        overrides: {
          ...s.overrides,
          [key]: { ...s.overrides[key], roughness: undefined, metalness: undefined },
        },
      }
    }),

  setPartBase: (key, finish) => set((s) => ({ partBase: { ...s.partBase, [key]: finish } })),

  resetModel: () =>
    set((s) => ({
      overrides: withoutModel(s.overrides, s.modelId),
      variant: 0,
      explode: 0,
      wireframe: false,
      activePart: get().activePart,
    })),

  resetView: () => set((s) => ({ resetViewNonce: s.resetViewNonce + 1 })),

  set: (patch) => set(patch),
}))
