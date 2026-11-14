/**
 * Unified Declarative State Machines for EmailCamp Frontend (UX + DX + AX).
 *
 * Mirrors backend `apps/campaigns/state_machines.py` as the single source of truth
 * for state labels, descriptions, semantic Badge variants, allowed transitions,
 * interactive workflow states (campaign wizard, AI agent, realtime WebSocket),
 * and backward-compatible legacy status normalization.
 */

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'info'
  | 'warning'
  | 'purple';

export type StateCategory =
  | 'initial'
  | 'active'
  | 'pending'
  | 'paused'
  | 'terminal'
  | 'error'
  | 'suspended';

export type StateMachineDomain =
  | 'campaign'
  | 'delivery_log'
  | 'email_queue'
  | 'sending_domain'
  | 'sender_email'
  | 'template_approval'
  | 'contact'
  | 'provider_health'
  | 'mailbox_sync'
  | 'organization'
  | 'notification_type';

export interface StateDefinition {
  key: string;
  label: string;
  description: string;
  category: StateCategory;
  variant: BadgeVariant;
  isTerminal?: boolean;
  recoverable?: boolean;
  recoveryHint?: string;
  pulse?: boolean;
}

export interface AllowedActionDescriptor {
  action: string;
  label: string;
  description: string;
  from_states?: string[];
  to_state: string;
  requires_confirmation?: boolean;
  confirmation_prompt?: string;
  method?: string;
  endpoint?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary';
}

// =============================================================================
// 1. ENTITY STATE DEFINITIONS
// =============================================================================

export const CAMPAIGN_STATES: Record<string, StateDefinition> = {
  DRAFT: {
    key: 'DRAFT',
    label: 'Draft',
    description: 'Campaign is being authored and has not been queued yet.',
    category: 'initial',
    variant: 'secondary',
    recoverable: true,
  },
  SCHEDULED: {
    key: 'SCHEDULED',
    label: 'Scheduled',
    description: 'Scheduled for automatic launch at the chosen date & time.',
    category: 'pending',
    variant: 'info',
    recoverable: true,
  },
  SENDING: {
    key: 'SENDING',
    label: 'Sending',
    description: 'Actively dispatching emails to recipients.',
    category: 'active',
    variant: 'success',
    pulse: true,
    recoverable: true,
    recoveryHint: 'Pause sending, cancel, or reset to Draft if stalled.',
  },
  PAUSED: {
    key: 'PAUSED',
    label: 'Paused',
    description: 'Dispatch paused; resume continues with remaining unsent recipients.',
    category: 'paused',
    variant: 'warning',
    recoverable: true,
  },
  SENT: {
    key: 'SENT',
    label: 'Sent',
    description: 'Campaign dispatch completed.',
    category: 'terminal',
    variant: 'purple',
    isTerminal: true,
    recoveryHint: 'Duplicate this campaign to send a new copy.',
  },
  CANCELLED: {
    key: 'CANCELLED',
    label: 'Cancelled',
    description: 'Stopped prior to completion.',
    category: 'terminal',
    variant: 'destructive',
    recoverable: true,
    recoveryHint: 'Reset to Draft to rework and relaunch, or duplicate.',
  },
  FAILED: {
    key: 'FAILED',
    label: 'Failed',
    description: 'Campaign failed during sender validation or provider dispatch.',
    category: 'error',
    variant: 'destructive',
    recoverable: true,
    recoveryHint: 'Fix sender domain/provider issues, then Reset to Draft.',
  },
};

export const DELIVERY_LOG_STATES: Record<string, StateDefinition> = {
  QUEUED: {
    key: 'QUEUED',
    label: 'Queued',
    description: 'Queued for provider dispatch.',
    category: 'initial',
    variant: 'secondary',
  },
  SENT: {
    key: 'SENT',
    label: 'Sent',
    description: 'Accepted by upstream email provider.',
    category: 'pending',
    variant: 'info',
  },
  DELIVERED: {
    key: 'DELIVERED',
    label: 'Delivered',
    description: 'Confirmed delivered to recipient mailbox.',
    category: 'active',
    variant: 'success',
  },
  OPENED: {
    key: 'OPENED',
    label: 'Opened',
    description: 'Recipient opened the email.',
    category: 'active',
    variant: 'info',
  },
  CLICKED: {
    key: 'CLICKED',
    label: 'Clicked',
    description: 'Recipient clicked a tracked link.',
    category: 'active',
    variant: 'purple',
  },
  UNSUBSCRIBED: {
    key: 'UNSUBSCRIBED',
    label: 'Unsubscribed',
    description: 'Recipient opted out of future emails.',
    category: 'terminal',
    variant: 'warning',
    isTerminal: true,
  },
  BOUNCED: {
    key: 'BOUNCED',
    label: 'Bounced',
    description: 'Delivery bounced by recipient server.',
    category: 'error',
    variant: 'destructive',
    isTerminal: true,
  },
  COMPLAINED: {
    key: 'COMPLAINED',
    label: 'Complained',
    description: 'Recipient marked the email as spam.',
    category: 'error',
    variant: 'destructive',
    isTerminal: true,
  },
  FAILED: {
    key: 'FAILED',
    label: 'Failed',
    description: 'Failed to submit to provider.',
    category: 'error',
    variant: 'destructive',
    recoverable: true,
  },
};

