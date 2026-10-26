import { CUSTOM_ID } from './models'
import { useConfigurator } from './store'

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Binary glTF files start with the ASCII magic "glTF". */
export const isGlb = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46

/** Returns an error message, or null if the file looks loadable. */
export async function validateGlb(file: File): Promise<string | null> {
  if (!/\.glb$/i.test(file.name)) return 'Only .glb files are supported. A .gltf file with separate textures can\'t be loaded from a single drop.'
  if (file.size > MAX_UPLOAD_BYTES) return `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (!isGlb(head)) return 'That file has a .glb extension but is not a valid binary glTF.'
  return null
}

/** Validate a dropped or picked file, then hand it to the viewer as the custom model. */
export async function loadGlbFile(file: File) {
  const { setCustom, setUploadError } = useConfigurator.getState()
  const problem = await validateGlb(file)
  if (problem) {
    setUploadError(problem)
    return
  }
  setCustom({
    id: CUSTOM_ID,
    name: file.name.replace(/\.glb$/i, ''),
    url: URL.createObjectURL(file),
    blurb: 'Your uploaded model. It stays in this browser tab and is never sent anywhere.',
    credit: '',
    variants: [],
    parts: [],
    hotspots: [],
    custom: true,
  })
}
