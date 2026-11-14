'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  getStateDefinition,
  type StateMachineDomain,
} from '@/config/state-machines';
import { cn } from '@/config/utils';

export interface StatusBadgeProps {
  domain: StateMachineDomain;
  status?: string | null;
  labelOverride?: string;
  showPulse?: boolean;
  className?: string;
}

export function StatusBadge({
  domain,
  status,
  labelOverride,
  showPulse = true,
  className,
}: StatusBadgeProps) {
  const def = getStateDefinition(domain, status);
  const label = labelOverride ?? def.label;
  const shouldPulse = showPulse && def.pulse;

  return (
    <Badge
      variant={def.variant}
      title={def.description}
      data-state-domain={domain}
      data-state-key={def.key}
      className={cn('gap-1.5 font-medium', className)}
    >
      {shouldPulse && (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      <span>{label}</span>
    </Badge>
  );
}
