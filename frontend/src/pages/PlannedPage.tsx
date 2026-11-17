import { ArrowLeft, Construction } from 'lucide-react'
import { Link } from 'react-router'

import type { NavItem } from '@/app/navigation'
import { EmptyState } from '@/components/feedback/EmptyState'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'

/** Honest page for a screen that is not built yet. Navigation works; nothing pretends to. */
export function PlannedPage({ item }: { item: NavItem }) {
  return (
    <PageContainer>
      <PageHeader title={item.label} description={item.description} />
      <EmptyState
        icon={Construction}
        title={`The ${item.label} screen is not built yet`}
        description="It is planned for the next build. Nothing on this page works yet, so no data is shown."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">
              <ArrowLeft aria-hidden="true" />
              Back to overview
            </Link>
          </Button>
        }
      />
    </PageContainer>
  )
}
