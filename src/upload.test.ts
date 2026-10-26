import { describe, expect, it } from 'vitest'
import { isGlb, MAX_UPLOAD_BYTES, validateGlb } from './upload'

const glbBytes = [0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]
const file = (name: string, bytes: number[] = glbBytes) => new File([new Uint8Array(bytes)], name)

describe('isGlb', () => {
  it('recognises the glTF magic number', () => {
    expect(isGlb(new Uint8Array(glbBytes))).toBe(true)
    expect(isGlb(new Uint8Array([1, 2, 3, 4]))).toBe(false)
    expect(isGlb(new Uint8Array([0x67, 0x6c]))).toBe(false)
  })
})

describe('validateGlb', () => {
  it('accepts a binary glTF', async () => {
    expect(await validateGlb(file('chair.GLB'))).toBeNull()
  })

  it('rejects other extensions', async () => {
    expect(await validateGlb(file('model.gltf'))).toMatch(/\.glb/)
    expect(await validateGlb(file('notes.txt'))).toMatch(/\.glb/)
  })

  it('rejects a renamed non-glTF file', async () => {
    expect(await validateGlb(file('fake.glb', [1, 2, 3, 4]))).toMatch(/not a valid/)
  })

  it('rejects files over the size limit', async () => {
    const big = file('big.glb')
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 })
    expect(await validateGlb(big)).toMatch(/limit/)
  })
})
