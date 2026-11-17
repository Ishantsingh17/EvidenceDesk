import { ChevronRight, FlaskConical, MessageSquareText, Upload, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'

import { SectionCard } from './SectionCard'

interface QuickAction {
  to: string
  label: string
  description: string
  icon: LucideIcon
}

const actions: QuickAction[] = [
  {
    to: '/documents',
    label: 'Upload documents',
    description: 'Add text-based PDFs to the evidence base.',
    icon: Upload,
  },
  {
    to: '/assistant',
    label: 'Open AI Assistant',
    description: 'Ask a question and check the cited sources.',
    icon: MessageSquareText,
  },
  {
    to: '/evaluations',
    label: 'View evaluation',
    description: 'See retrieval and answer quality on the test dataset.',
    icon: FlaskConical,
  },
]

const MotionLink = motion.create(Link)

export function QuickActions({ className }: { className?: string }) {
  return (
    <SectionCard
      id="quick-actions"
      title="Quick actions"
      description="Go straight to the main workflows."
      className={className}
    >
      <ul className="space-y-2">
        {actions.map(({ to, label, description, icon: Icon }) => (
          <li key={to}>
            <MotionLink
              to={to}
              whileTap={{ scale: 0.99 }}
              className="group flex items-center gap-3 rounded-lg border bg-card p-3 outline-none transition-[border-color,box-shadow,background-color] hover:border-primary/30 hover:bg-accent/40 hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block text-caption text-muted-foreground">{description}</span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </MotionLink>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
