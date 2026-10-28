import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { boltSpan, buildRidgeGeometry, headCorners, sizeInfo, threadLength, threadProfile, type BoltParams } from '../bolt'
import { partKey } from '../models'
import { reducedMotion, useConfigurator } from '../store'

const TARGET_SIZE = 2.2
const PARTS = ['head', 'shank', 'thread'] as const
type PartId = (typeof PARTS)[number]

/** Zinc-plated steel until the user picks something else. */
const BASE = { color: '#b9bec5', roughness: 0.38, metalness: 0.9 }

const SEGMENTS = 64

/** Cut plane through the axis. The camera starts on +z, so the +z half goes and the cut face points at it. */
const CUT = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
const CAP_COLOR = '#d98c3f'

/**
 * Stencil capping: with the clipped solid drawn twice (back faces count up, front faces count down),
 * any pixel left non-zero is looking into the solid, so the cap plane is drawn only there.
 */
function stencilMaterial(side: THREE.Side, op: THREE.StencilOp) {
  return new THREE.MeshBasicMaterial({
    side,
    clippingPlanes: [CUT],
    depthWrite: false,
    depthTest: false,
    colorWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: op,
    stencilZFail: op,
    stencilZPass: op,
  })
}

/**
 * A hex cap screw standing on its axis, tip at y = 0 and head on top, in millimetres.
 * The thread is the core cylinder plus a swept helical ridge; both belong to the "thread" part.
 */
function buildParts(b: BoltParams) {
  const { k } = sizeInfo(b.size)
  const d = b.size
  const lt = threadLength(b)
  const { minor, depth } = threadProfile(b.size, b.pitch)

  // Lathe profile for the core: a chamfered tip, then straight up to the end of the thread.
  const tip = Math.min(depth * 1.2, lt)
  const coreR = minor + depth * 0.03 // a hair proud of the ridge base so the two never leave a gap
  const core = new THREE.LatheGeometry(
    [new THREE.Vector2(0, 0), new THREE.Vector2(coreR - tip * 0.9, 0), new THREE.Vector2(coreR, tip), new THREE.Vector2(coreR, lt), new THREE.Vector2(0, lt)],
    SEGMENTS,
  )

  const shankLength = b.length - lt
  const shank = shankLength > 1e-6 ? new THREE.CylinderGeometry(d / 2, d / 2, shankLength, SEGMENTS) : null
  shank?.translate(0, lt + shankLength / 2, 0)

  const corner = headCorners(b.size) / 2
  const head = new THREE.CylinderGeometry(corner, corner, k, 6)
  head.translate(0, b.length + k / 2, 0)

  return { head, shank, core, ridge: buildRidgeGeometry(b) }
}

