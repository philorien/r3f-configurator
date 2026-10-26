import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { GLTF } from 'three-stdlib'
import { getModel, MODELS, partKey, type ModelDef } from '../models'
import { useConfigurator } from '../store'

MODELS.forEach((m) => useGLTF.preload(m.url))

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

async function buildSlots(gltf: GLTF, root: THREE.Object3D, def: ModelDef): Promise<Slot[]> {
  const json = gltf.parser.json as {
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

  return Promise.all(
    meshes.map(async (mesh) => {
      const part = def.parts.find((p) => p.match.test(mesh.name)) ?? def.parts[0]
      const fallback = asStandard(mesh.material as THREE.Material)
      const materials = Array.from({ length: def.variants.length }, () => fallback.clone())

      const prim = mesh.userData.prim as { mesh: number; primitive: number } | undefined
      const mappings = prim
        ? (json.meshes[prim.mesh]?.primitives[prim.primitive]?.extensions?.KHR_materials_variants?.mappings ?? [])
        : []
      for (const mapping of mappings) {
        const source = (await gltf.parser.getDependency('material', mapping.material)) as THREE.Material
        for (const v of mapping.variants) materials[v] = asStandard(source)
      }

      // Direction to push this part away from the model's center when exploding.
      const partCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
      const dir = partCenter.sub(center)
      if (dir.length() < span * 0.04) dir.set(0, span * 0.18, 0)
      else dir.y *= 1.5

      return { mesh, partId: part.id, materials, explodeDir: dir, basePosition: mesh.position.clone() }
    }),
  )
}

export function Model({ modelId }: { modelId: string }) {
  const def = getModel(modelId)
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

  const [slots, setSlots] = useState<Slot[]>([])
  useEffect(() => {
    let cancelled = false
    buildSlots(gltf, root, def).then((built) => {
      if (cancelled) return
      setSlots(built)
      const { setPartBase } = useConfigurator.getState()
      for (const slot of built) {
        const m = slot.materials[0]
        slot.materials.forEach((mat) => {
          mat.userData.base = { color: mat.color.clone(), roughness: mat.roughness, metalness: mat.metalness }
        })
        setPartBase(partKey(def.id, slot.partId), { roughness: m.roughness, metalness: m.metalness })
      }
    })
    return () => {
      cancelled = true
    }
  }, [gltf, root, def])

  const variant = useConfigurator((s) => s.variant)
  const overrides = useConfigurator((s) => s.overrides)
  const wireframe = useConfigurator((s) => s.wireframe)
  const explode = useConfigurator((s) => s.explode)
  const activePart = useConfigurator((s) => s.activePart)
  const showHotspots = useConfigurator((s) => s.hotspots)

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
    eased.current = THREE.MathUtils.damp(eased.current, explode, 8, delta)
    for (const slot of slots) {
      slot.mesh.position.copy(slot.basePosition).addScaledVector(slot.explodeDir, eased.current)
    }
  })

  // Brief emissive pulse so the user can see which part they just selected.
  const pulse = useRef(0)
  useEffect(() => {
    pulse.current = 1
  }, [activePart, modelId])
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

  const bounds = useMemo(() => new THREE.Box3().setFromObject(root), [root])

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
      {showHotspots &&
        def.hotspots.map((h) => {
          const size = bounds.getSize(new THREE.Vector3())
          const pos = new THREE.Vector3(
            bounds.min.x + size.x * h.at[0],
            bounds.min.y + size.y * h.at[1],
            bounds.min.z + size.z * h.at[2],
          )
          return (
            <Html key={h.id} position={pos} zIndexRange={[10, 0]} center>
              <HotspotButton label={h.label} text={h.text} />
            </Html>
          )
        })}
    </group>
  )
}

function HotspotButton({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="hotspot">
      <button
        type="button"
        className="hotspot-dot"
        aria-expanded={open}
        aria-label={`${label}: ${open ? 'hide' : 'show'} details`}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        +
      </button>
      {open && (
        <div className="hotspot-card" role="status">
          <strong>{label}</strong>
          <span>{text}</span>
        </div>
      )}
    </div>
  )
}
