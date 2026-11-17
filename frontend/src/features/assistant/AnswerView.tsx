import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react'
import { motion } from 'motion/react'
import { Fragment, useState } from 'react'

import { DemoDataTag } from '@/components/DemoDataTag'
import { InlineNotice } from '@/components/feedback/InlineNotice'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime, formatDuration } from '@/lib/format'
import { fadeInVariants } from '@/lib/motion'
import { queryStatus } from '@/lib/status'
import { ApiError } from '@/services/api/client'
import { workspaceApi } from '@/services/workspace'
import type { AbstentionReason, FeedbackRating, QueryDetail, ReviewReason } from '@/types/api'

const abstentionText: Record<AbstentionReason, string> = {
  no_retrieval_results: 'No passages were found in the indexed documents.',
  below_evidence_threshold: 'The closest passages were not similar enough to count as evidence.',
  model_reported_insufficient: 'The retrieved passages do not contain the information needed to answer.',
  no_valid_citations: 'The answer did not cite any retrieved source, so it is not shown as grounded.',
}

const reviewText: Record<ReviewReason, string> = {
  MODEL_FLAGGED: 'The model reported uncertainty, ambiguity or conflicting sources.',
  UNKNOWN_SOURCE_LABEL: 'The answer referred to a source that was not retrieved; that reference was removed.',
  UNCITED_ANSWER: 'The answer had no valid citations.',
}

const errorText: Record<string, string> = {
  GROQ_TIMEOUT: 'The language model did not respond in time. Ask the question again.',
  GROQ_RATE_LIMITED: 'The language model is rate-limited right now. Wait a moment and ask again.',
  GROQ_AUTHENTICATION_FAILED: 'The backend could not authenticate with the language model provider.',
  LLM_PROVIDER_ERROR: 'The language model provider returned an error. Ask the question again.',
  LLM_RESPONSE_INVALID: 'The language model returned an answer in an unexpected format, so it is not shown.',
  QUERY_INTERRUPTED: 'The backend restarted while answering. Ask the question again.',
}

/** Renders [S1] markers as links to their citation cards. Unknown labels stay as text. */
function AnswerText({ text, citedLabels, onMarker }: { text: string; citedLabels: Set<string>; onMarker: (label: string) => void }) {
  const parts = text.split(/(\[S\d+\])/g)
  return (
    <p className="leading-7 text-pretty" data-testid="answer-text">
      {parts.map((part, i) => {
        const label = /^\[(S\d+)\]$/.exec(part)?.[1]
        if (!label || !citedLabels.has(label)) return <Fragment key={i}>{part}</Fragment>
        return (
          <button
            key={i}
            type="button"
            onClick={() => onMarker(label)}
            aria-label={`Go to source ${label}`}
            className="ml-1 inline-flex h-5 items-center rounded-sm bg-accent px-1 align-[1px] text-caption font-semibold text-accent-foreground outline-none hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </button>
        )
      })}
    </p>
  )
}

export function AnswerView({ query, onMarker }: { query: QueryDetail; onMarker: (label: string) => void }) {
  const cited = new Set(query.citations.map((c) => c.citation_id))
  const status = queryStatus(query)

  return (
    <motion.section
      variants={fadeInVariants}
      initial="initial"
      animate="animate"
      aria-labelledby="answer-heading"
      data-testid="answer"
      data-status={query.status}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="answer-heading" className="text-section font-semibold">Answer</h2>
        <StatusBadge status={status} />
        <DemoDataTag />
      </div>
      <p className="font-medium text-muted-foreground">“{query.question}”</p>

      {query.status === 'failed' ? (
        <InlineNotice tone="danger" title="No answer">
          {(query.error_code && errorText[query.error_code]) ?? query.error_message ?? 'The question could not be answered.'}
        </InlineNotice>
      ) : (
        <>
          {query.flag_for_review && (
            <InlineNotice tone="warning" title="Flagged for review">
              <ul className="list-disc space-y-0.5 pl-4">
                {query.review_reasons.map((r) => (
                  <li key={r}>{reviewText[r]}</li>
                ))}
              </ul>
              Check the cited sources before relying on this answer.
            </InlineNotice>
          )}

          {query.status === 'insufficient_evidence' && (
            <InlineNotice tone="warning" title="Insufficient evidence">
              {query.abstention_reason ? abstentionText[query.abstention_reason] : null} The assistant does not
              guess when the documents do not support an answer.
            </InlineNotice>
          )}

          {query.answer && query.status !== 'insufficient_evidence' && (
            <AnswerText text={query.answer} citedLabels={cited} onMarker={onMarker} />
          )}
        </>
      )}

      {!query.retrieval_details.evidence_threshold_calibrated && query.status !== 'failed' && (
        <InlineNotice tone="info" title="Evidence threshold not calibrated yet">
          Every retrieved passage is passed to the model. Abstention currently relies on the model's own check and
          the citation rules.
        </InlineNotice>
      )}

      <AnswerFooter query={query} />
    </motion.section>
  )
}

function AnswerFooter({ query }: { query: QueryDetail }) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<{ rating: FeedbackRating } | { error: string } | null>(null)

  const copy = async () => {
    if (!query.answer) return
    try {
      await navigator.clipboard.writeText(query.answer)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const rate = async (rating: FeedbackRating) => {
    try {
      await workspaceApi.sendFeedback(query.id, rating)
      setFeedback({ rating })
    } catch (error) {
      setFeedback({ error: error instanceof ApiError ? error.message : 'Feedback could not be saved.' })
    }
  }

  const total = query.metrics.total_duration_ms
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <p className="text-caption text-muted-foreground">
        {formatDateTime(query.created_at)}
        {total !== null && `, answered in ${formatDuration(total)}`}
        {query.metrics.model_name && `, ${query.metrics.model_name}`}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {query.answer && query.status === 'completed' && (
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy answer'}
          </Button>
        )}
        {feedback && 'rating' in feedback ? (
          <span role="status" className="px-2 text-caption text-muted-foreground">
            Thanks, feedback recorded.
          </span>
        ) : (
          <>
            <Button variant="ghost" size="icon-sm" onClick={() => rate('helpful')} aria-label="Helpful answer">
              <ThumbsUp aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => rate('not_helpful')} aria-label="Unhelpful answer">
              <ThumbsDown aria-hidden="true" />
            </Button>
          </>
        )}
        {feedback && 'error' in feedback && <span className="text-caption text-danger">{feedback.error}</span>}
      </div>
    </div>
  )
}
