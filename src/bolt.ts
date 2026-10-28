import { BufferGeometry, Float32BufferAttribute } from 'three'

/** A metric hex cap screw. All lengths are millimetres. */
export type BoltParams = {
  /** Nominal (major) diameter, e.g. 8 for an M8. */
  size: number
  /** Shank plus thread, measured under the head. */
  length: number
  /** Distance between two adjacent thread peaks. */
  pitch: number
  /** Thread runs the whole length instead of stopping at the ISO 4014 thread length. */
  full: boolean
}

type Size = {
  d: number
  coarse: number
  fine: number
  /** Head width across flats (ISO 4017). */
  s: number
  /** Head height. */
  k: number
}

/** Standard sizes with their ISO 261 coarse and a common fine pitch, and ISO 4017 head dimensions. */
export const SIZES: readonly Size[] = [
  { d: 3, coarse: 0.5, fine: 0.35, s: 5.5, k: 2 },
  { d: 4, coarse: 0.7, fine: 0.5, s: 7, k: 2.8 },
  { d: 5, coarse: 0.8, fine: 0.5, s: 8, k: 3.5 },
  { d: 6, coarse: 1, fine: 0.75, s: 10, k: 4 },
  { d: 8, coarse: 1.25, fine: 1, s: 13, k: 5.3 },
  { d: 10, coarse: 1.5, fine: 1.25, s: 16, k: 6.4 },
  { d: 12, coarse: 1.75, fine: 1.5, s: 18, k: 7.5 },
  { d: 14, coarse: 2, fine: 1.5, s: 21, k: 8.8 },
  { d: 16, coarse: 2, fine: 1.5, s: 24, k: 10 },
  { d: 20, coarse: 2.5, fine: 1.5, s: 30, k: 12.5 },
  { d: 24, coarse: 3, fine: 2, s: 36, k: 15 },
]

export const LENGTH_MIN = 8
export const LENGTH_MAX = 100
export const PITCH_STEP = 0.05

export const DEFAULT_BOLT: BoltParams = { size: 8, length: 40, pitch: 1.25, full: false }

export const sizeInfo = (d: number): Size => SIZES.find((s) => s.d === d) ?? SIZES[4]

export const isStandardSize = (d: number) => SIZES.some((s) => s.d === d)

/** Pitches outside this range either vanish into the core or leave nothing of it. */
export const pitchRange = (d: number): [min: number, max: number] => [Math.max(0.25, Math.ceil((d / 25) * 20) / 20), d / 4]

const round2 = (n: number) => Math.round(n * 100) / 100

/** Snap onto the slider's grid so a typed or linked value can't land between steps. */
const snapPitch = (n: number) => round2(Math.round(n / PITCH_STEP) * PITCH_STEP)

/** Coerce arbitrary input into a bolt that can be built. Falls back to the defaults for junk. */
export function clampBolt(input: Partial<BoltParams>, previous: BoltParams = DEFAULT_BOLT): BoltParams {
  const size = isStandardSize(input.size ?? NaN) ? (input.size as number) : previous.size
  const [lo, hi] = pitchRange(size)
  const sizeChanged = size !== previous.size
  const wanted = input.pitch ?? (sizeChanged ? sizeInfo(size).coarse : previous.pitch)
  const pitch = Number.isFinite(wanted) ? Math.min(hi, Math.max(lo, snapPitch(wanted))) : sizeInfo(size).coarse
  const length =
    input.length !== undefined && Number.isFinite(input.length)
      ? Math.min(LENGTH_MAX, Math.max(LENGTH_MIN, Math.round(input.length)))
      : previous.length
  return { size, length, pitch, full: input.full ?? previous.full }
}

/** ISO 4014 thread length is 2d + 6 for bolts up to 125 mm. Shorter bolts are threaded throughout. */
export const threadLength = ({ size, length, full }: BoltParams) => (full ? length : Math.min(length, 2 * size + 6))

/** Number of full turns of thread along the threaded length. */
export const threadTurns = (b: BoltParams) => threadLength(b) / b.pitch

/** Across-corners diameter of the hex head. */
export const headCorners = (d: number) => sizeInfo(d).s / Math.cos(Math.PI / 6)

/** Axial extent of the whole bolt: shank plus head. */
export const boltSpan = (b: BoltParams) => b.length + sizeInfo(b.size).k

/** Thread depth and radii, following the ISO 68-1 basic profile (60 degree flanks, flat crest of P/8). */
export function threadProfile(size: number, pitch: number) {
  const major = size / 2
  const depth = Math.min(0.6134 * pitch, major * 0.5)
  const crest = pitch / 8
  const base = crest + 2 * depth * Math.tan(Math.PI / 6)
  return { major, minor: major - depth, depth, crest, base }
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/**
 * The helical ridge of a right-hand thread, running along +y from y = 0 (the tip) to the thread length.
 * It is swept as three strips (lower flank, crest, upper flank) with unshared vertices between them,
 * so normals are smooth along the helix and creased at the crest edges. The ridge shrinks to nothing
 * over the first 1.5 turns (a lead-in) and the last turn (run-out) instead of ending in a cut face.
 */
export function buildRidgeGeometry(b: BoltParams): BufferGeometry {
  const { size, pitch } = b
  const length = threadLength(b)
  const { major, minor, crest, base } = threadProfile(size, pitch)

  // Cross-section in (axial, radial) around the helix centreline, listed bottom to top.
  const section: [number, number][] = [
    [-base / 2, minor],
    [-crest / 2, major],
    [crest / 2, major],
    [base / 2, minor],
  ]

  const turns = length / pitch
  const perTurn = Math.max(12, Math.min(48, Math.floor(30000 / Math.max(turns, 1))))
  const steps = Math.max(8, Math.ceil(turns * perTurn))
  const tip = pitch * 1.5
  const runout = pitch

  const positions: number[] = []
  const indices: number[] = []

  for (let strip = 0; strip < 3; strip++) {
    const first = positions.length / 3
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * turns * Math.PI * 2
      const yc = (theta / (Math.PI * 2)) * pitch
      const f = smooth(yc / tip) * smooth((length - yc) / runout)
      for (const [a, r] of [section[strip], section[strip + 1]]) {
        const rr = minor + (r - minor) * f
        const yy = yc + a * f
        // Right-hand helix: advancing along +y while turning counter-clockwise seen from +y.
        positions.push(rr * Math.sin(theta), yy, rr * Math.cos(theta))
      }
    }
    for (let i = 0; i < steps; i++) {
      const a = first + i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}
