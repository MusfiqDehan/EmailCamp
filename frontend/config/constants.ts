/**
 * Template and Campaign Management Constants
 */

export const TEMPLATE_CATEGORIES = [
  {
    value: 'welcome',
    label: 'Welcome',
    icon: '👋',
    color: 'bg-blue-100 text-blue-800',
    description: 'Welcome emails for new users or subscribers'
  },
  {
    value: 'newsletter',
    label: 'Newsletter',
    icon: '📧',
    color: 'bg-purple-100 text-purple-800',
    description: 'Regular newsletter communications'
  },
  {
    value: 'promotional',
    label: 'Promotional',
    icon: '🎁',
    color: 'bg-green-100 text-green-800',
    description: 'Marketing and promotional campaigns'
  },
  {
    value: 'transactional',
    label: 'Transactional',
    icon: '💳',
    color: 'bg-yellow-100 text-yellow-800',
    description: 'Transaction confirmations and receipts'
  },
  {
    value: 'follow_up',
    label: 'Follow-up',
    icon: '🔔',
    color: 'bg-orange-100 text-orange-800',
    description: 'Follow-up and reminder emails'
  },
  {
    value: 'event',
    label: 'Event',
    icon: '📅',
    color: 'bg-indigo-100 text-indigo-800',
    description: 'Event invitations and updates'
  },
  {
    value: 'announcement',
    label: 'Announcement',
    icon: '📢',
    color: 'bg-pink-100 text-pink-800',
    description: 'Important announcements and updates'
  },
  {
    value: 'other',
    label: 'Other',
    icon: '📄',
    color: 'bg-gray-100 text-gray-800',
    description: 'Miscellaneous templates'
  }
] as const;

export const APPROVAL_STATUS = {
  DRAFT: {
    value: 'DRAFT',
    label: 'Draft',
    color: 'bg-secondary text-secondary-foreground',
    icon: '📝'
  },
  PENDING_APPROVAL: {
    value: 'PENDING_APPROVAL',
    label: 'Pending Approval',
    color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    icon: '⏳'
  },
  // Backward-compatible alias for legacy callers
  PENDING: {
    value: 'PENDING_APPROVAL',
    label: 'Pending Approval',
    color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    icon: '⏳'
  },
  APPROVED: {
    value: 'APPROVED',
    label: 'Approved',
    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    icon: '✅'
  },
  REJECTED: {
    value: 'REJECTED',
    label: 'Rejected',
    color: 'bg-destructive/15 text-destructive',
    icon: '❌'
  }
} as const;

export const TEMPLATE_TYPES = {
  GLOBAL: {
    value: 'global',
    label: 'Global Templates',
    description: 'Platform-wide templates available to all organizations'
  },
  ORGANIZATION: {
    value: 'organization',
    label: 'My Templates',
    description: 'Organization-specific templates'
  }
} as const;

export const NOTIFICATION_TYPES = {
  TEMPLATE_UPDATE: {
    value: 'TEMPLATE_UPDATE',
    label: 'Template Updated',
    icon: '🔄',
    color: 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
  },
  APPROVAL_REQUEST: {
    value: 'APPROVAL_REQUEST',
    label: 'Approval Request',
    icon: '📋',
    color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
  },
  APPROVAL_APPROVED: {
    value: 'APPROVAL_APPROVED',
    label: 'Approved',
    icon: '✅',
    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  },
  APPROVAL_REJECTED: {
    value: 'APPROVAL_REJECTED',
    label: 'Rejected',
    icon: '❌',
    color: 'bg-destructive/15 text-destructive'
  }
} as const;

export const CAMPAIGN_STATUS = {
  DRAFT: {
    value: 'DRAFT',
    label: 'Draft',
    color: 'bg-secondary text-secondary-foreground'
  },
  SCHEDULED: {
    value: 'SCHEDULED',
    label: 'Scheduled',
    color: 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
  },
  SENDING: {
    value: 'SENDING',
    label: 'Sending',
    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  },
  // Backward-compatible alias
  RUNNING: {
    value: 'SENDING',
    label: 'Sending',
    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  },
  PAUSED: {
    value: 'PAUSED',
    label: 'Paused',
    color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  },
  SENT: {
    value: 'SENT',
    label: 'Sent',
    color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
  },
  // Backward-compatible alias
  COMPLETED: {
    value: 'SENT',
    label: 'Sent',
    color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
  },
  CANCELLED: {
    value: 'CANCELLED',
    label: 'Cancelled',
    color: 'bg-destructive/15 text-destructive'
  },
  FAILED: {
    value: 'FAILED',
    label: 'Failed',
    color: 'bg-destructive/15 text-destructive'
  }
} as const;
