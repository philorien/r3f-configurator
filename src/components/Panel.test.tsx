import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Panel } from './Panel'
import { useConfigurator } from '../store'

const initial = useConfigurator.getState()
// The accept attribute is a browser hint, so let tests upload files it would filter out.
const user = () => userEvent.setup({ applyAccept: false })

beforeEach(() => {
  useConfigurator.setState(initial, true)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:test', revokeObjectURL: () => {} })
})

describe('<Panel />', () => {
  it('switches variant and part through labelled radios', async () => {
    const u = user()
    render(<Panel />)
    await u.click(screen.getByRole('radio', { name: 'Velvet chair' }))
    await u.click(screen.getByRole('radio', { name: 'Peacock Velvet' }))
    expect(useConfigurator.getState()).toMatchObject({ modelId: 'chair', variant: 1 })

    await u.click(screen.getByRole('radio', { name: 'Wood' }))
    expect(screen.getByRole('group', { name: /color: wood/i })).toBeInTheDocument()
  })

  it('applies a color swatch and exposes pressed state', async () => {
    const u = user()
    render(<Panel />)
    const navy = screen.getByRole('button', { name: 'Navy' })
    expect(navy).toHaveAttribute('aria-pressed', 'false')
    await u.click(navy)
    expect(navy).toHaveAttribute('aria-pressed', 'true')
    expect(useConfigurator.getState().overrides['shoe:shoe']?.color).toBe('#1d3557')
  })

  it('hides the explode control for a single-mesh model', async () => {
    const u = user()
    render(<Panel />)
    expect(screen.queryByText('Explode')).not.toBeInTheDocument()
    await u.click(screen.getByRole('radio', { name: 'Velvet chair' }))
    expect(screen.getByText('Explode')).toBeInTheDocument()
  })

  it('shows a shareable link that tracks the configuration, and copies it', async () => {
    const u = user()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Panel />)
    await u.click(screen.getByRole('radio', { name: 'Velvet chair' }))
    await u.click(screen.getByRole('radio', { name: 'Peacock Velvet' }))
    const field = screen.getByLabelText('Shareable link') as HTMLInputElement
    expect(field.value).toContain('m=chair')
    expect(field.value).toContain('v=1')

    await u.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(field.value)
    expect(useConfigurator.getState().announcement).toBe('Link copied to clipboard')
  })

  it('rejects a non-glb upload with a visible message', async () => {
    const u = user()
    render(<Panel />)
    await u.upload(screen.getByTestId('glb-input'), new File(['hi'], 'notes.txt'))
    expect(await screen.findByText(/only \.glb files/i)).toBeInTheDocument()
    expect(useConfigurator.getState().custom).toBeNull()
  })

  it('accepts a glb upload, adds it as a model and disables sharing', async () => {
    const u = user()
    render(<Panel />)
    const glb = new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])], 'lamp.glb')
    await u.upload(screen.getByTestId('glb-input'), glb)
    await waitFor(() => expect(useConfigurator.getState().modelId).toBe('custom'))
    expect(screen.getByRole('radio', { name: 'lamp' })).toBeChecked()
    expect(screen.queryByLabelText('Shareable link')).not.toBeInTheDocument()
    expect(screen.getByText(/can't be shared by link/i)).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Remove upload' }))
    expect(useConfigurator.getState()).toMatchObject({ modelId: 'shoe', custom: null })
  })

  it('uses a select instead of a wall of radios for models with many parts', () => {
    render(<Panel />)
    useConfigurator.getState().setCustom({
      id: 'custom', name: 'big', url: 'blob:big', blurb: '', credit: '', variants: [], hotspots: [], custom: true,
      parts: Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, label: `Part ${i}`, match: () => false })),
    })
    useConfigurator.getState().setCustomMeta(useConfigurator.getState().custom!.parts, [])
    return waitFor(() => expect(screen.getByRole('combobox', { name: 'Part' })).toBeInTheDocument())
  })
})
