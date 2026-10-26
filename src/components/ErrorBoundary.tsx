import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  onError: (error: Error) => void
}

/**
 * Catches failures from the 3D viewer, such as a corrupt upload or a lost WebGL context.
 * R3F rethrows errors from inside <Canvas> to the nearest boundary outside it.
 * Give it a `key` to reset it, which the app does whenever the model changes.
 */
export class ViewerErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="viewer-error" role="alert">
        <p>The 3D viewer couldn't load. Your browser may not support WebGL, or the model failed to load.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    )
  }
}
