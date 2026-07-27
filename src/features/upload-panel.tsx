import { useCallback, useRef, useState } from 'react'
import { Button, Card, CardBody, CardHeader } from '../components/ui'
import { parseCipl } from '../domain/cipl'
import type { ParsedCipl } from '../domain/types'

export function UploadPanel({
  onParsed,
  onError,
  busy,
}: {
  onParsed: (parsed: ParsedCipl) => void
  onError: (message: string) => void
  busy: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        onError('That is not a PDF. Upload the combined commercial invoice and packing list.')
        return
      }
      try {
        const parsed = await parseCipl(file.name, await file.arrayBuffer())
        if (!parsed.lines.length) {
          onError(
            `No merchandise lines were found in ${file.name}. This parser reads the Omron combined ` +
              'invoice and packing list layout; another format needs its own parser.',
          )
          return
        }
        onParsed(parsed)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'That PDF could not be read.')
      }
    },
    [onParsed, onError],
  )

  return (
    <Card>
      <CardHeader
        title="Upload the CIPL"
        description="The combined commercial invoice and packing list. It is read here on your machine and never uploaded."
      />
      <CardBody>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void handleFile(e.dataTransfer.files[0])
          }}
          className={[
            'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
            dragging ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-line-strong)]',
          ].join(' ')}
        >
          <p className="text-sm text-[var(--color-ink-soft)]">Drop the CIPL PDF here</p>
          <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Reading…' : 'Choose a PDF'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <p className="max-w-md text-xs text-[var(--color-ink-faint)]">
            The PDF needs a real text layer, which these documents have. Scanned images are not supported.
          </p>
        </div>
      </CardBody>
    </Card>
  )
}
