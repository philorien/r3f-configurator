import { Suspense, useEffect, useRef, useState, type ElementRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  PerformanceMonitor,
  useProgress,
} from '@react-three/drei'
import * as THREE from 'three'
import { capture } from '../capture'
import { hotspotAnchors, hotspotEls } from '../hotspotLayer'
import { reducedMotion, selectModel, useConfigurator } from '../store'
import { Model } from './Model'

const HOME_POSITION = new THREE.Vector3(3.4, 1.9, 4.6)
const HOME_TARGET = new THREE.Vector3(0, 0.6, 0)
const MIN_DISTANCE = 2.5
const MAX_DISTANCE = 9
const KEY_STEP = 0.12

/** Procedural studio lighting: no network request, so it works offline. */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={3} position={[0, 5, -6]} scale={[12, 4, 1]} />
      <Lightformer form="rect" intensity={2} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={1.5} position={[6, 1, 3]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
      <Lightformer form="ring" intensity={2} position={[0, 6, 4]} rotation-x={Math.PI / 2} scale={4} />
    </Environment>
  )
}

function Rig() {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const autoRotate = useConfigurator((s) => s.autoRotate && !s.pauseRotate)
  const resetNonce = useConfigurator((s) => s.resetViewNonce)

  // OrbitControls only maps arrow keys to panning (which we disable), so orbit and zoom by hand.
  // This makes the canvas usable without a mouse.
  useEffect(() => {
    const el = gl.domElement
    el.tabIndex = 0
    el.setAttribute('role', 'application')
    el.setAttribute('aria-label', '3D viewer. Arrow keys rotate, plus and minus zoom, Home resets the view.')

    const onKeyDown = (e: KeyboardEvent) => {
      const c = controls.current
      if (!c || e.altKey || e.ctrlKey || e.metaKey) return
      const offset = camera.position.clone().sub(c.target)
      const sph = new THREE.Spherical().setFromVector3(offset)
      switch (e.key) {
        case 'ArrowLeft':
          sph.theta -= KEY_STEP
          break
        case 'ArrowRight':
          sph.theta += KEY_STEP
          break
        case 'ArrowUp':
          sph.phi -= KEY_STEP
          break
        case 'ArrowDown':
          sph.phi += KEY_STEP
          break
        case '+':
        case '=':
          sph.radius *= 0.9
          break
        case '-':
        case '_':
          sph.radius /= 0.9
          break
        case 'Home':
          e.preventDefault()
          useConfigurator.getState().resetView()
          return
        default:
          return
      }
      e.preventDefault()
      sph.phi = THREE.MathUtils.clamp(sph.phi, 0.1, Math.PI / 2 - 0.04)
      sph.radius = THREE.MathUtils.clamp(sph.radius, MIN_DISTANCE, MAX_DISTANCE)
      camera.position.copy(c.target).add(offset.setFromSpherical(sph))
      c.update()
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [gl, camera])

  // Set the pose ourselves: OrbitControls.reset() would restore the pre-target-prop state.
  useEffect(() => {
    camera.position.copy(HOME_POSITION)
    controls.current?.target.copy(HOME_TARGET)
    controls.current?.update()
  }, [resetNonce, camera])

  // Test hook: expose the camera position in dev so end-to-end tests can assert on orbiting.
  useEffect(() => {
    if (import.meta.env.PROD) return
    const c = controls.current
    const publish = () => {
      gl.domElement.dataset.camera = camera.position
        .toArray()
        .map((n) => n.toFixed(2))
        .join(',')
    }
    publish()
    c?.addEventListener('change', publish)
    return () => c?.removeEventListener('change', publish)
  }, [gl, camera])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping={!reducedMotion()}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      maxPolarAngle={Math.PI / 2 - 0.04}
      autoRotate={autoRotate}
      autoRotateSpeed={1.1}
    />
  )
}

/** Moves each hotspot button to the on-screen position of its 3D anchor. */
function HotspotTracker() {
  const v = useRef(new THREE.Vector3())
  useFrame(({ camera, size }) => {
    for (const [id, a] of hotspotAnchors) {
      const el = hotspotEls.get(id)
      if (!el) continue
      v.current.set(a[0], a[1], a[2]).project(camera)
      const behind = v.current.z > 1
      el.style.visibility = behind ? 'hidden' : 'visible'
      el.style.transform = `translate(${((v.current.x + 1) / 2) * size.width}px, ${((1 - v.current.y) / 2) * size.height}px)`
    }
  })
  return null
}

function CaptureBridge() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    capture.run = (filename) => {
      gl.render(scene, camera) // draw immediately so the buffer isn't cleared before toBlob
      gl.domElement.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    }
    return () => {
      capture.run = null
    }
  }, [gl, scene, camera])
  return null
}

function LoadingPill() {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <div className="loading" role="status">
      Loading model {Math.round(progress)}%
    </div>
  )
}

export default function Viewer() {
  const def = useConfigurator(selectModel)
  const env = useConfigurator((s) => s.env)
  // Drop pixel ratio when the frame rate sags, restore it when there's headroom.
  const [dpr, setDpr] = useState(1.5)

  return (
    <>
      <Canvas
        className="viewer-canvas"
        camera={{ position: HOME_POSITION.toArray(), fov: 32 }}
        dpr={dpr}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(2)} />
        <Rig />
        <CaptureBridge />
        <HotspotTracker />
        <Suspense fallback={null}>
          <Model key={def.url} />
          {env === 'studio' ? <StudioEnvironment key="studio" /> : <Environment key={env} preset={env} />}
        </Suspense>
        <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={8} blur={2.6} far={2} resolution={512} />
        <directionalLight position={[3, 5, 2]} intensity={0.6} />
      </Canvas>
      <LoadingPill />
    </>
  )
}
