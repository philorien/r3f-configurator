import { describe, expect, it } from 'vitest'
import { derivePartGroups, MAX_PARTS, type MeshInfo } from './parts'

const meshes = (n: number, material = (i: number) => `mat-${i}`): MeshInfo[] =>
  Array.from({ length: n }, (_, i) => ({ mesh: `Mesh_${i}`, material: material(i) }))

describe('derivePartGroups', () => {
  it('uses one part per distinct mesh name for small models', () => {
    const items = [
      { mesh: 'Body', material: 'paint' },
      { mesh: 'Wheel', material: 'rubber' },
      { mesh: 'Wheel', material: 'rubber' },
    ]
    const { parts, idFor } = derivePartGroups(items)
    expect(parts.map((p) => p.label)).toEqual(['Body', 'Wheel'])
    expect(idFor(items[1])).toBe(idFor(items[2]))
    expect(idFor(items[0])).not.toBe(idFor(items[1]))
  })

  it('names unnamed meshes and keeps ids unique when slugs collide', () => {
    const items = [
      { mesh: '', material: 'a' },
      { mesh: 'Leg L', material: 'a' },
      { mesh: 'Leg-L', material: 'a' },
    ]
    const { parts } = derivePartGroups(items)
    expect(parts[0].label).toBe('Mesh 1')
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length)
  })

  it('groups by material when there are too many meshes', () => {
    const items = meshes(100, (i) => `mat-${i % 3}`)
    const { parts, idFor } = derivePartGroups(items)
    expect(parts.map((p) => p.label)).toEqual(['mat-0', 'mat-1', 'mat-2'])
    expect(idFor(items[0])).toBe(idFor(items[3]))
  })

  it('folds the long tail into Other so the list stays bounded', () => {
    const items = meshes(200)
    const { parts, idFor } = derivePartGroups(items)
    expect(parts).toHaveLength(MAX_PARTS)
    expect(parts.at(-1)).toEqual({ id: 'other', label: 'Other' })
    expect(idFor(items[199])).toBe('other')
    expect(parts.some((p) => p.id === idFor(items[0]))).toBe(true)
  })

  it('handles an empty model', () => {
    expect(derivePartGroups([]).parts).toEqual([])
  })
})
