import { FileUp } from 'lucide-react'
import { useImperativeHandle, useRef, useState, type DragEvent, type Ref } from 'react'

import { cn } from '@/lib/utils'

export interface FileDropzoneHandle {
  openFilePicker: () => void
}

/** Drag-and-drop area with a browse fallback. Accepts several files; each is uploaded on its own. */
export function FileDropzone({
  ref,
  onFiles,
  disabledReason,
  limitMb,
}: {
  ref?: Ref<FileDropzoneHandle>
  onFiles: (files: File[]) => void
  disabledReason: string | null
  limitMb: number | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const disabled = disabledReason !== null

  useImperativeHandle(ref, () => ({ openFilePicker: () => inputRef.current?.click() }))

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!disabled) onFiles([...event.dataTransfer.files])
  }

  return (
    <div
      data-testid="dropzone"
      data-dragging={dragging}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
        dragging ? 'border-primary bg-accent' : 'border-input bg-muted/40',
        disabled && 'opacity-60',
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-card text-primary shadow-card">
        <FileUp aria-hidden="true" className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">
          Drag PDFs here, or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
          >
            browse files
          </button>
        </p>
        <p className="text-caption text-muted-foreground">
          Text-based PDFs only{limitMb ? `, up to ${limitMb} MB each` : ''}. Scanned PDFs need OCR, which is not
          supported.
        </p>
        {disabledReason && <p className="text-caption font-medium text-warning">{disabledReason}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}
