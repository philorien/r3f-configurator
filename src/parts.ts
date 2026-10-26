export type PartInfo = { id: string; label: string }

export type MeshInfo = { mesh: string; material: string }

export const MAX_PARTS = 24

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'part'

/**
 * Turn an arbitrary uploaded model's meshes into a short list of editable parts.
 * Group by mesh name when that gives a usable list, otherwise by material name,
 * and fold the long tail into "Other" so the panel never becomes a wall of radios.
 */
export function derivePartGroups(items: MeshInfo[]): { parts: PartInfo[]; idFor: (item: MeshInfo) => string } {
  const names = items.map((it, i) => it.mesh.trim() || `Mesh ${i + 1}`)
  const byMesh = new Set(names).size <= MAX_PARTS
  const labels = byMesh ? names : items.map((it) => it.material.trim() || 'Material')

  const unique = [...new Set(labels)]
  const kept = unique.length <= MAX_PARTS ? unique : unique.slice(0, MAX_PARTS - 1)
  const hasOther = kept.length < unique.length

  const parts: PartInfo[] = []
  const idByLabel = new Map<string, string>()
  for (const label of kept) {
    let id = slug(label)
    let n = 2
    while (parts.some((p) => p.id === id)) id = `${slug(label)}-${n++}`
    parts.push({ id, label })
    idByLabel.set(label, id)
  }
  if (hasOther) parts.push({ id: 'other', label: 'Other' })

  const lookup = new Map(items.map((it, i) => [it, labels[i]]))
  return {
    parts,
    idFor: (item) => idByLabel.get(lookup.get(item) ?? '') ?? 'other',
  }
}
