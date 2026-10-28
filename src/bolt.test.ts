import { describe, expect, it } from 'vitest'
import {
  buildRidgeGeometry,
  clampBolt,
  DEFAULT_BOLT,
  pitchRange,
  SIZES,
  threadLength,
  threadProfile,
  threadTurns,
} from './bolt'

describe('bolt parameters', () => {
  it('stops the thread at 2d + 6 unless fully threaded, and never past the bolt', () => {
    expect(threadLength({ ...DEFAULT_BOLT, size: 8, length: 80 })).toBe(22)
    expect(threadLength({ ...DEFAULT_BOLT, size: 8, length: 16 })).toBe(16)
    expect(threadLength({ ...DEFAULT_BOLT, size: 8, length: 80, full: true })).toBe(80)
  })

  it('counts turns as threaded length over pitch', () => {
    expect(threadTurns({ size: 8, length: 40, pitch: 1.25, full: true })).toBe(32)
  })

  it('moves to the new size\'s coarse pitch when only the size changes', () => {
    expect(clampBolt({ size: 12 }).pitch).toBe(1.75)
  })

  it('keeps an explicit pitch when the size changes too, within that size\'s range', () => {
    expect(clampBolt({ size: 12, pitch: 1.5 }).pitch).toBe(1.5)
    const [, hi] = pitchRange(3)
    expect(clampBolt({ size: 3, pitch: 2 }).pitch).toBe(hi)
  })

  it('rejects sizes that are not standard and clamps length', () => {
    expect(clampBolt({ size: 9 }).size).toBe(DEFAULT_BOLT.size)
    expect(clampBolt({ length: 5 }).length).toBe(8)
    expect(clampBolt({ length: 500 }).length).toBe(100)
    expect(clampBolt({ length: NaN }).length).toBe(DEFAULT_BOLT.length)
  })

  it('offers every standard coarse and fine pitch inside the allowed range', () => {
    for (const { d, coarse, fine } of SIZES) {
      const [lo, hi] = pitchRange(d)
      expect(coarse).toBeGreaterThanOrEqual(lo)
      expect(coarse).toBeLessThanOrEqual(hi)
      expect(fine).toBeGreaterThanOrEqual(lo)
      expect(fine).toBeLessThanOrEqual(hi)
    }
  })

  it('keeps the minor radius positive for every size at the extremes of its pitch range', () => {
    for (const { d } of SIZES) {
      for (const p of pitchRange(d)) expect(threadProfile(d, p).minor).toBeGreaterThan(d / 4)
    }
  })
})

describe('thread geometry', () => {
  const b = { size: 8, length: 40, pitch: 1.25, full: true }
  const g = buildRidgeGeometry(b)
  const pos = g.getAttribute('position')
  const nor = g.getAttribute('normal')

  it('stays between the minor and major radius and inside the threaded length', () => {
    const { major, minor } = threadProfile(b.size, b.pitch)
    g.computeBoundingBox()
    expect(g.boundingBox!.min.y).toBeGreaterThan(-b.pitch)
    expect(g.boundingBox!.max.y).toBeLessThan(b.length + b.pitch)
    let maxR = 0
    let minR = Infinity
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      maxR = Math.max(maxR, r)
      minR = Math.min(minR, r)
    }
    expect(maxR).toBeCloseTo(major, 5)
    expect(minR).toBeGreaterThanOrEqual(minor - 1e-6)
  })

  it('faces outward, with flanks tilted toward the tip and the head', () => {
    const steps = pos.count / 3 / 2 - 1 // vertices per strip = (steps + 1) * 2
    const perStrip = (steps + 1) * 2
    let checked = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < b.length * 0.3 || y > b.length * 0.7) continue // full height only, away from the tapers
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      const radial = (nor.getX(i) * pos.getX(i) + nor.getZ(i) * pos.getZ(i)) / r
      expect(radial).toBeGreaterThan(0.3)
      const strip = Math.floor(i / perStrip)
      if (strip === 0) expect(nor.getY(i)).toBeLessThan(0)
      if (strip === 2) expect(nor.getY(i)).toBeGreaterThan(0)
      checked++
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('is a right-hand thread: moving toward the head turns counter-clockwise seen from the head', () => {
    // Vertex 0 and a vertex one pitch further along share an angle; a quarter pitch further is a quarter turn on.
    const perTurn = Math.round((pos.count / 3 / 2 - 1) / (b.length / b.pitch))
    const quarter = Math.round(perTurn / 4) * 2
    const angle = (i: number) => Math.atan2(pos.getX(i), pos.getZ(i))
    const start = 2 * perTurn * 2 // two turns in, clear of the lead-in
    const delta = angle(start + quarter) - angle(start)
    const wrapped = Math.atan2(Math.sin(delta), Math.cos(delta))
    expect(wrapped).toBeGreaterThan(0)
    expect(pos.getY(start + quarter)).toBeGreaterThan(pos.getY(start))
  })

  it('stays a manageable size for the densest thread', () => {
    const dense = buildRidgeGeometry({ size: 24, length: 100, pitch: 0.96, full: true })
    expect(dense.getAttribute('position').count).toBeLessThan(250_000)
  })
})
