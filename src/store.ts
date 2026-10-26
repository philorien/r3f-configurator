import { create } from 'zustand'
import { ENV_PRESETS, type EnvPreset } from './env'
import { CUSTOM_ID, getBundledModel, MODELS, partKey, type ModelDef, type Part } from './models'
import { parse, type PartOverride } from './share'

export { ENV_PRESETS }
export type { EnvPreset, PartOverride }

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
  /** True while a hotspot is hovered or focused, so auto-rotate doesn't carry it out from under the pointer. */
  pauseRotate: boolean
  /** Bumped to ask the camera rig to return to its starting pose. */
  resetViewNonce: number
  /** The user's uploaded model, if any. Lives only in this browser tab. */
  custom: ModelDef | null
  uploadError: string | null
  /** Polite screen reader message, rendered in a live region. */
  announcement: string

  setModel: (id: string) => void
  setVariant: (index: number) => void
  setActivePart: (partId: string) => void
  patchPart: (partId: string, patch: PartOverride) => void
  clearFinish: (partId: string) => void
  setPartBase: (key: string, finish: Finish) => void
  resetModel: () => void
  resetView: () => void
  set: (patch: Partial<Pick<State, 'explode' | 'env' | 'autoRotate' | 'wireframe' | 'hotspots' | 'pauseRotate'>>) => void
  setCustom: (def: ModelDef) => void
  setCustomMeta: (parts: Part[], variants: string[]) => void
  clearCustom: (reason?: string) => void
  setUploadError: (message: string | null) => void
  announce: (message: string) => void
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

export const selectModel = (s: Pick<State, 'modelId' | 'custom'>): ModelDef =>
  (s.modelId === CUSTOM_ID ? s.custom : getBundledModel(s.modelId)) ?? MODELS[0]

const withoutModel = (overrides: Record<string, PartOverride>, modelId: string) =>
  Object.fromEntries(Object.entries(overrides).filter(([k]) => !k.startsWith(`${modelId}:`)))

const revoke = (def: ModelDef | null) => {
  if (def?.url.startsWith('blob:')) URL.revokeObjectURL(def.url)
}

/** Initial state, seeded from the page URL so shared links open the shared configuration. */
function initial() {
  const fromUrl = typeof window === 'undefined' ? {} : parse(window.location.search)
  const modelId = fromUrl.modelId ?? MODELS[0].id
  const model = getBundledModel(modelId) ?? MODELS[0]
  return {
    modelId,
    variant: fromUrl.variant ?? 0,
    activePart: fromUrl.activePart ?? model.parts[0].id,
    overrides: fromUrl.overrides ?? {},
    explode: fromUrl.explode ?? 0,
    env: fromUrl.env ?? ('studio' as EnvPreset),
  }
}

export const useConfigurator = create<State>()((set, get) => ({
  ...initial(),
  partBase: {},
  autoRotate: !reducedMotion(),
  wireframe: false,
  hotspots: true,
  pauseRotate: false,
  resetViewNonce: 0,
  custom: null,
  uploadError: null,
  announcement: '',

  setModel: (id) => {
    const model = id === CUSTOM_ID ? get().custom : getBundledModel(id)
    if (!model) return
    set((s) => ({
      modelId: id,
      variant: 0,
      activePart: model.parts[0]?.id ?? '',
      explode: 0,
      resetViewNonce: s.resetViewNonce + 1,
      announcement: `Showing ${model.name}`,
    }))
  },

  // A variant is a different base look, so drop color tints that would mask it.
  setVariant: (index) =>
    set((s) => {
      const model = selectModel(s)
      const overrides = { ...s.overrides }
      for (const part of model.parts) {
        const key = partKey(model.id, part.id)
        if (overrides[key]) overrides[key] = { ...overrides[key], color: undefined }
      }
      return { variant: index, overrides, announcement: `Variant: ${model.variants[index]}` }
    }),

  setActivePart: (partId) =>
    set((s) => {
      const part = selectModel(s).parts.find((p) => p.id === partId)
      return { activePart: partId, announcement: part ? `Selected part: ${part.label}` : s.announcement }
    }),

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
      announcement: 'Model reset',
    })),

  resetView: () => set((s) => ({ resetViewNonce: s.resetViewNonce + 1, announcement: 'View reset' })),

  set: (patch) => set(patch),

  setCustom: (def) => {
    revoke(get().custom)
    set((s) => ({
      custom: def,
      modelId: CUSTOM_ID,
      variant: 0,
      activePart: '',
      explode: 0,
      uploadError: null,
      overrides: withoutModel(s.overrides, CUSTOM_ID),
      partBase: Object.fromEntries(Object.entries(s.partBase).filter(([k]) => !k.startsWith(`${CUSTOM_ID}:`))),
      resetViewNonce: s.resetViewNonce + 1,
      announcement: `Loading ${def.name}`,
    }))
  },

  // Called by the viewer once it has read the uploaded file's meshes and variants.
  setCustomMeta: (parts, variants) =>
    set((s) => {
      if (!s.custom) return {}
      const custom = { ...s.custom, parts, variants }
      return {
        custom,
        activePart: parts[0]?.id ?? '',
        announcement: `${custom.name} loaded with ${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`,
      }
    }),

  clearCustom: (reason) => {
    revoke(get().custom)
    set((s) => ({
      custom: null,
      modelId: s.modelId === CUSTOM_ID ? MODELS[0].id : s.modelId,
      variant: s.modelId === CUSTOM_ID ? 0 : s.variant,
      activePart: s.modelId === CUSTOM_ID ? MODELS[0].parts[0].id : s.activePart,
      overrides: withoutModel(s.overrides, CUSTOM_ID),
      uploadError: reason ?? null,
      resetViewNonce: s.resetViewNonce + 1,
      announcement: reason ?? 'Uploaded model removed',
    }))
  },

  setUploadError: (message) => set({ uploadError: message, announcement: message ?? '' }),

  announce: (message) => set({ announcement: message }),
}))
