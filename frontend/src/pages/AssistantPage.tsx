import { FileStack, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { navItemFor } from '@/app/navigation'
import { InlineNotice } from '@/components/feedback/InlineNotice'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AnswerView } from '@/features/assistant/AnswerView'
import { CitedSources } from '@/features/assistant/CitedSources'
import { QueryHistory } from '@/features/assistant/QueryHistory'
import { QueryTimeline } from '@/features/assistant/QueryTimeline'
import { QuestionComposer } from '@/features/assistant/QuestionComposer'
import { RetrievalDetails } from '@/features/assistant/RetrievalDetails'
import { exampleQuestions } from '@/features/assistant/suggestions'
import { useAsync } from '@/hooks/useAsync'
import { useEventTimeline } from '@/hooks/useEventTimeline'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { env } from '@/lib/env'
import { initialTimeline, queryStages, type TimelineStage } from '@/lib/timeline'
import { ApiError } from '@/services/api/client'
import { workspaceApi } from '@/services/workspace'
import type { QueryDetail } from '@/types/api'

const simulated = env.apiMode === 'mock'
const loadHistory = (signal: AbortSignal) => workspaceApi.listQueries(20, signal)

/** Rebuilds a finished timeline from a stored result (used when reopening history). */
function storedStages(q: QueryDetail): TimelineStage[] {
  const skippedGeneration =
    q.abstention_reason === 'no_retrieval_results' || q.abstention_reason === 'below_evidence_threshold'
  const m = q.metrics
  const details: Record<string, Record<string, unknown>> = {
    query_embedding: { duration_ms: m.query_embedding_duration_ms },
    retrieval: { retrieved_count: m.retrieved_count, duration_ms: m.retrieval_duration_ms },
    context_preparation: { evidence_count: m.evidence_count, threshold_applied: q.retrieval_details.threshold_applied },
    generation: { model_name: m.model_name, duration_ms: m.generation_duration_ms },
    citation_validation: { citation_count: q.citations.length, flag_for_review: q.flag_for_review },
  }
  return initialTimeline(queryStages).stages.map((s) => {
    const skipped = skippedGeneration && (s.key === 'generation' || s.key === 'citation_validation')
    return { ...s, state: q.status === 'failed' ? 'pending' : skipped ? 'skipped' : 'completed', details: details[s.key] ?? null }
  })
}

interface Session {
  queryId: string
  /** Set while following a new question's events; null for a reopened question. */
  eventsUrl: string | null
}

