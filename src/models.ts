import type { Mesh } from 'three'

export type Part = {
  id: string
  label: string
  /** Decides whether a mesh belongs to this part. */
  match: (mesh: Mesh) => boolean
}

export type Hotspot = {
  id: string
  label: string
  text: string
  /** The part this annotation points at; it is hidden along with that part. */
  part: string
  /** Position as a 0..1 fraction of the model's bounding box (x, y, z). */
  at: [number, number, number]
}

export type ModelDef = {
  id: string
  name: string
  url: string
  blurb: string
  credit: string
  /** Order matches the KHR_materials_variants array in the file. */
  variants: string[]
  parts: Part[]
  hotspots: Hotspot[]
  /** True for a file the user uploaded: parts and variants are discovered after it loads. */
  custom?: boolean
  /** Built from code instead of loaded from a file, so `url` is empty. */
  procedural?: 'bolt'
}

const base = import.meta.env.BASE_URL

const byName = (re: RegExp) => (mesh: Mesh) => re.test(mesh.name)

export const MODELS: ModelDef[] = [
  {
    id: 'shoe',
    name: 'Sneaker',
    url: `${base}models/MaterialsVariantsShoe.glb`,
    blurb: 'One mesh, three baked material sets switched through KHR_materials_variants.',
    credit: 'MaterialsVariantsShoe, Khronos glTF Sample Assets (CC-BY 4.0, Eric Chadwick / Wayfair)',
    variants: ['Midnight', 'Beach', 'Street'],
    parts: [{ id: 'shoe', label: 'Whole shoe', match: () => true }],
    hotspots: [
      { id: 'toe', label: 'Toe box', text: 'Reinforced toe cap.', part: 'shoe', at: [0.9, 0.35, 0.5] },
      { id: 'sole', label: 'Sole', text: 'Textured outsole for grip.', part: 'shoe', at: [0.5, 0.05, 0.5] },
    ],
  },
  {
    id: 'chair',
    name: 'Velvet chair',
    url: `${base}models/SheenChair.glb`,
    blurb: 'Four meshes with sheen shading. Recolor, hide, or explode each part.',
    credit: 'SheenChair, Khronos glTF Sample Assets (CC-BY 4.0, Wayfair)',
    variants: ['Mango Velvet', 'Peacock Velvet'],
    parts: [
      { id: 'fabric', label: 'Fabric', match: byName(/fabric/i) },
      { id: 'wood', label: 'Wood', match: byName(/wood/i) },
      { id: 'metal', label: 'Metal', match: byName(/metal/i) },
      { id: 'label', label: 'Label', match: byName(/label/i) },
    ],
    hotspots: [
      { id: 'seat', label: 'Seat', text: 'Velvet with a sheen layer.', part: 'fabric', at: [0.5, 0.45, 0.5] },
      { id: 'legs', label: 'Legs', text: 'Solid wood legs.', part: 'wood', at: [0.72, 0.2, 0.72] },
    ],
  },
  {
    id: 'bolt',
    name: 'Bolt',
    url: '',
    procedural: 'bolt',
    blurb: 'A metric hex cap screw built from code. Set the size, length and thread pitch.',
    credit: '',
    variants: [],
    // Meshes are tagged with these ids by the Bolt component, so match is unused.
    parts: [
      { id: 'head', label: 'Head', match: () => false },
      { id: 'shank', label: 'Shank', match: () => false },
      { id: 'thread', label: 'Thread', match: () => false },
    ],
    hotspots: [],
  },
]

export const CUSTOM_ID = 'custom'

export const getBundledModel = (id: string): ModelDef | undefined => MODELS.find((m) => m.id === id)

export const partKey = (modelId: string, partId: string) => `${modelId}:${partId}`