export const EMAIL_QUEUE_STATES: Record<string, StateDefinition> = {
  PENDING: {
    key: 'PENDING',
    label: 'Pending',
    description: 'Waiting in queue for worker processing.',
    category: 'initial',
    variant: 'secondary',
  },
  RETRYING: {
    key: 'RETRYING',
    label: 'Retrying',
    description: 'Scheduled for automatic retry after transient error.',
    category: 'pending',
    variant: 'warning',
    pulse: true,
  },
  PROCESSING: {
    key: 'PROCESSING',
    label: 'Processing',
    description: 'Currently being sent by a worker.',
    category: 'active',
    variant: 'info',
    pulse: true,
  },
  SENT: {
    key: 'SENT',
    label: 'Sent',
    description: 'Successfully dispatched.',
    category: 'terminal',
    variant: 'success',
    isTerminal: true,
  },
  FAILED: {
    key: 'FAILED',
    label: 'Failed',
    description: 'Exceeded max retries or failed permanently.',
    category: 'error',
    variant: 'destructive',
    recoverable: true,
  },
  CANCELLED: {
    key: 'CANCELLED',
    label: 'Cancelled',
    description: 'Removed from queue before sending.',
    category: 'terminal',
    variant: 'outline',
    isTerminal: true,
  },
};

export const SENDING_DOMAIN_STATES: Record<string, StateDefinition> = {
  PENDING_DNS: {
    key: 'PENDING_DNS',
    label: 'Pending DNS',
    description: 'Publish the required DKIM/SPF/MAIL-FROM DNS records at your DNS provider.',
    category: 'initial',
    variant: 'warning',
    recoveryHint: 'Copy records and add them to DNS, then click Verify.',
  },
  PENDING_VERIFICATION: {
    key: 'PENDING_VERIFICATION',
    label: 'Verifying',
    description: 'Polling AWS SES for DNS propagation.',
    category: 'pending',
    variant: 'info',
    pulse: true,
  },
  VERIFIED: {
    key: 'VERIFIED',
    label: 'Verified',
    description: 'Domain DKIM verified and ready for sender identities.',
    category: 'active',
    variant: 'success',
  },
  FAILED: {
    key: 'FAILED',
    label: 'Failed',
    description: 'Verification timed out or failed.',
    category: 'error',
    variant: 'destructive',
    recoverable: true,
    recoveryHint: 'Check DNS records and click Retry Verification.',
  },
  SUSPENDED: {
    key: 'SUSPENDED',
    label: 'Suspended',
    description: 'Suspended by platform administrator.',
    category: 'suspended',
    variant: 'destructive',
    recoverable: true,
  },
  DISABLED: {
    key: 'DISABLED',
    label: 'Disabled',
    description: 'Disabled for sending.',
    category: 'terminal',
    variant: 'secondary',
    isTerminal: true,
  },
};

export const SENDER_EMAIL_STATES: Record<string, StateDefinition> = {
  ACTIVE: {
    key: 'ACTIVE',
    label: 'Active',
    description: 'Sender identity is active.',
    category: 'active',
    variant: 'success',
  },
  SUSPENDED: {
    key: 'SUSPENDED',
    label: 'Suspended',
    description: 'Suspended by platform administrator.',
    category: 'suspended',
    variant: 'destructive',
    recoverable: true,
  },
  DOMAIN_UNAVAILABLE: {
    key: 'DOMAIN_UNAVAILABLE',
    label: 'Domain Unavailable',
    description: 'Parent sending domain is not verified or is suspended.',
    category: 'paused',
    variant: 'warning',
    recoverable: true,
  },
};

