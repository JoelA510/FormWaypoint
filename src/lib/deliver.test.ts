// @vitest-environment jsdom
/**
 * Where a generated document goes, and what the caller learns about it.
 *
 * The part worth pinning is that the desktop build reports the name that was *written*, not
 * the one that was asked for: the shell appends a `(2)` when a file of that name is already
 * there, and a banner reading "saved to vendorA3_SLI_ceva.pdf" next to a folder containing
 * `vendorA3_SLI_ceva (2).pdf` would send someone to the wrong file — most likely the older
 * one, which is the failure that matters.
 *
 * Runs under jsdom rather than the default node environment, because the browser branch is
 * half the behaviour and it is an anchor element.
 */
import { describe, expect, it, vi } from 'vitest'
import { deliver, open, safeFileName } from './deliver'
import type { DesktopBridge } from '../desktop'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

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
    const delivery = await deliver(bridge, 'vendorA3_SLI_ceva.pdf', bytes)
    expect(delivery).toEqual({
      fileName: 'vendorA3_SLI_ceva.pdf',
      path: '/home/joel/Downloads/vendorA3_SLI_ceva.pdf',
    })
    expect(bridge.saveOutput).toHaveBeenCalledWith('vendorA3_SLI_ceva.pdf', bytes)
  })

  it('reports the name that was written, not the one requested', async () => {
    const bridge = fakeBridge(() => '/home/joel/Downloads/vendorA3_SLI_ceva (2).pdf')
    const delivery = await deliver(bridge, 'vendorA3_SLI_ceva.pdf', bytes)
    expect(delivery.fileName).toBe('vendorA3_SLI_ceva (2).pdf')
  })

  it('reads a Windows path back to its file name', async () => {
    const bridge = fakeBridge(() => 'C:\\Users\\Firstname Lastname\\Downloads\\vendorA3_SLI_ceva.pdf')
    expect((await deliver(bridge, 'vendorA3_SLI_ceva.pdf', bytes)).fileName).toBe('vendorA3_SLI_ceva.pdf')
  })

  it('hands the bridge the bytes it was given', async () => {
    const bridge = fakeBridge((name) => `/downloads/${name}`)
    await deliver(bridge, 'sheet.xlsx', bytes, XLSX_MIME)
    expect(vi.mocked(bridge.saveOutput).mock.calls[0][1]).toBe(bytes)
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

/**
 * Output names are built from an invoice number, an air waybill number or a shipper's
 * reference — none of which is constrained to characters a filesystem accepts.
 */
describe('safeFileName', () => {
  it('leaves an ordinary name alone', () => {
    expect(safeFileName('vendorA3_SLI_ceva.pdf')).toBe('vendorA3_SLI_ceva.pdf')
    expect(safeFileName('125-1234 5678_shippers-declaration.pdf')).toBe('125-1234 5678_shippers-declaration.pdf')
  })

  it('replaces separators rather than dropping them, so two references stay distinct', () => {
    // `SO/13310965` is an ordinary way to write a reference, and the desktop shell rejects
    // any name that is not a plain file name — correctly, but with a message that says
    // nothing about the reference that caused it.
    expect(safeFileName('SO/13310965_dg-checklist.md')).toBe('SO-13310965_dg-checklist.md')
    expect(safeFileName('SO\\13310965.md')).toBe('SO-13310965.md')
    expect(safeFileName('AB/CD.pdf')).not.toBe(safeFileName('ABCD.pdf'))
  })

  it('produces a name the desktop shell will accept', () => {
    // safe_join in the Tauri shell refuses a separator, a `..`, or anything with more than
    // one path component, so a name that still contains one is a failed save.
    for (const hostile of ['../../etc/passwd', 'a/b/c.pdf', '..\\..\\x.pdf', 'a..b.pdf']) {
      const safe = safeFileName(hostile)
      expect(safe).not.toContain('/')
      expect(safe).not.toContain('\\')
      expect(safe).not.toContain('..')
    }
  })

  it('strips the other characters Windows refuses', () => {
    expect(safeFileName('inv:oice*?"<>|.pdf')).toBe('inv-oice------.pdf')
  })

  it('strips control characters pasted in from a spreadsheet', () => {
    expect(safeFileName(`inv${String.fromCharCode(9)}oice.pdf`)).toBe('invoice.pdf')
    expect(safeFileName(`inv${String.fromCharCode(0)}oice.pdf`)).toBe('invoice.pdf')
  })

  it('falls back rather than producing a hidden, empty or reserved name', () => {
    expect(safeFileName('')).toBe('document')
    expect(safeFileName('   ')).toBe('document')
    expect(safeFileName('...')).toBe('document')
    expect(safeFileName('..')).toBe('document')
    // CON.pdf is not a file on Windows, whatever the extension says.
    expect(safeFileName('CON.pdf')).toBe('document')
    expect(safeFileName('lpt1')).toBe('document')
    // But a name that merely starts with those letters is fine.
    expect(safeFileName('console.pdf')).toBe('console.pdf')
  })

  it('bounds the length, keeping the extension and showing that it was cut', () => {
    const long = safeFileName(`${'x'.repeat(400)}.pdf`)
    expect(long.length).toBeLessThanOrEqual(120)
    // The extension has to survive: a name cut to `xxxx…` is a file the operating system
    // cannot open by type, and the desktop shell's duplicate handling splits on it.
    expect(long.endsWith('….pdf')).toBe(true)
    expect(safeFileName('y'.repeat(400))).toMatch(/^y+…$/)
  })

  it('is applied by deliver, so no call site has to remember', async () => {
    const bridge = fakeBridge((name) => `/downloads/${name}`)
    await deliver(bridge, 'SO/13310965_dg-checklist.md', bytes, 'text/markdown')
    expect(bridge.saveOutput).toHaveBeenCalledWith('SO-13310965_dg-checklist.md', bytes)
  })
})
