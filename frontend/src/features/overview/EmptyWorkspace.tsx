import { Upload } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const steps = [
  { title: 'Upload documents', text: 'Add text-based PDFs. Each one is checked, split into passages and indexed.' },
  { title: 'Ask a question', text: 'The assistant answers from the indexed passages and cites its sources.' },
  { title: 'Run an evaluation', text: 'Measure retrieval and answer quality against the labelled dataset.' },
]

/** Shown on the Overview when the workspace has no documents yet. */
export function EmptyWorkspace({ className }: { className?: string }) {
  return (
    <Card role="region" aria-labelledby="empty-workspace-heading" className={className} data-testid="empty-workspace">
      <CardContent className="space-y-6">
        <div className="space-y-1">
          <h2 id="empty-workspace-heading" className="text-section font-semibold">
            Your workspace is empty
          </h2>
          <p className="max-w-prose text-muted-foreground">
            Start by uploading the documents you want answers from. Nothing else works until at least one document is
            indexed.
          </p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="space-y-1.5 rounded-lg border bg-muted/40 p-4">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <p className="font-medium">{step.title}</p>
              <p className="text-caption text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
        <Button asChild>
          <Link to="/documents">
            <Upload aria-hidden="true" />
            Upload documents
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
