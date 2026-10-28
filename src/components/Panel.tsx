import { useRef } from 'react'
import { boltSpan, DEFAULT_BOLT, LENGTH_MAX, LENGTH_MIN, PITCH_STEP, pitchRange, SIZES, sizeInfo, threadLength, threadTurns } from '../bolt'
import { capture } from '../capture'
import { MODELS, partKey } from '../models'
import { ENV_PRESETS, selectModel, useConfigurator, type EnvPreset } from '../store'
import { loadGlbFile } from '../upload'
import { currentLink } from '../urlSync'

const SWATCHES = [
  { name: 'Crimson', value: '#c1121f' },
  { name: 'Amber', value: '#f4a261' },
  { name: 'Forest', value: '#2d6a4f' },
  { name: 'Teal', value: '#14746f' },
  { name: 'Navy', value: '#1d3557' },
  { name: 'Plum', value: '#6d3a74' },
  { name: 'Bone', value: '#e9e2d0' },
  { name: 'Graphite', value: '#2b2d31' },
]

/** More parts than this and a row of radios stops being usable, so switch to a select. */
const MAX_RADIO_PARTS = 6

export function Panel() {
  const s = useConfigurator()
  const model = selectModel(s)
  const part = model.parts.find((p) => p.id === s.activePart) ?? model.parts[0]
  const key = part ? partKey(model.id, part.id) : ''
  const override = s.overrides[key] ?? {}
  const base = s.partBase[key]
  const canExplode = model.parts.length > 1
  const hiddenCount = model.parts.filter((p) => s.overrides[partKey(model.id, p.id)]?.hidden).length
  const link = currentLink()
  const fileInput = useRef<HTMLInputElement>(null)
  const linkInput = useRef<HTMLInputElement>(null)

  const copyLink = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      s.announce('Link copied to clipboard')
    } catch {
      linkInput.current?.select()
      s.announce('Could not copy automatically. The link is selected, press Control or Command C.')
    }
  }

  return (
    <aside className="panel" id="controls" tabIndex={-1} aria-label="Configurator controls">
      <header className="panel-head">
        <h1>Configurator</h1>
        <p>{model.blurb}</p>
      </header>

      <fieldset>
        <legend>Model</legend>
        <div className="segmented">
          {MODELS.map((m) => (
            <label key={m.id}>
              <input type="radio" name="model" checked={m.id === s.modelId} onChange={() => s.setModel(m.id)} />
              <span>{m.name}</span>
            </label>
          ))}
          {s.custom && (
            <label>
              <input
                type="radio"
                name="model"
                checked={s.custom.id === s.modelId}
                onChange={() => s.setModel(s.custom!.id)}
              />
              <span>{s.custom.name}</span>
            </label>
          )}
        </div>
        <div className="row">
          <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>
            Upload .glb
          </button>
          {s.custom && (
            <button type="button" className="link" onClick={() => s.clearCustom()}>
              Remove upload
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".glb,model/gltf-binary"
          hidden
          data-testid="glb-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void loadGlbFile(file)
            e.target.value = '' // allow picking the same file again
          }}
        />
        <p className="hint">Or drop a .glb file anywhere on the viewer. It stays in your browser.</p>
        {s.uploadError && <p className="error">{s.uploadError}</p>}
      </fieldset>

      {model.procedural === 'bolt' && <BoltControls />}

      {model.variants.length > 0 && (
        <fieldset>
          <legend>Variant</legend>
          <div className="segmented">
            {model.variants.map((name, i) => (
              <label key={`${i}-${name}`}>
                <input type="radio" name="variant" checked={i === s.variant} onChange={() => s.setVariant(i)} />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {model.custom && !part && !s.uploadError && <p className="hint">Reading the model's parts...</p>}

      {model.parts.length > 1 && part && (
        <fieldset>
          <legend>Part (or click it in the scene)</legend>
          {model.parts.length > MAX_RADIO_PARTS ? (
            <label className="select">
              <span className="sr-only">Part</span>
              <select value={part.id} onChange={(e) => s.setActivePart(e.target.value)}>
                {model.parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="segmented">
              {model.parts.map((p) => (
                <label key={p.id}>
                  <input
                    type="radio"
                    name="part"
                    checked={p.id === part.id}
                    onChange={() => s.setActivePart(p.id)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          )}
          {model.procedural === 'bolt' && part.id === 'shank' && threadLength(s.bolt) >= s.bolt.length && (
            <p className="hint">This bolt is fully threaded, so there is no shank to show.</p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={!override.hidden}
              onChange={(e) => s.patchPart(part.id, { hidden: !e.target.checked })}
            />
            {part.label} visible
          </label>
          {hiddenCount > 0 && (
            <div className="notice">
              <span>
                {hiddenCount} {hiddenCount === 1 ? 'part is' : 'parts are'} hidden.
              </span>
              <button type="button" className="secondary" onClick={s.showAllParts}>
                Show all parts
              </button>
            </div>
          )}
        </fieldset>
      )}

      {part && (
        <>
          <fieldset>
            <legend>Color: {part.label}</legend>
            <div className="swatches">
              {SWATCHES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="swatch"
                  style={{ background: c.value }}
                  aria-label={c.name}
                  aria-pressed={override.color === c.value}
                  onClick={() => s.patchPart(part.id, { color: c.value })}
                />
              ))}
            </div>
            <div className="row">
              <label className="color-input">
                Custom
                <input
                  type="color"
                  value={override.color ?? '#ffffff'}
                  onChange={(e) => s.patchPart(part.id, { color: e.target.value })}
                />
              </label>
              <button type="button" className="link" onClick={() => s.patchPart(part.id, { color: undefined })}>
                Original color
              </button>
            </div>
            <p className="hint">Tints multiply with the model's textures, so dark textures stay dark.</p>
          </fieldset>

          <fieldset>
            <legend>Finish: {part.label}</legend>
            <Slider
              label="Roughness"
              value={override.roughness ?? base?.roughness ?? 0.5}
              onChange={(v) => s.patchPart(part.id, { roughness: v })}
            />
            <Slider
              label="Metalness"
              value={override.metalness ?? base?.metalness ?? 0}
              onChange={(v) => s.patchPart(part.id, { metalness: v })}
            />
            <button type="button" className="link" onClick={() => s.clearFinish(part.id)}>
              Original finish
            </button>
          </fieldset>
        </>
      )}

      {canExplode && (
        <fieldset>
          <legend>Explode</legend>
          <Slider label="Distance" value={s.explode} onChange={(v) => s.set({ explode: v })} />
        </fieldset>
      )}

      <fieldset>
        <legend>Scene</legend>
        <label className="select">
          Lighting
          <select value={s.env} onChange={(e) => s.set({ env: e.target.value as EnvPreset })}>
            {ENV_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p === 'studio' ? 'Studio (procedural)' : p[0].toUpperCase() + p.slice(1) + ' (HDRI)'}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.autoRotate} onChange={(e) => s.set({ autoRotate: e.target.checked })} />
          Auto-rotate
        </label>
        <label className="check">
          <input type="checkbox" checked={s.wireframe} onChange={(e) => s.set({ wireframe: e.target.checked })} />
          Wireframe
        </label>
        {model.hotspots.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={s.hotspots} onChange={(e) => s.set({ hotspots: e.target.checked })} />
            Hotspots
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Share</legend>
        {link ? (
          <div className="row">
            <input
              ref={linkInput}
              className="link-field"
              type="text"
              readOnly
              value={link}
              aria-label="Shareable link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" className="secondary" onClick={copyLink}>
              Copy link
            </button>
          </div>
        ) : (
          <p className="hint">Uploaded models can't be shared by link because the file only exists in your browser.</p>
        )}
      </fieldset>

      <div className="actions">
        <button type="button" onClick={s.resetView}>
          Reset view
        </button>
        <button type="button" onClick={s.resetModel}>
          Reset model
        </button>
        <button type="button" className="primary" onClick={() => capture.run?.(`${model.id}-configurator.png`)}>
          Save PNG
        </button>
      </div>

      {model.credit && <footer className="credit">{model.credit}</footer>}
    </aside>
  )
}

function BoltControls() {
  const bolt = useConfigurator((s) => s.bolt)
  const setBolt = useConfigurator((s) => s.setBolt)
  const announce = useConfigurator((s) => s.announce)
  const section = useConfigurator((s) => s.section)
  const set = useConfigurator((s) => s.set)
  const [lo, hi] = pitchRange(bolt.size)
  const info = sizeInfo(bolt.size)
  const turns = threadTurns(bolt)

  return (
    <fieldset>
      <legend>Bolt</legend>
      <label className="select">
        Size
        <select
          value={bolt.size}
          onChange={(e) => {
            const size = Number(e.target.value)
            setBolt({ size })
            announce(`Size M${size}, pitch ${sizeInfo(size).coarse} millimetres`)
          }}
        >
          {SIZES.map((x) => (
            <option key={x.d} value={x.d}>
              M{x.d}
            </option>
          ))}
        </select>
      </label>
      <Slider
        label="Length"
        value={bolt.length}
        min={LENGTH_MIN}
        max={LENGTH_MAX}
        step={1}
        unit="mm"
        digits={0}
        onChange={(v) => setBolt({ length: v })}
      />
      <Slider
        label="Pitch"
        value={bolt.pitch}
        min={lo}
        max={hi}
        step={PITCH_STEP}
        unit="mm"
        onChange={(v) => setBolt({ pitch: v })}
      />
      <div className="segmented" role="radiogroup" aria-label="Standard pitch">
        <label>
          <input
            type="radio"
            name="pitch-series"
            checked={bolt.pitch === info.coarse}
            onChange={() => setBolt({ pitch: info.coarse })}
          />
          <span>Coarse {info.coarse}</span>
        </label>
        <label>
          <input
            type="radio"
            name="pitch-series"
            checked={bolt.pitch === info.fine}
            onChange={() => setBolt({ pitch: info.fine })}
          />
          <span>Fine {info.fine}</span>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={bolt.full} onChange={(e) => setBolt({ full: e.target.checked })} />
        Fully threaded
      </label>
      <label className="check">
        <input type="checkbox" checked={section} onChange={(e) => set({ section: e.target.checked })} />
        Cross-section
      </label>
      <p className="hint">
        M{bolt.size} x {bolt.pitch} x {bolt.length} mm. {turns.toFixed(1)} turns over {threadLength(bolt)} mm of thread,
        {' '}{boltSpan(bolt).toFixed(1)} mm overall with the head.
      </p>
      {(bolt.size !== DEFAULT_BOLT.size ||
        bolt.length !== DEFAULT_BOLT.length ||
        bolt.pitch !== DEFAULT_BOLT.pitch ||
        bolt.full !== DEFAULT_BOLT.full) && (
        <button type="button" className="link" onClick={() => setBolt({ ...DEFAULT_BOLT })}>
          Original size
        </button>
      )}
    </fieldset>
  )
}

type SliderProps = {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  /** Without a unit the slider reads as a 0..1 fraction, spoken as a percent. */
  unit?: string
  digits?: number
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, unit, digits = 2 }: SliderProps) {
  const shown = value.toFixed(digits)
  return (
    <label className="slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={unit ? `${shown} ${unit}` : `${Math.round(value * 100)} percent`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{unit ? `${shown} ${unit}` : shown}</output>
    </label>
  )
}
