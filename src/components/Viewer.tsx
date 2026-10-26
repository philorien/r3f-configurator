import { Suspense, useEffect, useRef, useState, type ElementRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { capture } from '../capture'
import { useConfigurator } from '../store'
import { Model } from './Model'

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

const HOME_POSITION = new THREE.Vector3(3.4, 1.9, 4.6)
const HOME_TARGET = new THREE.Vector3(0, 0.6, 0)

function Rig() {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const autoRotate = useConfigurator((s) => s.autoRotate)
  const resetNonce = useConfigurator((s) => s.resetViewNonce)

  // Keyboard orbit (arrow keys) and a focusable canvas, so the viewer isn't mouse-only.
  useEffect(() => {
    const el = gl.domElement
    el.tabIndex = 0
    el.setAttribute('role', 'application')
    el.setAttribute(
      'aria-label',
      '3D product viewer. Drag or use arrow keys to rotate, scroll or plus and minus to zoom.',
    )
    controls.current?.listenToKeyEvents(el)
  }, [gl])

  // Set the pose ourselves: OrbitControls.reset() would restore the pre-target-prop state.
  useEffect(() => {
    camera.position.copy(HOME_POSITION)
    controls.current?.target.copy(HOME_TARGET)
    controls.current?.update()
  }, [resetNonce, camera])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      minDistance={2.5}
      maxDistance={9}
      maxPolarAngle={Math.PI / 2 - 0.04}
      autoRotate={autoRotate}
      autoRotateSpeed={1.1}
    />
  )
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

export function Viewer() {
  const modelId = useConfigurator((s) => s.modelId)
  const env = useConfigurator((s) => s.env)
  // Drop pixel ratio when the frame rate sags, restore it when there's headroom.
  const [dpr, setDpr] = useState(1.5)

  return (
    <Canvas
      className="viewer-canvas"
      camera={{ position: HOME_POSITION.toArray(), fov: 32 }}
      dpr={dpr}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(2)} />
      <Rig />
      <CaptureBridge />
      <Suspense fallback={null}>
        <Model key={modelId} modelId={modelId} />
        {env === 'studio' ? <StudioEnvironment key="studio" /> : <Environment key={env} preset={env} />}
      </Suspense>
      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={8} blur={2.6} far={2} resolution={512} />
      <directionalLight position={[3, 5, 2]} intensity={0.6} />
    </Canvas>
  )
}
