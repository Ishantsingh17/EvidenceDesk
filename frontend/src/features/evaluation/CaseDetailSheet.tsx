import { useCallback, useState, type FormEvent } from 'react'

import { ErrorState } from '@/components/feedback/ErrorState'
import { InlineNotice } from '@/components/feedback/InlineNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { CitedSources } from '@/features/assistant/CitedSources'
import { RetrievalDetails } from '@/features/assistant/RetrievalDetails'
import { useAsync } from '@/hooks/useAsync'
import { categoryLabels } from '@/lib/evaluation'
import { ApiError } from '@/services/api/client'
import { workspaceApi } from '@/services/workspace'
import type {
  CitationValidity,
  CorrectnessRating,
  EvaluationResultDetail,
  EvaluationReview,
  FaithfulnessRating,
} from '@/types/api'

const behaviourText: Record<string, string> = {
  answer: 'Answer with citations',
  qualified_answer: 'Answer with the ambiguity or conflict stated',
  abstain: 'Abstain: the documents do not contain the answer',
  refuse_unsafe_request: 'Refuse: the request asks for something that must not be provided',
}

export function CaseDetailSheet({
  runId,
  resultId,
  onClose,
  onReviewed,
}: {
  runId: string
  resultId: string | null
  onClose: () => void
  onReviewed: () => void
}) {
  return (
    <Sheet open={resultId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {resultId && <CaseBody key={resultId} runId={runId} resultId={resultId} onReviewed={onReviewed} />}
      </SheetContent>
    </Sheet>
  )
}

function CaseBody({ runId, resultId, onReviewed }: { runId: string; resultId: string; onReviewed: () => void }) {
  const load = useCallback((signal: AbortSignal) => workspaceApi.getEvaluationResult(runId, resultId, signal), [runId, resultId])
  const { state, reload } = useAsync(load)
  if (state.status === 'loading') {
    return (
      <div className="space-y-4 p-5" role="status" aria-label="Loading case">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="p-5">
        <SheetHeader className="p-0 pb-4">
          <SheetTitle>Case details</SheetTitle>
          <SheetDescription>The case could not be loaded.</SheetDescription>
        </SheetHeader>
        <ErrorState error={state.error} subject="this case" onRetry={reload} />
      </div>
    )
  }
  const c = state.data
  return (
    <div className="flex flex-col">
      <SheetHeader className="gap-1 border-b p-5 pr-12">
        <SheetTitle className="text-section">{c.case_key}</SheetTitle>
        <SheetDescription>
          {categoryLabels[c.category]}. Expected: {behaviourText[c.expected_behavior]}.
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-6 p-5">
        <section className="space-y-1">
          <h3 className="font-semibold">Question</h3>
          <p>{c.question}</p>
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold">Generated answer</h3>
          {c.execution_status === 'failed' ? (
            <InlineNotice tone="danger" title={c.failure_type === 'infrastructure' ? 'Infrastructure failure' : 'Pipeline failure'}>
              {c.error_message ?? c.error_code} {c.llm_attempt_count ? `(${c.llm_attempt_count} attempt(s))` : ''}
            </InlineNotice>
          ) : (
            <>
              <p className="leading-7" data-testid="case-answer">{c.answer}</p>
              {c.abstention_reason && <p className="text-caption text-muted-foreground">Abstention reason: {c.abstention_reason}</p>}
              {c.review_reasons.length > 0 && (
                <p className="text-caption text-warning">Flagged for review: {c.review_reasons.join(', ')}</p>
              )}
            </>
          )}
        </section>
        <section className="space-y-1 rounded-lg border bg-muted/40 p-3">
          <h3 className="font-semibold">Expected answer</h3>
          <p className="text-caption">{c.expected_answer}</p>
          {c.answer_criteria.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-caption text-muted-foreground">
              {c.answer_criteria.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <p className="text-caption text-muted-foreground">
            Expected pages:{' '}
            {c.expected_sources.length ? c.expected_sources.map((s) => `${s.filename} p.${s.page_number}`).join('; ') : 'none'}
          </p>
        </section>
        <CitedSources citations={c.citations} highlighted={null} />
        <RetrievalDetails
          details={{ top_k: c.retrieved_chunks.length, threshold_applied: c.retrieved_chunks.some((r) => !r.passed_threshold), max_distance: null, evidence_threshold_calibrated: true, chunks: c.retrieved_chunks }}
        />
        <ReviewForm result={c} onSaved={() => { reload(); onReviewed() }} />
      </div>
    </div>
  )
}

function RatingSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-caption font-medium">
        {label}
      </label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, text]) => (
            <SelectItem key={v} value={v}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Human review (schema §9.5): full = 1, partial = 0.5, none = 0, not applicable excluded. */
function ReviewForm({ result, onSaved }: { result: EvaluationResultDetail; onSaved: () => void }) {
  const existing = result.review
  const [correctness, setCorrectness] = useState<CorrectnessRating>(existing?.correctness_rating ?? 'correct')
  const [faithfulness, setFaithfulness] = useState<FaithfulnessRating>(existing?.faithfulness_rating ?? 'faithful')
  const [citations, setCitations] = useState<CitationValidity>(existing?.citation_validity ?? 'valid')
  const [comment, setComment] = useState(existing?.reviewer_comment ?? '')
  const [label, setLabel] = useState(existing?.reviewer_label ?? '')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  if (result.execution_status !== 'completed') {
    return <p className="text-caption text-muted-foreground">Failed cases have no answer to review.</p>
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    const review: EvaluationReview = {
      correctness_rating: correctness,
      faithfulness_rating: faithfulness,
      citation_validity: citations,
      reviewer_comment: comment.trim() || null,
      reviewer_label: label.trim() || null,
    }
    try {
      await workspaceApi.saveReview(result.result_id, review)
      setStatus({ ok: true, text: 'Review saved.' })
      onSaved()
    } catch (error) {
      setStatus({ ok: false, text: error instanceof ApiError ? error.message : 'The review could not be saved.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4" aria-labelledby="review-heading" data-testid="review-form">
      <div className="space-y-0.5">
        <h3 id="review-heading" className="font-semibold">
          Human review
        </h3>
        <p className="text-caption text-muted-foreground">Full = 1, partial = 0.5, none = 0; not applicable is excluded.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <RatingSelect id="rv-correct" label="Answer correctness" value={correctness} onChange={setCorrectness}
          options={[['correct', 'Correct'], ['partially_correct', 'Partially correct'], ['incorrect', 'Incorrect'], ['not_applicable', 'Not applicable']]} />
        <RatingSelect id="rv-faithful" label="Faithfulness" value={faithfulness} onChange={setFaithfulness}
          options={[['faithful', 'Faithful'], ['partially_faithful', 'Partially faithful'], ['unfaithful', 'Unfaithful'], ['not_applicable', 'Not applicable']]} />
        <RatingSelect id="rv-citation" label="Citation validity" value={citations} onChange={setCitations}
          options={[['valid', 'Valid'], ['partially_valid', 'Partially valid'], ['invalid', 'Invalid'], ['not_applicable', 'Not applicable']]} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rv-comment" className="text-caption font-medium">Comment</label>
        <Textarea id="rv-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={4000} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="rv-label" className="block text-caption font-medium">Reviewer initials (optional)</label>
          <Input id="rv-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className="w-40" />
        </div>
        <Button type="submit" disabled={saving}>{existing ? 'Update review' : 'Save review'}</Button>
      </div>
      {status && (
        <p role="status" className={status.ok ? 'text-caption text-success' : 'text-caption text-danger'}>
          {status.text}
        </p>
      )}
    </form>
  )
}
