import { LoadingPill, Panel } from './components/Panel'
import { Viewer } from './components/Viewer'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <main className="stage">
        <Viewer />
        <LoadingPill />
      </main>
      <Panel />
    </div>
  )
}
