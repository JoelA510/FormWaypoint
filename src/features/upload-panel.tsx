import { useCallback, useRef, useState } from 'react'
import { Button, Card, CardBody, CardHeader } from '../components/ui'
import { ItemMasterWorkbookError, parseCiplFile } from '../domain/cipl'
import type { ParsedCipl } from '../domain/types'

export function UploadPanel({
  onParsed,
  busy,
}: {
  onParsed: (parsed: ParsedCipl) => void
  busy: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [showImporter, setShowImporter] = useState(false)
  const [dragging, setDragging] = useState(false)
  // The parse itself runs here, before App learns anything, so App's `busy` cannot cover
  // it. Without this, a slow multi-page parse leaves the button live and accepting a second
  // file with no sign anything is happening.
  const [parsing, setParsing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const working = busy || parsing

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (working || !files?.length) return
      setError(null)
      setShowImporter(false)
      if (files.length > 1) {
        setError('Choose one shipment file. Combine separate invoice and packing list PDFs into one PDF before uploading.')
        return
      }
      const file = files[0]
      if (!/\.(pdf|xlsx)$/i.test(file.name)) {
        setShowImporter(true)
        setError(
          'That is not a PDF or a .xlsx workbook. Upload the combined commercial invoice and packing ' +
            'list, or the Commercial Invoice form.',
        )
        return
      }
      setParsing(true)
      try {
        const parsed = await parseCiplFile(file.name, await file.arrayBuffer())
        if (!parsed.lines.length) {
          setError(
            `No merchandise lines were found in ${file.name}. The supported layouts are a combined ` +
              'commercial invoice and packing list, or the Commercial Invoice form; ' +
              'another format needs its own parser.',
          )
          return
        }
        onParsed(parsed)
      } catch (error) {
        setShowImporter(error instanceof ItemMasterWorkbookError || /\.xlsx$/i.test(file.name))
        setError(error instanceof Error ? error.message : 'That file could not be read.')
      } finally {
        setParsing(false)
      }
    },
    [onParsed, working],
  )

  return (
    <Card>
      <CardHeader
        title="Upload the CIPL"
        description="Choose a combined invoice and packing list PDF, or a supported commercial invoice in PDF or Excel format. The file is read on this machine."
      />
      <CardBody>
        {error && <div role="alert" className="mb-3 rounded-md border border-[var(--color-block)] px-3 py-2 text-sm">
          {error} {showImporter && <a className="underline" href="#item-master-file">Import an item master</a>}
        </div>}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void handleFiles(e.dataTransfer.files)
          }}
          className={[
            'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
            dragging ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-line-strong)]',
          ].join(' ')}
        >
          <p className="text-sm text-[var(--color-ink-soft)]">Drop the CIPL PDF or Commercial Invoice workbook here</p>
          <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={working}>
            {working ? 'Reading…' : 'Choose a file'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
            hidden
            onChange={(e) => {
              void handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <p className="max-w-md text-xs text-[var(--color-ink-faint)]">
            PDFs must contain selectable text. Scanned images are not supported.
          </p>
        </div>
      </CardBody>
    </Card>
  )
}