export const TEMPLATE_APPROVAL_STATES: Record<string, StateDefinition> = {
  DRAFT: {
    key: 'DRAFT',
    label: 'Draft',
    description: 'Editable template draft not yet submitted for global approval.',
    category: 'initial',
    variant: 'secondary',
    recoverable: true,
  },
  PENDING_APPROVAL: {
    key: 'PENDING_APPROVAL',
    label: 'Pending Approval',
    description: 'Awaiting platform administrator review.',
    category: 'pending',
    variant: 'warning',
    pulse: true,
  },
  APPROVED: {
    key: 'APPROVED',
    label: 'Approved',
    description: 'Approved and published to organizations.',
    category: 'active',
    variant: 'success',
  },
  REJECTED: {
    key: 'REJECTED',
    label: 'Rejected',
    description: 'Returned with reviewer feedback; revise and resubmit.',
    category: 'error',
    variant: 'destructive',
    recoverable: true,
    recoveryHint: 'Edit template notes/content and submit for approval again.',
  },
};

export const CONTACT_STATES: Record<string, StateDefinition> = {
  PENDING: {
    key: 'PENDING',
    label: 'Pending',
    description: 'Awaiting opt-in confirmation.',
    category: 'pending',
    variant: 'info',
    recoverable: true,
  },
  ACTIVE: {
    key: 'ACTIVE',
    label: 'Active',
    description: 'Subscribed and eligible to receive campaigns.',
    category: 'active',
    variant: 'success',
  },
  UNSUBSCRIBED: {
    key: 'UNSUBSCRIBED',
    label: 'Unsubscribed',
    description: 'Opted out from marketing emails.',
    category: 'paused',
    variant: 'warning',
    recoverable: true,
  },
  BOUNCED: {
    key: 'BOUNCED',
    label: 'Bounced',
    description: 'Address bounced during delivery.',
    category: 'error',
    variant: 'destructive',
    recoverable: true,
  },
  COMPLAINED: {
    key: 'COMPLAINED',
    label: 'Complained',
    description: 'Marked message as spam; strictly suppressed.',
    category: 'error',
    variant: 'destructive',
  },
};

export const PROVIDER_HEALTH_STATES: Record<string, StateDefinition> = {
  UNKNOWN: {
    key: 'UNKNOWN',
    label: 'Unchecked',
    description: 'Run a health check to verify credentials.',
    category: 'initial',
    variant: 'secondary',
  },
  HEALTHY: {
    key: 'HEALTHY',
    label: 'Healthy',
    description: 'Provider connection and credentials verified.',
    category: 'active',
    variant: 'success',
  },
  DEGRADED: {
    key: 'DEGRADED',
    label: 'Degraded',
    description: 'Provider responding with intermittent issues.',
    category: 'paused',
    variant: 'warning',
  },
  UNHEALTHY: {
    key: 'UNHEALTHY',
    label: 'Unhealthy',
    description: 'Last health check failed.',
    category: 'error',
    variant: 'destructive',
    recoverable: true,
  },
};

export const MAILBOX_SYNC_STATES: Record<string, StateDefinition> = {
  IDLE: {
    key: 'IDLE',
    label: 'Synced',
    description: 'Mailbox synced and ready.',
    category: 'active',
    variant: 'success',
  },
  SYNCING: {
    key: 'SYNCING',
    label: 'Syncing',
    description: 'Fetching messages from IMAP server.',
    category: 'pending',
    variant: 'info',
    pulse: true,
  },
  ERROR: {
    key: 'ERROR',
    label: 'Sync Error',
    description: 'Last mailbox sync failed.',
    category: 'error',
    variant: 'destructive',
    recoverable: true,
  },
  DISABLED: {
    key: 'DISABLED',
    label: 'Disabled',
    description: 'Sync paused or disabled.',
    category: 'paused',
    variant: 'secondary',
    recoverable: true,
  },
};

export const ORGANIZATION_STATES: Record<string, StateDefinition> = {
  ACTIVE: {
    key: 'ACTIVE',
    label: 'Active',
    description: 'Organization workspace and email delivery are active.',
    category: 'active',
    variant: 'success',
  },
  SUSPENDED: {
    key: 'SUSPENDED',
    label: 'Email Suspended',
    description: 'Sending privileges suspended while workspace remains readable.',
    category: 'suspended',
    variant: 'warning',
    recoverable: true,
  },
  DEACTIVATED: {
    key: 'DEACTIVATED',
    label: 'Deactivated',
    description: 'Organization deactivated by platform administrator.',
    category: 'error',
    variant: 'destructive',
    recoverable: true,
  },
};

