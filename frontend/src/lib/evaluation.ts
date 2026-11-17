// Evaluation vocabulary and metric definitions from docs/04-BACKEND-SCHEMA.md §2.8 and §9.

import type { EvaluationCategory } from '@/types/api'

export const categoryOrder: EvaluationCategory[] = [
  'direct',
  'multi_document',
  'ambiguous',
  'conflicting_documents',
  'unanswerable',
  'out_of_scope',
  'prompt_injection',
]

export const categoryLabels: Record<EvaluationCategory, string> = {
  direct: 'Direct',
  multi_document: 'Multi-document',
  ambiguous: 'Ambiguous',
  conflicting_documents: 'Conflicting documents',
  unanswerable: 'Unanswerable',
  out_of_scope: 'Out of scope',
  prompt_injection: 'Prompt injection',
}

export type ScoringMethod = 'rule_based' | 'human_reviewed' | 'measured'

export const methodLabels: Record<ScoringMethod, string> = {
  rule_based: 'Rule-based',
  human_reviewed: 'Human-reviewed',
  measured: 'Measured',
}

export interface MetricDefinition {
  name: string
  definition: string
}

export const metricGroups: { method: ScoringMethod; description: string; metrics: MetricDefinition[] }[] = [
  {
    method: 'rule_based',
    description: 'Calculated automatically. Retrieval relevance is judged per unique document and page.',
    metrics: [
      { name: 'Precision@k', definition: 'Share of retrieved pages that are expected sources.' },
      { name: 'Recall@k', definition: 'Share of expected pages that were retrieved.' },
      { name: 'MRR', definition: 'How high the first relevant page ranks, averaged over cases.' },
      { name: 'Abstention correctness', definition: 'Abstains when it should, and answers when it should.' },
      { name: 'Citation source match', definition: 'Every cited page is one of the expected sources.' },
      { name: 'Prompt-injection check', definition: 'The answer contains none of the forbidden strings.' },
    ],
  },
  {
    method: 'human_reviewed',
    description: 'Rated in the app by a reviewer. Always shown with the number of reviewed cases.',
    metrics: [
      { name: 'Answer correctness', definition: 'The answer matches the expected answer and criteria.' },
      { name: 'Faithfulness', definition: 'Every claim is supported by the retrieved passages.' },
      { name: 'Citation validity', definition: 'Each cited passage supports the claim it is attached to.' },
    ],
  },
  {
    method: 'measured',
    description: 'Timed by the backend for completed cases.',
    metrics: [
      { name: 'Median latency', definition: 'Middle end-to-end answer time across completed cases.' },
      { name: 'p95 latency', definition: '95 in every 100 completed cases were answered within this time.' },
    ],
  },
]
