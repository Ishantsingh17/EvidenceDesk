import { Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { navItemFor } from '@/app/navigation'
import { useHealth } from '@/app/health-context'
import { InlineNotice } from '@/components/feedback/InlineNotice'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { DocumentDetailSheet, type DetailResult } from '@/features/documents/DocumentDetailSheet'
import { DocumentLibrary } from '@/features/documents/DocumentLibrary'
import { FileDropzone, type FileDropzoneHandle } from '@/features/documents/FileDropzone'
import { UploadQueue, type UploadItem } from '@/features/documents/UploadQueue'
import { useAsync } from '@/hooks/useAsync'
import { env } from '@/lib/env'
import { ApiError } from '@/services/api/client'
import { workspaceApi } from '@/services/workspace'
import type { DocumentStatus } from '@/types/api'

const PAGE_SIZE = 50
const loadSettings = (signal: AbortSignal) => workspaceApi.getSettingsStatus(signal)
let uploadCounter = 0

export function DocumentsPage() {
  const nav = navItemFor('/documents')!
  const { state: health } = useHealth()
  const dropzone = useRef<FileDropzoneHandle>(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<DocumentStatus | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [notice, setNotice] = useState<DetailResult | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timer)
  }, [search])

  const loadDocuments = useCallback(
    (signal: AbortSignal) =>
      workspaceApi.listDocuments(
        { pageSize: PAGE_SIZE, search: debouncedSearch || undefined, status: status === 'all' ? undefined : status },
        signal,
      ),
    [debouncedSearch, status],
  )
  const documents = useAsync(loadDocuments)
  const settings = useAsync(loadSettings)
  const limitMb = settings.state.status === 'success' ? settings.state.data.upload_limit_mb : null

  const evaluationRunning = health.phase === 'connected' && health.health.activity.evaluation_active
  const uploadDisabledReason = evaluationRunning ? 'Uploads are paused while an evaluation run is in progress.' : null

  const updateUpload = (id: string, patch: Partial<UploadItem>) =>
    setUploads((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  // Each file is an independent request with its own result (DD-01).
  const handleFiles = (files: File[]) => {
    files.forEach((file) => {
      const id = `upload-${++uploadCounter}`
      setUploads((items) => [{ id, name: file.name, size: file.size, phase: 'uploading' }, ...items])
      workspaceApi
        .uploadDocument(file)
        .then((accepted) => updateUpload(id, { phase: 'accepted', eventsUrl: accepted.events_url }))
        .catch((error: unknown) => {
          const apiError = error instanceof ApiError ? error : null
          const existing = apiError?.details.existing_filename
          updateUpload(id, {
            phase: 'rejected',
            error: {
              code: apiError?.code ?? 'UNKNOWN',
              message: apiError?.message ?? 'The upload failed.',
              existingFilename: typeof existing === 'string' ? existing : undefined,
            },
          })
        })
    })
  }

  const reloadDocuments = documents.reload

  return (
    <PageContainer>
      <PageHeader
        title={nav.label}
        description={nav.description}
        actions={
          <Button onClick={() => dropzone.current?.openFilePicker()} disabled={uploadDisabledReason !== null}>
            <Upload aria-hidden="true" />
            Upload documents
          </Button>
        }
      />

      {notice && (
        <InlineNotice tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
          {notice.text}
        </InlineNotice>
      )}

      <Card role="region" aria-labelledby="upload-heading">
        <CardHeader>
          <h2 id="upload-heading" className="text-section font-semibold">
            Upload
          </h2>
          <CardDescription>
            {env.apiMode === 'mock'
              ? 'Mock mode: files are checked in the browser (type, size, PDF signature, duplicate hash) and processing is simulated. Nothing is uploaded or indexed.'
              : 'Each file is validated by the backend before processing starts.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FileDropzone ref={dropzone} onFiles={handleFiles} disabledReason={uploadDisabledReason} limitMb={limitMb} />
          <UploadQueue
            items={uploads}
            onClearFinished={() => setUploads((items) => items.filter((i) => i.phase === 'uploading'))}
            onJobFinished={reloadDocuments}
          />
        </CardContent>
      </Card>

      <DocumentLibrary
        state={documents.state}
        onRetry={documents.reload}
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        onOpen={setOpenId}
        onUpload={() => dropzone.current?.openFilePicker()}
      />

      <DocumentDetailSheet
        documentId={openId}
        onClose={() => setOpenId(null)}
        onChanged={reloadDocuments}
        onDeleted={(result) => {
          setOpenId(null)
          setNotice(result)
          reloadDocuments()
        }}
      />
    </PageContainer>
  )
}
