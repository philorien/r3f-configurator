export type Part = {
  id: string
  label: string
  /** Matched against the mesh name from the glTF node. */
  match: RegExp
}

export type Hotspot = {
  id: string
  label: string
  text: string
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
}

const base = import.meta.env.BASE_URL

export const MODELS: ModelDef[] = [
  {
    id: 'shoe',
    name: 'Sneaker',
    url: `${base}models/MaterialsVariantsShoe.glb`,
    blurb: 'One mesh, three baked material sets switched through KHR_materials_variants.',
    credit: 'MaterialsVariantsShoe, Khronos glTF Sample Assets (CC-BY 4.0, Eric Chadwick / Wayfair)',
    variants: ['Midnight', 'Beach', 'Street'],
    parts: [{ id: 'shoe', label: 'Whole shoe', match: /./ }],
    hotspots: [
      { id: 'toe', label: 'Toe box', text: 'Reinforced toe cap.', at: [0.9, 0.35, 0.5] },
      { id: 'sole', label: 'Sole', text: 'Textured outsole for grip.', at: [0.5, 0.05, 0.5] },
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
      { id: 'fabric', label: 'Fabric', match: /fabric/i },
      { id: 'wood', label: 'Wood', match: /wood/i },
      { id: 'metal', label: 'Metal', match: /metal/i },
      { id: 'label', label: 'Label', match: /label/i },
    ],
    hotspots: [
      { id: 'seat', label: 'Seat', text: 'Velvet with a sheen layer.', at: [0.5, 0.45, 0.5] },
      { id: 'legs', label: 'Legs', text: 'Solid wood legs.', at: [0.72, 0.2, 0.72] },
    ],
  },
]

export const getModel = (id: string): ModelDef => MODELS.find((m) => m.id === id) ?? MODELS[0]

export const partKey = (modelId: string, partId: string) => `${modelId}:${partId}`
