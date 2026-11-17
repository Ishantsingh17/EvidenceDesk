import {
  FileStack,
  FlaskConical,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** One-sentence purpose, used in page headers. */
  description: string
}

/** Main navigation (UI brief §4). Paths follow TRD §5.2. */
export const navItems: NavItem[] = [
  {
    path: '/dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'Workspace status, recent documents and recent questions.',
  },
  {
    path: '/documents',
    label: 'Documents',
    icon: FileStack,
    description: 'Upload, find and manage the PDFs the assistant answers from.',
  },
  {
    path: '/assistant',
    label: 'AI Assistant',
    icon: MessageSquareText,
    description: 'Ask questions over indexed documents and inspect the cited evidence.',
  },
  {
    path: '/evaluations',
    label: 'Evaluation',
    icon: FlaskConical,
    description: 'Measure retrieval and answer quality against the labelled dataset.',
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    description: 'Non-secret configuration and backend health.',
  },
]

export function navItemFor(pathname: string): NavItem | undefined {
  return navItems.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
}
