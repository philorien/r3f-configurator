import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { GLTF } from 'three-stdlib'
import { hotspotAnchors } from '../hotspotLayer'
import { MODELS, partKey, type ModelDef, type Part } from '../models'
import { derivePartGroups } from '../parts'
import { reducedMotion, selectModel, useConfigurator } from '../store'

MODELS.forEach((m) => useGLTF.preload(m.url))

// Drop the cached GLTF of an uploaded model once it has been replaced or removed.
useConfigurator.subscribe((state, prev) => {
  if (prev.custom && prev.custom.url !== state.custom?.url) useGLTF.clear(prev.custom.url)
})

const TARGET_SIZE = 1.6

type Slot = {
  mesh: THREE.Mesh
  partId: string
  /** One material per KHR_materials_variants entry (or a single entry). All are private clones. */
  materials: THREE.MeshStandardMaterial[]
  explodeDir: THREE.Vector3
  basePosition: THREE.Vector3
}

type VariantMapping = { material: number; variants: number[] }

/**
 * GLTFLoader doesn't implement KHR_materials_variants, so read the mapping from the raw JSON.
 * parser.associations links each Mesh back to its glTF mesh/primitive index.
 */
function tagPrimitives(gltf: GLTF) {
  if (gltf.scene.userData.tagged) return
  gltf.scene.traverse((o) => {
    // GLTFReference's typings omit `primitives`, which the loader does set.
    const ref = gltf.parser.associations.get(o) as { meshes?: number; primitives?: number } | undefined
    if (ref?.meshes !== undefined) o.userData.prim = { mesh: ref.meshes, primitive: ref.primitives ?? 0 }
  })
  gltf.scene.userData.tagged = true
}

const asStandard = (m: THREE.Material) => m.clone() as THREE.MeshStandardMaterial

type Built = { slots: Slot[]; parts: Part[]; variants: string[] }

async function buildSlots(gltf: GLTF, root: THREE.Object3D, def: ModelDef): Promise<Built> {
  const json = gltf.parser.json as {
    extensions?: { KHR_materials_variants?: { variants: { name?: string }[] } }
    meshes: { primitives: { extensions?: { KHR_materials_variants?: { mappings: VariantMapping[] } } }[] }[]
  }
  root.updateMatrixWorld(true)
  const overall = new THREE.Box3().setFromObject(root)
  const center = overall.getCenter(new THREE.Vector3())
  const span = overall.getSize(new THREE.Vector3()).length()

  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })

  const materialOf = (mesh: THREE.Mesh) => (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)

  // Bundled models declare their parts and variants. Uploaded ones are discovered from the file.
  const variants = def.custom
    ? (json.extensions?.KHR_materials_variants?.variants ?? []).map((v, i) => v.name || `Variant ${i + 1}`)
    : def.variants
  let parts = def.parts
  let partIdFor = (mesh: THREE.Mesh) => (def.parts.find((p) => p.match(mesh)) ?? def.parts[0]).id
  if (def.custom) {
    const infos = meshes.map((m) => ({ mesh: m.name, material: materialOf(m).name }))
    const groups = derivePartGroups(infos)
    parts = groups.parts.map((p) => ({ ...p, match: () => false }))
    partIdFor = (mesh) => groups.idFor(infos[meshes.indexOf(mesh)])
  }

  const slots = await Promise.all(
    meshes.map(async (mesh) => {
      const fallback = asStandard(materialOf(mesh))
      const materials = Array.from({ length: Math.max(1, variants.length) }, () => fallback.clone())

      const prim = mesh.userData.prim as { mesh: number; primitive: number } | undefined
      const mappings = prim
        ? (json.meshes[prim.mesh]?.primitives[prim.primitive]?.extensions?.KHR_materials_variants?.mappings ?? [])
        : []
      for (const mapping of mappings) {
        const source = (await gltf.parser.getDependency('material', mapping.material)) as THREE.Material
        for (const v of mapping.variants) if (v < materials.length) materials[v] = asStandard(source)
      }

      // Direction to push this part away from the model's center when exploding.
      const partCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
      const dir = partCenter.sub(center)
      if (dir.length() < span * 0.04) dir.set(0, span * 0.18, 0)
      else dir.y *= 1.5

      return { mesh, partId: partIdFor(mesh), materials, explodeDir: dir, basePosition: mesh.position.clone() }
    }),
  )
  return { slots, parts, variants }
}

