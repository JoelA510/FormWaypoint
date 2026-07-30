// @vitest-environment jsdom
/**
 * Where a generated document goes, and what the caller learns about it.
 *
 * The part worth pinning is that the desktop build reports the name that was *written*, not
 * the one that was asked for: the shell appends a `(2)` when a file of that name is already
 * there, and a banner reading "saved to K78027EC_SLI_ceva.pdf" next to a folder containing
 * `K78027EC_SLI_ceva (2).pdf` would send someone to the wrong file — most likely the older
 * one, which is the failure that matters.
 *
 * Runs under jsdom rather than the default node environment, because the browser branch is
 * half the behaviour and it is an anchor element.
 */
import { describe, expect, it, vi } from 'vitest'
import { deliver, deliverText, open } from './deliver'
import type { DesktopBridge } from '../desktop'

const fakeBridge = (savedAs: (name: string) => string): DesktopBridge => ({
  fetchConcordance: vi.fn(async () => ''),
  writeDataFile: vi.fn(async (name: string) => `/data/${name}`),
  readDataFile: vi.fn(async () => null),
  dataDir: vi.fn(async () => '/data'),
  saveOutput: vi.fn(async (name: string) => savedAs(name)),
  openOutput: vi.fn(async () => {}),
  outputDir: vi.fn(async () => '/downloads'),
})

const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])

describe('on the desktop', () => {
  it('writes through the shell and reports the full path', async () => {
    const bridge = fakeBridge((name) => `/home/joel/Downloads/${name}`)
    const delivery = await deliver(bridge, 'K78027EC_SLI_ceva.pdf', bytes)
    expect(delivery).toEqual({
      fileName: 'K78027EC_SLI_ceva.pdf',
      path: '/home/joel/Downloads/K78027EC_SLI_ceva.pdf',
    })
    expect(bridge.saveOutput).toHaveBeenCalledWith('K78027EC_SLI_ceva.pdf', bytes)
  })

  it('reports the name that was written, not the one requested', async () => {
    const bridge = fakeBridge(() => '/home/joel/Downloads/K78027EC_SLI_ceva (2).pdf')
    const delivery = await deliver(bridge, 'K78027EC_SLI_ceva.pdf', bytes)
    expect(delivery.fileName).toBe('K78027EC_SLI_ceva (2).pdf')
  })

  it('reads a Windows path back to its file name', async () => {
    const bridge = fakeBridge(() => 'C:\\Users\\Firstname Lastname\\Downloads\\K78027EC_SLI_ceva.pdf')
    expect((await deliver(bridge, 'K78027EC_SLI_ceva.pdf', bytes)).fileName).toBe('K78027EC_SLI_ceva.pdf')
  })

  it('encodes text before handing it over', async () => {
    const bridge = fakeBridge((name) => `/downloads/${name}`)
    await deliverText(bridge, 'sheet.txt', 'FedEx Ship Manager')
    const sent = vi.mocked(bridge.saveOutput).mock.calls[0][1]
    expect(new TextDecoder().decode(sent)).toBe('FedEx Ship Manager')
  })

  it('opens the path it was given', async () => {
    const bridge = fakeBridge((name) => `/downloads/${name}`)
    const delivery = await deliver(bridge, 'a.pdf', bytes)
    await open(bridge, delivery)
    expect(bridge.openOutput).toHaveBeenCalledWith('/downloads/a.pdf')
  })

  it('does not turn a successful write into a failure when nothing can open it', async () => {
    // A machine with no association for the type is not a reason to make a generated form
    // look like it failed — the file is written and its path is on screen.
    const bridge = fakeBridge((name) => `/downloads/${name}`)
    vi.mocked(bridge.openOutput).mockRejectedValueOnce(new Error('no handler'))
    const delivery = await deliver(bridge, 'a.pdf', bytes)
    await expect(open(bridge, delivery)).resolves.toBeUndefined()
  })
})

describe('in a browser', () => {
  it('falls back to a download and admits it does not know where it went', async () => {
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor as unknown as HTMLAnchorElement)
    vi.spyOn(document.body, 'appendChild').mockImplementationOnce((n) => n)
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })

    const delivery = await deliver(null, 'a.pdf', bytes)
    expect(delivery).toEqual({ fileName: 'a.pdf', path: null })
    expect(anchor.click).toHaveBeenCalled()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('has nothing to open', async () => {
    await expect(open(null, { fileName: 'a.pdf', path: null })).resolves.toBeUndefined()
  })
})