export function Bolt() {
  const bolt = useConfigurator((s) => s.bolt)
  const overrides = useConfigurator((s) => s.overrides)
  const wireframe = useConfigurator((s) => s.wireframe)
  const explode = useConfigurator((s) => s.explode)
  const activePart = useConfigurator((s) => s.activePart)

  const section = useConfigurator((s) => s.section)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.localClippingEnabled = section
    return () => {
      gl.localClippingEnabled = false
    }
  }, [gl, section])

  const cut = useMemo(
    () => ({
      back: stencilMaterial(THREE.BackSide, THREE.IncrementWrapStencilOp),
      front: stencilMaterial(THREE.FrontSide, THREE.DecrementWrapStencilOp),
      cap: new THREE.MeshStandardMaterial({
        color: CAP_COLOR,
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      }),
    }),
    [],
  )
  useEffect(() => () => Object.values(cut).forEach((m) => m.dispose()), [cut])

  const geo = useMemo(() => buildParts(bolt), [bolt])
  useEffect(
    () => () => {
      geo.head.dispose()
      geo.shank?.dispose()
      geo.core.dispose()
      geo.ridge.dispose()
    },
    [geo],
  )

  const mats = useMemo(
    () =>
      Object.fromEntries(
        PARTS.map((id) => [id, new THREE.MeshStandardMaterial({ ...BASE, color: new THREE.Color(BASE.color) })]),
      ) as Record<PartId, THREE.MeshStandardMaterial>,
    [],
  )
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  // Tell the panel what the sliders should read before the user touches them.
  useEffect(() => {
    const { setPartBase } = useConfigurator.getState()
    for (const id of PARTS) setPartBase(partKey('bolt', id), { roughness: BASE.roughness, metalness: BASE.metalness })
  }, [])

  useEffect(() => {
    for (const id of PARTS) {
      const o = overrides[partKey('bolt', id)]
      const m = mats[id]
      m.color.set(o?.color ?? BASE.color)
      m.roughness = o?.roughness ?? BASE.roughness
      m.metalness = o?.metalness ?? BASE.metalness
      m.wireframe = wireframe
      m.clippingPlanes = section ? [CUT] : []
      m.needsUpdate = true
    }
  }, [mats, overrides, wireframe, section])

  // Explode along the axis: head up, thread down, shank stays put between them.
  const groups = { head: useRef<THREE.Group>(null), shank: useRef<THREE.Group>(null), thread: useRef<THREE.Group>(null) }
  const eased = useRef(0)
  const span = boltSpan(bolt)
  useFrame((_, delta) => {
    eased.current = reducedMotion() ? explode : THREE.MathUtils.damp(eased.current, explode, 8, delta)
    const gap = eased.current * span * 0.3
    if (groups.head.current) groups.head.current.position.y = gap
    if (groups.thread.current) groups.thread.current.position.y = -gap
  })

  // Brief emissive pulse on the selected part, same as the file-based models.
  const pulse = useRef(0)
  useEffect(() => {
    pulse.current = reducedMotion() ? 0 : 1
  }, [activePart])
  useFrame((_, delta) => {
    pulse.current = Math.max(0, pulse.current - delta * 1.8)
    for (const id of PARTS) {
      mats[id].emissive.set('#ffffff')
      mats[id].emissiveIntensity = id === activePart ? pulse.current * 0.3 : 0
    }
  })

  const select = (id: PartId) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return // that was a drag, not a click
    e.stopPropagation()
    useConfigurator.getState().setActivePart(id)
  }
  const hover = {
    onPointerOver: () => {
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      document.body.style.cursor = ''
    },
  }
  const noRaycast = () => null
  // Two invisible passes per solid that feed the stencil buffer. Only mounted while sectioning.
  const stencilPair = (g: THREE.BufferGeometry) =>
    section && (
      <>
        <mesh geometry={g} material={cut.back} renderOrder={1} raycast={noRaycast} />
        <mesh geometry={g} material={cut.front} renderOrder={1} raycast={noRaycast} />
      </>
    )
  const hidden = (id: PartId) => overrides[partKey('bolt', id)]?.hidden === true

  // Lie the bolt on its side, centered, with a hex flat resting on the ground.
  const scale = TARGET_SIZE / Math.max(span, headCorners(bolt.size))
  const rest = sizeInfo(bolt.size).s / 2

  const bolt3d = (
    <group position={[(-span / 2) * scale, rest * scale, 0]} rotation={[0, 0, -Math.PI / 2]} scale={scale}>
      <group ref={groups.head} visible={!hidden('head')}>
        {stencilPair(geo.head)}
        <mesh geometry={geo.head} material={mats.head} renderOrder={6} onClick={select('head')} {...hover} />
      </group>
      <group ref={groups.shank} visible={!hidden('shank')}>
        {geo.shank && stencilPair(geo.shank)}
        {geo.shank && (
          <mesh geometry={geo.shank} material={mats.shank} renderOrder={6} onClick={select('shank')} {...hover} />
        )}
      </group>
      <group ref={groups.thread} visible={!hidden('thread')}>
        {stencilPair(geo.core)}
        {stencilPair(geo.ridge)}
        <mesh geometry={geo.core} material={mats.thread} renderOrder={6} onClick={select('thread')} {...hover} />
        <mesh geometry={geo.ridge} material={mats.thread} renderOrder={6} onClick={select('thread')} {...hover} />
      </group>
    </group>
  )

  return (
    <>
      {bolt3d}
      {section && (
        <mesh
          material={cut.cap}
          renderOrder={1.1}
          raycast={noRaycast}
          onAfterRender={(r) => r.clearStencil()}
        >
          <planeGeometry args={[8, 8]} />
        </mesh>
      )}
    </>
  )
}