export function AssistantPage() {
  const nav = navItemFor('/assistant')!
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [question, setQuestion] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<ApiError | null>(null)
  const [result, setResult] = useState<QueryDetail | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const history = useAsync(loadHistory)
  const reloadHistory = history.reload

  const fetchResult = useCallback(
    (queryId: string) => {
      workspaceApi
        .getQuery(queryId)
        .then((q) => {
          setResult(q)
          reloadHistory()
        })
        .catch((error: unknown) =>
          setResultError(error instanceof ApiError ? error.message : 'The answer could not be loaded.'),
        )
    },
    [reloadHistory],
  )

  const onTerminal = useCallback(() => {
    if (session) fetchResult(session.queryId)
  }, [session, fetchResult])

  const live = useEventTimeline(workspaceApi.subscribeQueryEvents, queryStages, session?.eventsUrl ?? null, onTerminal)

  const ask = async (text: string) => {
    setSubmitError(null)
    setResult(null)
    setResultError(null)
    setSubmitting(true)
    try {
      const accepted = await workspaceApi.submitQuery({ question: text, document_ids: null })
      setSession({ queryId: accepted.query_id, eventsUrl: accepted.events_url })
      reloadHistory()
    } catch (error) {
      setSession(null)
      setSubmitError(error instanceof ApiError ? error : new ApiError(null, 'UNKNOWN', 'The question could not be sent.'))
    } finally {
      setSubmitting(false)
    }
  }

  const reopen = (queryId: string) => {
    setSubmitError(null)
    setResultError(null)
    setResult(null)
    setSession({ queryId, eventsUrl: null })
    fetchResult(queryId)
  }

  // Links such as /assistant?query=<id> (from the Overview) reopen that question once.
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedQuery = searchParams.get('query')
  useEffect(() => {
    if (!linkedQuery) return
    setSearchParams({}, { replace: true })
    reopen(linkedQuery)
    // reopen is recreated each render; running once per linked id is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedQuery])

  const goToSource = (label: string) => {
    const card = document.getElementById(`citation-${label}`)
    card?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
    card?.focus({ preventScroll: true })
    setHighlighted(label)
    clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlighted(null), 1600)
  }

  const following = session?.eventsUrl != null
  const running = submitting || (following && live.timeline.outcome === null && !live.streamError)
  const stages = following ? live.timeline.stages : result ? storedStages(result) : initialTimeline(queryStages).stages
  const waitingForResult = session !== null && result === null && !resultError

  const timelineCard = (
    <Card>
      <CardContent className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="text-section font-semibold">Query processing</h2>
          <p className="text-caption text-muted-foreground">
            {session ? 'Stages update as the backend reports them.' : 'What happens when you ask a question.'}
          </p>
        </div>
        <QueryTimeline stages={stages} simulated={simulated && following} />
        {following && live.streamError && !live.timeline.outcome && (
          <p className="text-caption text-danger">{live.streamError.message} Fetching the stored result instead.</p>
        )}
      </CardContent>
    </Card>
  )

  return (
    <PageContainer>
      <PageHeader title={nav.label} description={nav.description} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="space-y-4">
              <QuestionComposer busy={running} value={question} onChange={setQuestion} onSubmit={ask} />
              {!session && !submitError && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
                    <Sparkles aria-hidden="true" className="size-3.5" />
                    Try a question from the test dataset
                  </p>
                  <ul className="flex flex-wrap gap-2" data-testid="example-questions">
                    {exampleQuestions.map((e) => (
                      <li key={e.question}>
                        <button
                          type="button"
                          onClick={() => {
                            setQuestion(e.question)
                            void ask(e.question)
                          }}
                          className="max-w-full rounded-lg border bg-card px-2.5 py-1.5 text-left text-caption outline-none transition-colors hover:border-primary/30 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="block font-medium text-foreground">{e.question}</span>
                          <span className="block text-muted-foreground">{e.hint}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {submitError && <SubmitErrorNotice error={submitError} onDismiss={() => setSubmitError(null)} />}

          {/* On narrow screens the timeline sits right under the composer. */}
          {session && <div className="lg:hidden">{timelineCard}</div>}

          {session && (
            <Card>
              <CardContent className="space-y-6">
                {resultError && <InlineNotice tone="danger" title="Answer unavailable">{resultError}</InlineNotice>}
                {waitingForResult && <AnswerSkeleton />}
                {result && (
                  <>
                    <AnswerView query={result} onMarker={goToSource} />
                    <CitedSources citations={result.citations} highlighted={highlighted} />
                    <RetrievalDetails details={result.retrieval_details} />
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20" aria-label="Processing and history">
          <div className="hidden lg:block">{timelineCard}</div>
          <Card>
            <CardContent>
              <QueryHistory state={history.state} activeId={session?.queryId ?? null} onOpen={reopen} onRetry={history.reload} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageContainer>
  )
}

function SubmitErrorNotice({ error, onDismiss }: { error: ApiError; onDismiss: () => void }) {
  if (error.code === 'NO_INDEXED_DOCUMENTS') {
    return (
      <InlineNotice tone="warning" title="No indexed documents" onDismiss={onDismiss}>
        <p>Upload and index at least one document before asking questions.</p>
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link to="/documents">
            <FileStack aria-hidden="true" />
            Go to documents
          </Link>
        </Button>
      </InlineNotice>
    )
  }
  const title =
    error.code === 'MOCK_QUESTION_UNSUPPORTED'
      ? 'No prepared answer in mock mode'
      : error.isNotAvailable
        ? 'The assistant is not available yet'
        : 'The question could not be sent'
  return (
    <InlineNotice tone={error.code === 'MOCK_QUESTION_UNSUPPORTED' ? 'info' : 'danger'} title={title} onDismiss={onDismiss}>
      {error.isNotAvailable ? 'The backend does not answer questions yet.' : error.message}
    </InlineNotice>
  )
}

function AnswerSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Waiting for the answer">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-3/4" />
      <div className="grid gap-3 pt-2 md:grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  )
}
