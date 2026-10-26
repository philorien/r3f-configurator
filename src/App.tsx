import { lazy, Suspense, useEffect, useState, type DragEvent } from 'react'
import { ViewerErrorBoundary } from './components/ErrorBoundary'
import { Hotspots } from './components/Hotspots'
import { Panel } from './components/Panel'
import { CUSTOM_ID } from './models'
import { selectModel, useConfigurator } from './store'
import { loadGlbFile } from './upload'
import { startUrlSync } from './urlSync'
import './App.css'

// three.js, R3F and drei are most of the bundle. Load them after the page shell paints.
const Viewer = lazy(() => import('./components/Viewer'))

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

export default function App() {
  const url = useConfigurator((s) => selectModel(s).url)
  const announcement = useConfigurator((s) => s.announcement)
  const [dragging, setDragging] = useState(false)

  useEffect(() => startUrlSync(), [])

  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void loadGlbFile(file)
  }

  const onViewerError = () => {
    const { modelId, clearCustom } = useConfigurator.getState()
    if (modelId === CUSTOM_ID) clearCustom("That file couldn't be loaded. It may be corrupt or use an unsupported extension.")
  }

  return (
    <div className="app">
      <a className="skip-link" href="#controls">
        Skip to controls
      </a>
      <main
        className="stage"
        onDragEnter={(e) => hasFiles(e) && setDragging(true)}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault() // required to allow a drop
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false)
        }}
        onDrop={onDrop}
      >
        <ViewerErrorBoundary key={url} onError={onViewerError}>
          <Suspense
            fallback={
              <div className="loading" role="status">
                Loading 3D viewer
              </div>
            }
          >
            <Viewer />
          </Suspense>
        </ViewerErrorBoundary>
        <Hotspots />
        {dragging && (
          <div className="drop-overlay" aria-hidden="true">
            Drop a .glb file to view it
          </div>
        )}
      </main>
      <Panel />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  )
}
