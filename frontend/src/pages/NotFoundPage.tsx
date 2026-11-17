import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <PageContainer>
      <PageHeader title="Page not found" description="This address does not match any page." />
      <EmptyState
        icon={SearchX}
        title="Nothing here"
        description="Check the address, or go back to the overview."
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