export function Model() {
  const def = useConfigurator(selectModel)
  const gltf = useGLTF(def.url)

  const { root, scale, offset } = useMemo(() => {
    tagPrimitives(gltf)
    const clone = gltf.scene.clone(true)
    clone.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const s = TARGET_SIZE / Math.max(size.x, size.y, size.z)
    const c = box.getCenter(new THREE.Vector3())
    return {
      root: clone,
      scale: s,
      offset: new THREE.Vector3(-c.x * s, -box.min.y * s, -c.z * s),
    }
  }, [gltf])

  // Read the latest def inside the effect below without re-running it when only parts/variants change.
  const defRef = useRef(def)
  useEffect(() => {
    defRef.current = def
  })

  const [slots, setSlots] = useState<Slot[]>([])
  useEffect(() => {
    let cancelled = false
    const current = defRef.current
    buildSlots(gltf, root, current).then(({ slots: built, parts, variants }) => {
      if (cancelled) return
      setSlots(built)
      const { setPartBase, setCustomMeta } = useConfigurator.getState()
      if (current.custom) setCustomMeta(parts, variants)
      for (const slot of built) {
        const m = slot.materials[0]
        slot.materials.forEach((mat) => {
          mat.userData.base = { color: mat.color.clone(), roughness: mat.roughness, metalness: mat.metalness }
        })
        setPartBase(partKey(current.id, slot.partId), { roughness: m.roughness, metalness: m.metalness })
      }
    })
    return () => {
      cancelled = true
    }
  }, [gltf, root, def.id, def.url])

  const variant = useConfigurator((s) => s.variant)
  const overrides = useConfigurator((s) => s.overrides)
  const wireframe = useConfigurator((s) => s.wireframe)
  const explode = useConfigurator((s) => s.explode)
  const activePart = useConfigurator((s) => s.activePart)

  // Apply variant + per-part overrides. Runs over every variant's material so switching is instant.
  useEffect(() => {
    for (const slot of slots) {
      const o = overrides[partKey(def.id, slot.partId)]
      slot.mesh.material = slot.materials[Math.min(variant, slot.materials.length - 1)]
      slot.mesh.visible = !o?.hidden
      for (const mat of slot.materials) {
        const base = mat.userData.base as { color: THREE.Color; roughness: number; metalness: number }
        if (o?.color) mat.color.set(o.color)
        else mat.color.copy(base.color)
        mat.roughness = o?.roughness ?? base.roughness
        mat.metalness = o?.metalness ?? base.metalness
        mat.wireframe = wireframe
      }
    }
  }, [slots, variant, overrides, wireframe, def])

  // Explode view: ease each mesh along its precomputed direction.
  const eased = useRef(0)
  useFrame((_, delta) => {
    eased.current = reducedMotion() ? explode : THREE.MathUtils.damp(eased.current, explode, 8, delta)
    for (const slot of slots) {
      slot.mesh.position.copy(slot.basePosition).addScaledVector(slot.explodeDir, eased.current)
    }
  })

  // Brief emissive pulse so the user can see which part they just selected.
  const pulse = useRef(0)
  useEffect(() => {
    pulse.current = reducedMotion() ? 0 : 1
  }, [activePart, def.id])
  useFrame((_, delta) => {
    if (!slots.length) return
    pulse.current = Math.max(0, pulse.current - delta * 1.8)
    for (const slot of slots) {
      const on = slot.partId === activePart && slots.some((s) => s.partId !== activePart)
      for (const mat of slot.materials) {
        mat.emissive.set('#ffffff')
        mat.emissiveIntensity = on ? pulse.current * 0.3 : 0
      }
    }
  })

  const partAt = (object: THREE.Object3D) => slots.find((s) => s.mesh === object)?.partId

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return // that was a drag, not a click
    const part = partAt(e.object)
    if (!part) return
    e.stopPropagation()
    useConfigurator.getState().setActivePart(part)
  }

  // Publish where each hotspot sits in world space for the viewer's screen-space tracker.
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    for (const h of def.hotspots) {
      const local = new THREE.Vector3(
        box.min.x + size.x * h.at[0],
        box.min.y + size.y * h.at[1],
        box.min.z + size.z * h.at[2],
      )
      const world = local.multiplyScalar(scale).add(offset)
      hotspotAnchors.set(h.id, [world.x, world.y, world.z])
    }
    return () => hotspotAnchors.clear()
  }, [root, scale, offset, def.hotspots])

  return (
    <group position={offset} scale={scale}>
      <primitive
        object={root}
        onClick={onClick}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          if (partAt(e.object)) document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      />
    </group>
  )
}
