import { useState } from 'react'
import { hotspotEls } from '../hotspotLayer'
import { selectModel, useConfigurator } from '../store'

/** Annotation buttons over the viewer. Positions are written by the viewer's per-frame tracker. */
export function Hotspots() {
  const model = useConfigurator(selectModel)
  const show = useConfigurator((s) => s.hotspots)
  // Anchors describe the assembled model, so they'd float in mid-air once parts move apart.
  const assembled = useConfigurator((s) => s.explode < 0.02)
  if (!show || !assembled || model.hotspots.length === 0) return null

  return (
    <div className="hotspot-layer">
      {model.hotspots.map((h) => (
        <Hotspot
          key={`${model.id}-${h.id}`}
          id={h.id}
          label={h.label}
          text={h.text}
        />
      ))}
    </div>
  )
}

function Hotspot({ id, label, text }: { id: string; label: string; text: string }) {
  const [open, setOpen] = useState(false)
  const pause = (on: boolean) => useConfigurator.getState().set({ pauseRotate: on })
  return (
    <div
      className="hotspot"
      onPointerEnter={() => pause(true)}
      onPointerLeave={() => pause(false)}
      onFocus={() => pause(true)}
      ref={(el) => {
        if (el) hotspotEls.set(id, el)
        return () => {
          hotspotEls.delete(id)
        }
      }}
    >
      <button
        type="button"
        className="hotspot-dot"
        aria-expanded={open}
        aria-label={`${label}: ${open ? 'hide' : 'show'} details`}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => {
          setOpen(false)
          pause(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
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