export const NOTIFICATION_TYPE_STATES: Record<string, StateDefinition> = {
  TEMPLATE_UPDATE: {
    key: 'TEMPLATE_UPDATE',
    label: 'Template Update',
    description: 'A global template you use has a newer version.',
    category: 'pending',
    variant: 'info',
  },
  APPROVAL_REQUEST: {
    key: 'APPROVAL_REQUEST',
    label: 'Approval Request',
    description: 'A global template was submitted for review.',
    category: 'pending',
    variant: 'purple',
  },
  APPROVAL_APPROVED: {
    key: 'APPROVAL_APPROVED',
    label: 'Approved',
    description: 'Template review approved.',
    category: 'active',
    variant: 'success',
  },
  APPROVAL_REJECTED: {
    key: 'APPROVAL_REJECTED',
    label: 'Rejected',
    description: 'Template review rejected.',
    category: 'error',
    variant: 'destructive',
  },
  CAMPAIGN_SENT: {
    key: 'CAMPAIGN_SENT',
    label: 'Campaign Sent',
    description: 'Campaign finished dispatching.',
    category: 'active',
    variant: 'purple',
  },
  CONTACT_ADDED: {
    key: 'CONTACT_ADDED',
    label: 'Contact Added',
    description: 'New subscriber added to your audience.',
    category: 'active',
    variant: 'success',
  },
};

const STATE_MAPS: Record<StateMachineDomain, Record<string, StateDefinition>> = {
  campaign: CAMPAIGN_STATES,
  delivery_log: DELIVERY_LOG_STATES,
  email_queue: EMAIL_QUEUE_STATES,
  sending_domain: SENDING_DOMAIN_STATES,
  sender_email: SENDER_EMAIL_STATES,
  template_approval: TEMPLATE_APPROVAL_STATES,
  contact: CONTACT_STATES,
  provider_health: PROVIDER_HEALTH_STATES,
  mailbox_sync: MAILBOX_SYNC_STATES,
  organization: ORGANIZATION_STATES,
  notification_type: NOTIFICATION_TYPE_STATES,
};

/**
 * Normalize legacy or lowercase aliases (e.g. 'running' -> 'SENDING', 'pending' -> 'PENDING_APPROVAL')
 * without breaking existing API or component callers.
 */
export function normalizeStateKey(domain: StateMachineDomain, rawStatus?: string | null): string {
  const upper = (rawStatus || '').trim().toUpperCase();
  if (!upper) return 'UNKNOWN';

  if (domain === 'campaign') {
    if (upper === 'RUNNING') return 'SENDING';
    if (upper === 'COMPLETED') return 'SENT';
  }
  if (domain === 'template_approval') {
    if (upper === 'PENDING') return 'PENDING_APPROVAL';
  }
  return upper;
}

export function getStateDefinition(domain: StateMachineDomain, rawStatus?: string | null): StateDefinition {
  const key = normalizeStateKey(domain, rawStatus);
  const map = STATE_MAPS[domain];
  if (map && map[key]) {
    return map[key];
  }
  return {
    key,
    label: key
      .toLowerCase()
      .split('_')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
      .join(' '),
    description: `State: ${key}`,
    category: 'pending',
    variant: 'outline',
  };
}

// =============================================================================
// 2. CAMPAIGN ACTION STATE TRANSITION MAP (UX CONTROLS)
// =============================================================================

export type CampaignActionKey = 'launch' | 'schedule' | 'pause' | 'resume' | 'cancel' | 'reset' | 'duplicate';

