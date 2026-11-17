import { ArrowUp, Info } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const MIN_CHARS = 3
const MAX_CHARS = 1000

export function QuestionComposer({
  busy,
  onSubmit,
  value,
  onChange,
}: {
  busy: boolean
  onSubmit: (question: string) => void
  value: string
  onChange: (value: string) => void
}) {
  const [touched, setTouched] = useState(false)
  const trimmed = value.trim()
  const tooShort = trimmed.length < MIN_CHARS
  const tooLong = value.length > MAX_CHARS
  const invalid = tooShort || tooLong

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    setTouched(true)
    if (!invalid && !busy) onSubmit(trimmed)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit()
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Ask a question">
      <label htmlFor="question" className="font-medium">
        Your question
      </label>
      <div className="relative">
        <Textarea
          id="question"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="For example: What three records are compared during three-way matching?"
          aria-invalid={touched && invalid ? true : undefined}
          aria-describedby="question-help"
          className="min-h-24 resize-y pr-14 text-body"
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || invalid}
          aria-label={busy ? 'Answering…' : 'Ask question'}
          className="absolute right-2 bottom-2"
        >
          <ArrowUp aria-hidden="true" />
        </Button>
      </div>
      <div id="question-help" className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-caption">
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          Each question is answered independently; earlier questions are not used as context.
        </p>
        <p className={cn('tabular-nums text-muted-foreground', tooLong && 'font-medium text-danger')}>
          {touched && tooShort && !busy ? `At least ${MIN_CHARS} characters. ` : ''}
          {value.length} / {MAX_CHARS}
          <span className="ml-3 hidden sm:inline">Ctrl + Enter to ask</span>
        </p>
      </div>
    </form>
  )
}