export const CAMPAIGN_ACTION_RULES: Record<CampaignActionKey, AllowedActionDescriptor & { from_states: string[] }> = {
  launch: {
    action: 'launch',
    label: 'Launch Now',
    description: 'Send campaign immediately.',
    from_states: ['DRAFT', 'SCHEDULED'],
    to_state: 'SENDING',
    requires_confirmation: true,
    confirmation_prompt: 'Launch this campaign now? Emails will begin dispatching to active contacts immediately.',
    variant: 'default',
  },
  schedule: {
    action: 'schedule',
    label: 'Schedule',
    description: 'Schedule campaign for a future date and time.',
    from_states: ['DRAFT'],
    to_state: 'SCHEDULED',
    requires_confirmation: false,
    variant: 'outline',
  },
  pause: {
    action: 'pause',
    label: 'Pause',
    description: 'Temporarily pause active sending.',
    from_states: ['SENDING'],
    to_state: 'PAUSED',
    requires_confirmation: false,
    variant: 'outline',
  },
  resume: {
    action: 'resume',
    label: 'Resume',
    description: 'Resume sending remaining emails.',
    from_states: ['PAUSED'],
    to_state: 'SENDING',
    requires_confirmation: false,
    variant: 'default',
  },
  cancel: {
    action: 'cancel',
    label: 'Cancel',
    description: 'Stop campaign permanently.',
    from_states: ['DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED', 'FAILED'],
    to_state: 'CANCELLED',
    requires_confirmation: true,
    confirmation_prompt: 'Cancel this campaign? Remaining unsent emails will not be delivered.',
    variant: 'destructive',
  },
  reset: {
    action: 'reset',
    label: 'Reset to Draft',
    description: 'Return campaign to editable Draft state.',
    from_states: ['SCHEDULED', 'SENDING', 'PAUSED', 'CANCELLED', 'FAILED'],
    to_state: 'DRAFT',
    requires_confirmation: true,
    confirmation_prompt: 'Reset this campaign back to Draft? You can edit and relaunch it afterward.',
    variant: 'outline',
  },
  duplicate: {
    action: 'duplicate',
    label: 'Duplicate',
    description: 'Create a new draft copy of this campaign.',
    from_states: ['DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED', 'SENT', 'CANCELLED', 'FAILED'],
    to_state: 'DRAFT',
    requires_confirmation: false,
    variant: 'outline',
  },
};

export function getAllowedCampaignActions(rawStatus?: string | null): Array<AllowedActionDescriptor> {
  const status = normalizeStateKey('campaign', rawStatus);
  return Object.values(CAMPAIGN_ACTION_RULES).filter((rule) => rule.from_states.includes(status));
}

// =============================================================================
// 3. INTERACTIVE UI STATE MACHINES (WIZARD, AGENT, REALTIME WEBSOCKET)
// =============================================================================

export type AgentSessionState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

export type RealtimeConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export const AGENT_STATE_META: Record<AgentSessionState, { label: string; description: string; variant: BadgeVariant }> = {
  idle: { label: 'Ready', description: 'Ask the AI agent to create contacts, manage lists, or update statuses.', variant: 'secondary' },
  listening: { label: 'Listening', description: 'Voice capture active...', variant: 'destructive' },
  processing: { label: 'Thinking', description: 'Interpreting prompt and executing action...', variant: 'info' },
  success: { label: 'Completed', description: 'Action completed successfully.', variant: 'success' },
  error: { label: 'Needs attention', description: 'Could not complete the request.', variant: 'destructive' },
};

export interface CampaignWizardValidationInput {
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  html_content: string;
  contact_list_ids: string[];
  send_immediately: boolean;
  scheduled_at: string;
}

export interface WizardStepValidationResult {
  valid: boolean;
  errors: string[];
}

export const CAMPAIGN_WIZARD_STEPS = [
  { id: 1, key: 'basics', name: 'Campaign Details', description: 'Name and organize your campaign' },
  { id: 2, key: 'template', name: 'Choose Template', description: 'Optional starting template' },
  { id: 3, key: 'sender', name: 'Email & Sender', description: 'Subject line and verified sender' },
  { id: 4, key: 'content', name: 'Email Content', description: 'Design body and personalize variables' },
  { id: 5, key: 'audience', name: 'Select Recipients', description: 'Choose contact lists and provider' },
  { id: 6, key: 'review', name: 'Schedule & Review', description: 'Final readiness check & send' },
] as const;

export function validateCampaignWizardStep(
  step: number,
  data: CampaignWizardValidationInput
): WizardStepValidationResult {
  const errors: string[] = [];

  if (step === 1) {
    if (!data.name.trim()) {
      errors.push('Campaign name is required.');
    }
  } else if (step === 3) {
    if (!data.subject.trim()) {
      errors.push('Email subject is required.');
    }
    if (!data.from_email.trim()) {
      errors.push('Sender email is required. Verify a sending domain or choose an active sender email.');
    }
  } else if (step === 4) {
    const plainText = data.html_content.replace(/<[^>]*>/g, '').trim();
    if (!plainText && !data.html_content.includes('<img')) {
      errors.push('Email content cannot be empty.');
    }
  } else if (step === 5) {
    if (data.contact_list_ids.length === 0) {
      errors.push('Select at least one recipient contact list.');
    }
  } else if (step === 6) {
    if (!data.send_immediately && !data.scheduled_at) {
      errors.push('Choose a scheduled date and time, or select "Send Immediately".');
    }
  }

  return { valid: errors.length === 0, errors };
}
