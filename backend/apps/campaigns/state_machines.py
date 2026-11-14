"""
Declarative State Machines for EmailCamp.

Provides a single source of truth for entity lifecycles across:
- UX (consistent labels, tones, allowed actions, confirmation prompts, recovery hints)
- DX (validated transitions, structured errors, shared helper methods)
- AX (self-describing schemas, endpoints, Mermaid graphs, agent action introspection)

Kept intentionally free of top-level Django model/ORM imports so it can be
safely imported by runtime views/models/tasks as well as standalone scripts,
CLI validators, and unit tests.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple


class InvalidStateTransition(ValueError):
    """Structured exception raised when an invalid state transition is attempted."""

    def __init__(
        self,
        *,
        entity: str,
        current_state: str,
        target_state: Optional[str] = None,
        action: Optional[str] = None,
        allowed_actions: Optional[List[Dict[str, Any]]] = None,
        allowed_target_states: Optional[List[str]] = None,
        message: Optional[str] = None,
        recovery_hint: Optional[str] = None,
    ):
        self.entity = entity
        self.current_state = current_state
        self.target_state = target_state
        self.action = action
        self.allowed_actions = allowed_actions or []
        self.allowed_target_states = allowed_target_states or []
        self.recovery_hint = recovery_hint

        if message is None:
            action_part = f" via action '{action}'" if action else ""
            target_part = f" to '{target_state}'" if target_state else ""
            allowed_names = [a["action"] for a in self.allowed_actions]
            hint = (
                f" Allowed actions from '{current_state}': {', '.join(allowed_names)}."
                if allowed_names
                else f" '{current_state}' has no outgoing actions."
            )
            message = (
                f"Invalid {entity} state transition from '{current_state}'"
                f"{target_part}{action_part}.{hint}"
            )
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        """Return machine- and human-readable error details for API/AX responses."""
        payload: Dict[str, Any] = {
            "error": str(self),
            "code": "invalid_state_transition",
            "entity": self.entity,
            "current_state": self.current_state,
            "allowed_target_states": self.allowed_target_states,
            "allowed_actions": self.allowed_actions,
        }
        if self.target_state is not None:
            payload["target_state"] = self.target_state
        if self.action is not None:
            payload["action"] = self.action
        if self.recovery_hint:
            payload["recovery_hint"] = self.recovery_hint
        return payload


@dataclass(frozen=True)
class StateMetadata:
    key: str
    label: str
    description: str
    category: str  # initial | active | pending | paused | terminal | error | suspended
    tone: str      # neutral | info | success | warning | danger | purple
    is_terminal: bool = False
    recoverable: bool = False
    recovery_hint: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "description": self.description,
            "category": self.category,
            "tone": self.tone,
            "is_terminal": self.is_terminal,
            "recoverable": self.recoverable,
            "recovery_hint": self.recovery_hint,
        }


@dataclass(frozen=True)
class TransitionSpec:
    action: str
    label: str
    description: str
    from_states: Tuple[str, ...]
    to_state: str  # Concrete state name, or "*previous_status" for dynamic restoration
    actors: Tuple[str, ...] = ("user",)  # user | admin | system | webhook | agent
    requires_confirmation: bool = False
    confirmation_prompt: str = ""
    method: str = "POST"
    endpoint: str = ""
    side_effects: Tuple[str, ...] = ()

    def resolve_target(self, instance: Any = None) -> str:
        if self.to_state == "*previous_status" and instance is not None:
            prev = getattr(instance, "previous_status", None)
            if prev:
                return str(prev)
            return "PENDING_VERIFICATION"
        return self.to_state

    def to_dict(self, endpoint_params: Optional[Dict[str, Any]] = None, instance: Any = None) -> Dict[str, Any]:
        resolved_endpoint = self.endpoint
        if resolved_endpoint and endpoint_params:
            try:
                resolved_endpoint = resolved_endpoint.format(**endpoint_params)
            except KeyError:
                pass
        return {
            "action": self.action,
            "label": self.label,
            "description": self.description,
            "from_states": list(self.from_states),
            "to_state": self.resolve_target(instance),
            "actors": list(self.actors),
            "requires_confirmation": self.requires_confirmation,
            "confirmation_prompt": self.confirmation_prompt,
            "method": self.method,
            "endpoint": resolved_endpoint,
            "side_effects": list(self.side_effects),
        }


@dataclass
class StateMachine:
    name: str
    entity: str
    field: str
    description: str
    states: Dict[str, StateMetadata]
    transitions: List[TransitionSpec] = field(default_factory=list)
    monotonic_rank: Optional[Dict[str, int]] = None
    terminal_override_states: Tuple[str, ...] = ()

    def get_state(self, state_key: str) -> StateMetadata:
        if state_key in self.states:
            return self.states[state_key]
        return StateMetadata(
            key=state_key,
            label=state_key.replace("_", " ").title(),
            description=f"Unregistered state '{state_key}'",
            category="pending",
            tone="neutral",
        )

    def get_transitions_for_action(self, action: str) -> List[TransitionSpec]:
        return [t for t in self.transitions if t.action == action]

    def get_allowed_transitions(
        self,
        current_state: str,
        actor: Optional[str] = None,
        endpoint_params: Optional[Dict[str, Any]] = None,
        instance: Any = None,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for t in self.transitions:
            if "*" not in t.from_states and current_state not in t.from_states:
                continue
            if actor and actor not in t.actors:
                continue
            results.append(t.to_dict(endpoint_params=endpoint_params, instance=instance))
        return results

    def get_allowed_target_states(self, current_state: str, instance: Any = None) -> List[str]:
        targets: List[str] = []
        for t in self.transitions:
            if "*" in t.from_states or current_state in t.from_states:
                target = t.resolve_target(instance)
                if target not in targets:
                    targets.append(target)
        return targets

    def can_perform_action(self, current_state: str, action: str, actor: Optional[str] = None) -> bool:
        for t in self.transitions:
            if t.action != action:
                continue
            if "*" not in t.from_states and current_state not in t.from_states:
                continue
            if actor and actor not in t.actors:
                continue
            return True
        return False

    def can_transition(
        self,
        current_state: str,
        target_state: str,
        *,
        action: Optional[str] = None,
        allow_idempotent: bool = False,
        instance: Any = None,
    ) -> bool:
        if allow_idempotent and current_state == target_state:
            return True

        # Optional monotonic + terminal override enforcement (e.g., delivery logs)
        if self.monotonic_rank is not None:
            if current_state in self.terminal_override_states and target_state != current_state:
                # Suppression states (BOUNCED/COMPLAINED) cannot be downgraded back to engagement states
                if target_state not in self.terminal_override_states:
                    return False

        for t in self.transitions:
            if action and t.action != action:
                continue
            if "*" not in t.from_states and current_state not in t.from_states:
                continue
            resolved = t.resolve_target(instance)
            if resolved == target_state or t.to_state == "*":
                return True
        return False

    def validate_transition(
        self,
        current_state: str,
        *,
        target_state: Optional[str] = None,
        action: Optional[str] = None,
        actor: Optional[str] = None,
        allow_idempotent: bool = False,
        endpoint_params: Optional[Dict[str, Any]] = None,
        instance: Any = None,
    ) -> str:
        allowed_actions = self.get_allowed_transitions(
            current_state, actor=actor, endpoint_params=endpoint_params, instance=instance
        )
        allowed_targets = self.get_allowed_target_states(current_state, instance=instance)
        state_meta = self.get_state(current_state)

        if action is not None:
            matching = [
                t for t in self.transitions
                if t.action == action
                and ("*" in t.from_states or current_state in t.from_states)
                and (actor is None or actor in t.actors)
            ]
            if not matching:
                raise InvalidStateTransition(
                    entity=self.entity,
                    current_state=current_state,
                    target_state=target_state,
                    action=action,
                    allowed_actions=allowed_actions,
                    allowed_target_states=allowed_targets,
                    recovery_hint=state_meta.recovery_hint or None,
                )
            resolved_target = target_state or matching[0].resolve_target(instance)
            if target_state and not any(
                m.resolve_target(instance) == target_state or m.to_state == "*" for m in matching
            ):
                if not (allow_idempotent and current_state == target_state):
                    raise InvalidStateTransition(
                        entity=self.entity,
                        current_state=current_state,
                        target_state=target_state,
                        action=action,
                        allowed_actions=allowed_actions,
                        allowed_target_states=allowed_targets,
                        recovery_hint=state_meta.recovery_hint or None,
                    )
            return resolved_target

        if target_state is None:
            raise ValueError("Either target_state or action must be provided.")

        if not self.can_transition(
            current_state,
            target_state,
            allow_idempotent=allow_idempotent,
            instance=instance,
        ):
            raise InvalidStateTransition(
                entity=self.entity,
                current_state=current_state,
                target_state=target_state,
                allowed_actions=allowed_actions,
                allowed_target_states=allowed_targets,
                recovery_hint=state_meta.recovery_hint or None,
            )
        return target_state

    def get_state_payload(
        self,
        current_state: str,
        *,
        actor: Optional[str] = None,
        endpoint_params: Optional[Dict[str, Any]] = None,
        instance: Any = None,
    ) -> Dict[str, Any]:
        meta = self.get_state(current_state)
        return {
            "state": current_state,
            "label": meta.label,
            "description": meta.description,
            "category": meta.category,
            "tone": meta.tone,
            "is_terminal": meta.is_terminal,
            "recoverable": meta.recoverable,
            "recovery_hint": meta.recovery_hint,
            "allowed_actions": self.get_allowed_transitions(
                current_state,
                actor=actor,
                endpoint_params=endpoint_params,
                instance=instance,
            ),
        }

    def to_mermaid(self) -> str:
        lines = ["stateDiagram-v2"]
        for t in self.transitions:
            target = t.to_state.lstrip("*")
            sources = [s for s in self.states.keys()] if "*" in t.from_states else list(t.from_states)
            for src in sources:
                if src == target:
                    continue
                lines.append(f"    {src} --> {target}: {t.action}")
        return "\n".join(lines)

    def to_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "entity": self.entity,
            "field": self.field,
            "description": self.description,
            "states": {k: v.to_dict() for k, v in self.states.items()},
            "transitions": [t.to_dict() for t in self.transitions],
            "mermaid": self.to_mermaid(),
        }


# =============================================================================
# 1. CAMPAIGN LIFECYCLE STATE MACHINE
# =============================================================================

CAMPAIGN_STATE_MACHINE = StateMachine(
    name="campaign",
    entity="Campaign",
    field="status",
    description="Controls drafting, scheduling, execution, pause/resume, recovery, and completion of email campaigns.",
    states={
        "DRAFT": StateMetadata(
            key="DRAFT",
            label="Draft",
            description="Campaign is being authored and has not been queued for delivery.",
            category="initial",
            tone="neutral",
            recoverable=True,
        ),
        "SCHEDULED": StateMetadata(
            key="SCHEDULED",
            label="Scheduled",
            description="Campaign is scheduled for future automated launch via Celery Beat.",
            category="pending",
            tone="info",
            recoverable=True,
        ),
        "SENDING": StateMetadata(
            key="SENDING",
            label="Sending",
            description="Campaign is actively dispatching emails through the configured provider.",
            category="active",
            tone="success",
            recoverable=True,
            recovery_hint="If sending appears stalled after a worker restart, reset the campaign to DRAFT or pause it.",
        ),
        "PAUSED": StateMetadata(
            key="PAUSED",
            label="Paused",
            description="Dispatch loop has been paused mid-flight and can resume without duplicating already-sent recipients.",
            category="paused",
            tone="warning",
            recoverable=True,
        ),
        "SENT": StateMetadata(
            key="SENT",
            label="Sent",
            description="Campaign delivery finished. Stats continue updating asynchronously as webhooks/opens/clicks arrive.",
            category="terminal",
            tone="purple",
            is_terminal=True,
            recovery_hint="Completed campaigns are immutable; use duplicate to send again.",
        ),
        "CANCELLED": StateMetadata(
            key="CANCELLED",
            label="Cancelled",
            description="Campaign was stopped permanently by a user before completion.",
            category="terminal",
            tone="danger",
            is_terminal=False,
            recoverable=True,
            recovery_hint="Reset to DRAFT to rework and relaunch, or duplicate into a new campaign.",
        ),
        "FAILED": StateMetadata(
            key="FAILED",
            label="Failed",
            description="Campaign encountered an error during setup, sender validation, or provider dispatch.",
            category="error",
            tone="danger",
            is_terminal=False,
            recoverable=True,
            recovery_hint="Inspect failure details, fix configuration (e.g. sender domain/provider), then reset to DRAFT.",
        ),
    },
    transitions=[
        TransitionSpec(
            action="schedule",
            label="Schedule",
            description="Schedule campaign for future delivery at a specified timestamp.",
            from_states=("DRAFT",),
            to_state="SCHEDULED",
            actors=("user", "agent"),
            method="POST",
            endpoint="/api/v1/campaigns/{id}/schedule/",
            side_effects=("Calculates recipient count", "Creates/updates Celery PeriodicTask"),
        ),
        TransitionSpec(
            action="launch",
            label="Launch Now",
            description="Start sending campaign immediately.",
            from_states=("DRAFT", "SCHEDULED", "PAUSED"),
            to_state="SENDING",
            actors=("user", "system", "agent"),
            requires_confirmation=True,
            confirmation_prompt="Launch this campaign now? Emails will begin sending to active contacts.",
            method="POST",
            endpoint="/api/v1/campaigns/{id}/launch/",
            side_effects=("Acquires row lock", "Recalculates recipient count", "Enqueues launch_campaign_task"),
        ),
        TransitionSpec(
            action="pause",
            label="Pause",
            description="Pause active sending between contacts.",
            from_states=("SENDING",),
            to_state="PAUSED",
            actors=("user", "agent"),
            method="POST",
            endpoint="/api/v1/campaigns/{id}/pause/",
            side_effects=("Stops dispatch loop cleanly at next contact check"),
        ),
        TransitionSpec(
            action="resume",
            label="Resume",
            description="Resume sending to remaining unsent contacts.",
            from_states=("PAUSED",),
            to_state="SENDING",
            actors=("user", "agent"),
            method="POST",
            endpoint="/api/v1/campaigns/{id}/resume/",
            side_effects=("Skips contacts already in delivery logs", "Re-enqueues launch_campaign_task"),
        ),
        TransitionSpec(
            action="cancel",
            label="Cancel",
            description="Stop campaign and clean up any scheduled periodic task.",
            from_states=("DRAFT", "SCHEDULED", "SENDING", "PAUSED", "FAILED"),
            to_state="CANCELLED",
            actors=("user", "agent"),
            requires_confirmation=True,
            confirmation_prompt="Cancel this campaign? Remaining unsent emails will not be delivered.",
            method="POST",
            endpoint="/api/v1/campaigns/{id}/cancel/",
            side_effects=("Cleans up Celery PeriodicTask if present"),
        ),
        TransitionSpec(
            action="reset",
            label="Reset to Draft",
            description="Return a stuck, paused, scheduled, cancelled, or failed campaign back to editable DRAFT state.",
            from_states=("SCHEDULED", "SENDING", "PAUSED", "CANCELLED", "FAILED"),
            to_state="DRAFT",
            actors=("user", "agent"),
            requires_confirmation=True,
            confirmation_prompt="Reset this campaign back to DRAFT? Existing delivery logs are preserved.",
            method="POST",
            endpoint="/api/v1/campaigns/{id}/reset/",
            side_effects=("Clears started_at and scheduled_at", "Cleans up Celery PeriodicTask"),
        ),
        TransitionSpec(
            action="complete",
            label="Mark Sent",
            description="Internal transition when dispatch finishes.",
            from_states=("SENDING", "PAUSED"),
            to_state="SENT",
            actors=("system",),
            side_effects=("Sets completed_at", "Cleans up PeriodicTask", "Triggers stats refresh & notifications"),
        ),
        TransitionSpec(
            action="fail",
            label="Mark Failed",
            description="Internal transition when pre-send checks or provider initialization fail.",
            from_states=("DRAFT", "SCHEDULED", "SENDING", "PAUSED"),
            to_state="FAILED",
            actors=("system",),
            side_effects=("Records failure reason in segment_filters._error", "Cleans up PeriodicTask"),
        ),
    ],
)


# =============================================================================
# 2. EMAIL DELIVERY LOG LIFECYCLE STATE MACHINE
# =============================================================================

DELIVERY_LOG_RANK: Dict[str, int] = {
    "QUEUED": 0,
    "FAILED": 1,
    "SENT": 2,
    "DELIVERED": 3,
    "OPENED": 4,
    "CLICKED": 5,
    "UNSUBSCRIBED": 6,
    "BOUNCED": 7,
    "COMPLAINED": 8,
}

DELIVERY_TERMINAL_SUPPRESSION = ("BOUNCED", "COMPLAINED")
DELIVERY_NON_REGRESSIVE_POST_ENGAGEMENT = ("DELIVERED", "SENT", "QUEUED", "FAILED")

DELIVERY_LOG_STATE_MACHINE = StateMachine(
    name="delivery_log",
    entity="EmailDeliveryLog",
    field="delivery_status",
    description="Tracks per-recipient email delivery and engagement progression with monotonic guarantees and suppression precedence.",
    monotonic_rank=DELIVERY_LOG_RANK,
    terminal_override_states=DELIVERY_TERMINAL_SUPPRESSION,
    states={
        "QUEUED": StateMetadata("QUEUED", "Queued", "Log created and queued for provider submission.", "initial", "neutral"),
        "SENT": StateMetadata("SENT", "Sent", "Accepted by upstream SMTP/API provider.", "pending", "info"),
        "DELIVERED": StateMetadata("DELIVERED", "Delivered", "Confirmed delivered to recipient mail server.", "active", "success"),
        "OPENED": StateMetadata("OPENED", "Opened", "Recipient loaded tracking pixel or open webhook fired.", "active", "success"),
        "CLICKED": StateMetadata("CLICKED", "Clicked", "Recipient clicked at least one tracked link.", "active", "purple"),
        "UNSUBSCRIBED": StateMetadata("UNSUBSCRIBED", "Unsubscribed", "Recipient unsubscribed via link, RFC 8058 header, or provider event.", "terminal", "warning", is_terminal=True),
        "BOUNCED": StateMetadata("BOUNCED", "Bounced", "Recipient address hard- or soft-bounced.", "error", "danger", is_terminal=True),
        "COMPLAINED": StateMetadata("COMPLAINED", "Complained", "Recipient marked the message as spam.", "error", "danger", is_terminal=True),
        "FAILED": StateMetadata("FAILED", "Failed", "Submission failed before provider acceptance.", "error", "danger", recoverable=True),
    },
    transitions=[
        TransitionSpec("send", "Mark Sent", "Provider accepted the message.", ("QUEUED", "FAILED"), "SENT", actors=("system", "webhook")),
        TransitionSpec("deliver", "Mark Delivered", "Provider confirmed mailbox delivery.", ("QUEUED", "FAILED", "SENT"), "DELIVERED", actors=("system", "webhook")),
        TransitionSpec("open", "Record Open", "Tracking pixel or open webhook received.", ("QUEUED", "SENT", "DELIVERED"), "OPENED", actors=("system", "webhook")),
        TransitionSpec("click", "Record Click", "Click tracking or click webhook received.", ("QUEUED", "SENT", "DELIVERED", "OPENED"), "CLICKED", actors=("system", "webhook")),
        TransitionSpec("unsubscribe", "Record Unsubscribe", "Recipient opted out.", ("QUEUED", "SENT", "DELIVERED", "OPENED", "CLICKED", "FAILED"), "UNSUBSCRIBED", actors=("user", "system", "webhook")),
        TransitionSpec("bounce", "Record Bounce", "Bounce notification received from provider.", ("QUEUED", "SENT", "DELIVERED", "OPENED", "CLICKED", "FAILED"), "BOUNCED", actors=("system", "webhook")),
        TransitionSpec("complain", "Record Complaint", "Spam complaint received from provider.", ("QUEUED", "SENT", "DELIVERED", "OPENED", "CLICKED", "UNSUBSCRIBED", "BOUNCED"), "COMPLAINED", actors=("system", "webhook")),
        TransitionSpec("fail", "Mark Failed", "Provider rejected or timed out during send.", ("QUEUED",), "FAILED", actors=("system",)),
    ],
)


def resolve_next_delivery_status(current_status: str, target_status: str) -> str:
    """
    Determine the resulting delivery_status while enforcing monotonic engagement
    progression and ensuring BOUNCED / COMPLAINED / UNSUBSCRIBED are never downgraded.
    """
    if current_status == target_status:
        return current_status

    # Suppression precedence: COMPLAINED >= BOUNCED >= UNSUBSCRIBED
    if current_status == "COMPLAINED":
        return "COMPLAINED"
    if current_status == "BOUNCED":
        return "COMPLAINED" if target_status == "COMPLAINED" else "BOUNCED"
    if current_status == "UNSUBSCRIBED":
        return target_status if target_status in ("BOUNCED", "COMPLAINED") else "UNSUBSCRIBED"

    # Engagement transitions never overwrite each other backwards (e.g. CLICKED -> OPENED)
    if target_status in ("BOUNCED", "COMPLAINED", "UNSUBSCRIBED"):
        return target_status

    if target_status == "FAILED":
        return target_status if current_status in ("QUEUED", "FAILED") else current_status

    current_rank = DELIVERY_LOG_RANK.get(current_status, 0)
    target_rank = DELIVERY_LOG_RANK.get(target_status, 0)
    return target_status if target_rank > current_rank else current_status


# =============================================================================
# 3. EMAIL QUEUE STATE MACHINE
# =============================================================================

EMAIL_QUEUE_STATE_MACHINE = StateMachine(
    name="email_queue",
    entity="EmailQueue",
    field="status",
    description="Manages worker locking, retry backoff, completion, and cancellation for individual queued emails.",
    states={
        "PENDING": StateMetadata("PENDING", "Pending", "Waiting for a queue worker to claim it.", "initial", "neutral"),
        "RETRYING": StateMetadata("RETRYING", "Retrying", "Scheduled for retry after a transient failure.", "pending", "warning"),
        "PROCESSING": StateMetadata("PROCESSING", "Processing", "Currently locked by a Celery worker for delivery.", "active", "info"),
        "SENT": StateMetadata("SENT", "Sent", "Successfully dispatched to provider.", "terminal", "success", is_terminal=True),
        "FAILED": StateMetadata("FAILED", "Failed", "Exceeded retries or hit permanent failure.", "error", "danger", recoverable=True),
        "CANCELLED": StateMetadata("CANCELLED", "Cancelled", "Cancelled prior to sending.", "terminal", "neutral", is_terminal=True, recoverable=True),
    },
    transitions=[
        TransitionSpec("claim", "Claim Item", "Worker acquires item lock.", ("PENDING", "RETRYING"), "PROCESSING", actors=("system",)),
        TransitionSpec("succeed", "Mark Sent", "Dispatch succeeded.", ("PROCESSING",), "SENT", actors=("system",)),
        TransitionSpec("retry", "Schedule Retry", "Transient failure; backoff scheduled.", ("PROCESSING",), "RETRYING", actors=("system",)),
        TransitionSpec("fail", "Mark Failed", "Permanent failure or retries exhausted.", ("PENDING", "RETRYING", "PROCESSING", "SENT"), "FAILED", actors=("system", "webhook")),
        TransitionSpec("cancel", "Cancel", "Remove from send queue.", ("PENDING", "RETRYING"), "CANCELLED", actors=("user", "system")),
        TransitionSpec("requeue", "Requeue", "Reset failed/cancelled item for delivery.", ("FAILED", "CANCELLED"), "PENDING", actors=("user", "admin", "system")),
    ],
)


# =============================================================================
# 4. SENDING DOMAIN LIFECYCLE STATE MACHINE
# =============================================================================

SENDING_DOMAIN_STATE_MACHINE = StateMachine(
    name="sending_domain",
    entity="SendingDomain",
    field="status",
    description="Tracks custom domain DNS setup, SES DKIM/SPF/DMARC verification, timeout/failure recovery, and admin suspension.",
    states={
        "PENDING_DNS": StateMetadata(
            "PENDING_DNS",
            "Pending DNS",
            "Waiting for user to publish DKIM/SPF/MAIL-FROM DNS records.",
            "initial",
            "warning",
            recovery_hint="Add the DNS records at your registrar, then trigger verification.",
        ),
        "PENDING_VERIFICATION": StateMetadata(
            "PENDING_VERIFICATION",
            "Verifying",
            "DNS check triggered; polling AWS SES for propagation.",
            "pending",
            "info",
        ),
        "VERIFIED": StateMetadata(
            "VERIFIED",
            "Verified",
            "DKIM verified; domain is eligible to create sender addresses and send campaigns.",
            "active",
            "success",
        ),
        "FAILED": StateMetadata(
            "FAILED",
            "Failed",
            "Verification failed or timed out after the 7-day window.",
            "error",
            "danger",
            recoverable=True,
            recovery_hint="Check DNS records for typos and click Retry Verification.",
        ),
        "SUSPENDED": StateMetadata(
            "SUSPENDED",
            "Suspended",
            "Platform admin suspended sending from this domain; previous_status is preserved for restoration.",
            "suspended",
            "danger",
            recoverable=True,
        ),
        "DISABLED": StateMetadata(
            "DISABLED",
            "Disabled",
            "Domain has been disabled and cannot send emails.",
            "terminal",
            "neutral",
            is_terminal=True,
        ),
    },
    transitions=[
        TransitionSpec(
            action="check_verification",
            label="Verify DNS",
            description="Poll AWS SES for DKIM verification progress.",
            from_states=("PENDING_DNS", "PENDING_VERIFICATION"),
            to_state="PENDING_VERIFICATION",
            actors=("user", "system"),
            method="POST",
            endpoint="/api/v1/campaigns/domains/{id}/verify/",
        ),
        TransitionSpec(
            action="verify",
            label="Mark Verified",
            description="DKIM & MAIL-FROM checks passed in SES.",
            from_states=("PENDING_DNS", "PENDING_VERIFICATION"),
            to_state="VERIFIED",
            actors=("system",),
        ),
        TransitionSpec(
            action="fail",
            label="Mark Failed",
            description="Verification failed or timed out after 7 days.",
            from_states=("PENDING_DNS", "PENDING_VERIFICATION"),
            to_state="FAILED",
            actors=("system",),
        ),
        TransitionSpec(
            action="retry",
            label="Retry Verification",
            description="Reset failed domain back to verification polling.",
            from_states=("FAILED",),
            to_state="PENDING_VERIFICATION",
            actors=("user",),
            method="POST",
            endpoint="/api/v1/campaigns/domains/{id}/retry/",
        ),
        TransitionSpec(
            action="suspend",
            label="Suspend Domain",
            description="Platform admin suspends domain while preserving previous_status.",
            from_states=("PENDING_DNS", "PENDING_VERIFICATION", "VERIFIED", "FAILED"),
            to_state="SUSPENDED",
            actors=("admin",),
            requires_confirmation=True,
            confirmation_prompt="Suspend this sending domain? All sender emails on it will stop sending.",
            method="POST",
            endpoint="/api/v1/campaigns/admin/domains/{id}/suspend/",
        ),
        TransitionSpec(
            action="reactivate",
            label="Reactivate Domain",
            description="Platform admin restores domain to its pre-suspension status.",
            from_states=("SUSPENDED",),
            to_state="*previous_status",
            actors=("admin",),
            method="POST",
            endpoint="/api/v1/campaigns/admin/domains/{id}/reactivate/",
        ),
        TransitionSpec(
            action="disable",
            label="Disable Domain",
            description="Permanently disable this domain.",
            from_states=("PENDING_DNS", "PENDING_VERIFICATION", "VERIFIED", "FAILED", "SUSPENDED"),
            to_state="DISABLED",
            actors=("user", "admin"),
        ),
    ],
)


# =============================================================================
# 5. SENDER EMAIL STATE MACHINE
# =============================================================================

SENDER_EMAIL_STATE_MACHINE = StateMachine(
    name="sender_email",
    entity="SenderEmail",
    field="status",
    description="Controls sender mailbox activation and suspension; effective usability also depends on parent SendingDomain.",
    states={
        "ACTIVE": StateMetadata("ACTIVE", "Active", "Sender identity is active (usable when its domain is VERIFIED).", "active", "success"),
        "SUSPENDED": StateMetadata("SUSPENDED", "Suspended", "Sender address was suspended by a platform admin.", "suspended", "danger", recoverable=True),
    },
    transitions=[
        TransitionSpec(
            action="suspend",
            label="Suspend Sender",
            description="Prevent campaigns from sending via this address.",
            from_states=("ACTIVE",),
            to_state="SUSPENDED",
            actors=("admin",),
            requires_confirmation=True,
            confirmation_prompt="Suspend this sender email address?",
            method="POST",
            endpoint="/api/v1/campaigns/admin/sender-emails/{id}/suspend/",
        ),
        TransitionSpec(
            action="reactivate",
            label="Reactivate Sender",
            description="Allow campaigns to send via this address again.",
            from_states=("SUSPENDED",),
            to_state="ACTIVE",
            actors=("admin",),
            method="POST",
            endpoint="/api/v1/campaigns/admin/sender-emails/{id}/reactivate/",
        ),
    ],
)


# =============================================================================
# 6. TEMPLATE APPROVAL STATE MACHINE
# =============================================================================

TEMPLATE_APPROVAL_STATE_MACHINE = StateMachine(
    name="template_approval",
    entity="EmailTemplate",
    field="approval_status",
    description="Synchronizes global template draft status, approval requests, reviewer audit trail, and org update notifications.",
    states={
        "DRAFT": StateMetadata("DRAFT", "Draft", "Template is editable in draft state before submission.", "initial", "neutral", recoverable=True),
        "PENDING_APPROVAL": StateMetadata("PENDING_APPROVAL", "Pending Approval", "Submitted to platform admins for review.", "pending", "warning"),
        "APPROVED": StateMetadata("APPROVED", "Approved", "Published to the shared global template library.", "active", "success"),
        "REJECTED": StateMetadata(
            "REJECTED",
            "Rejected",
            "Returned by reviewer with notes; can be edited or resubmitted.",
            "error",
            "danger",
            recoverable=True,
            recovery_hint="Revise template content and resubmit for approval.",
        ),
    },
    transitions=[
        TransitionSpec(
            action="submit_approval",
            label="Submit for Approval",
            description="Create a review request and lock template for approval.",
            from_states=("DRAFT", "REJECTED"),
            to_state="PENDING_APPROVAL",
            actors=("user", "admin"),
            method="POST",
            endpoint="/api/v1/campaigns/templates/{id}/submit-approval/",
            side_effects=("Sets is_draft=True, submitted_for_approval_at=now", "Creates TemplateApprovalRequest"),
        ),
        TransitionSpec(
            action="approve",
            label="Approve & Publish",
            description="Approve template and make it available globally.",
            from_states=("DRAFT", "PENDING_APPROVAL", "REJECTED"),
            to_state="APPROVED",
            actors=("admin",),
            method="POST",
            endpoint="/api/v1/campaigns/approvals/{request_id}/review/",
            side_effects=("Sets is_draft=False, approved_by, approved_at", "Resolves pending TemplateApprovalRequests"),
        ),
        TransitionSpec(
            action="reject",
            label="Reject",
            description="Reject template with reviewer notes.",
            from_states=("DRAFT", "PENDING_APPROVAL"),
            to_state="REJECTED",
            actors=("admin",),
            requires_confirmation=True,
            confirmation_prompt="Reject this template and notify the author?",
            method="POST",
            endpoint="/api/v1/campaigns/approvals/{request_id}/review/",
            side_effects=("Sets is_draft=True so author can revise", "Resolves pending TemplateApprovalRequests"),
        ),
        TransitionSpec(
            action="reopen_draft",
            label="Return to Draft",
            description="Return template to editable DRAFT state.",
            from_states=("PENDING_APPROVAL", "APPROVED", "REJECTED"),
            to_state="DRAFT",
            actors=("admin",),
            side_effects=("Sets is_draft=True"),
        ),
    ],
)


# =============================================================================
# 7. CONTACT SUBSCRIPTION LIFECYCLE STATE MACHINE
# =============================================================================

CONTACT_STATE_MACHINE = StateMachine(
    name="contact",
    entity="Contact",
    field="status",
    description="Manages contact opt-in, suppression (unsubscribed/bounced/complained), and reactivation.",
    states={
        "PENDING": StateMetadata("PENDING", "Pending", "Awaiting double opt-in confirmation.", "pending", "info", recoverable=True),
        "ACTIVE": StateMetadata("ACTIVE", "Active", "Subscribed and eligible to receive campaigns.", "active", "success"),
        "UNSUBSCRIBED": StateMetadata("UNSUBSCRIBED", "Unsubscribed", "Opted out of campaigns; excluded from future sends.", "paused", "warning", recoverable=True),
        "BOUNCED": StateMetadata("BOUNCED", "Bounced", "Delivery failed due to hard/repeated bounce; suppressed.", "error", "danger", recoverable=True),
        "COMPLAINED": StateMetadata("COMPLAINED", "Complained", "Marked campaign as spam; strictly suppressed.", "error", "danger"),
    },
    transitions=[
        TransitionSpec("confirm", "Confirm Opt-In", "Complete double opt-in verification.", ("PENDING",), "ACTIVE", actors=("user", "system")),
        TransitionSpec("unsubscribe", "Unsubscribe", "Opt contact out of campaigns and sync is_active=False.", ("PENDING", "ACTIVE"), "UNSUBSCRIBED", actors=("user", "webhook", "system")),
        TransitionSpec("reactivate", "Activate Contact", "Restore contact to ACTIVE and sync is_active=True.", ("PENDING", "UNSUBSCRIBED", "BOUNCED"), "ACTIVE", actors=("user", "admin", "agent"), endpoint="/api/v1/campaigns/contacts/{id}/toggle-status/"),
        TransitionSpec("mark_bounced", "Mark Bounced", "Suppress after bounce event.", ("PENDING", "ACTIVE", "UNSUBSCRIBED"), "BOUNCED", actors=("system", "webhook")),
        TransitionSpec("mark_complained", "Mark Complained", "Suppress after spam complaint.", ("PENDING", "ACTIVE", "UNSUBSCRIBED", "BOUNCED"), "COMPLAINED", actors=("system", "webhook")),
    ],
)


# =============================================================================
# 8. EMAIL PROVIDER HEALTH STATE MACHINE
# =============================================================================

PROVIDER_HEALTH_STATE_MACHINE = StateMachine(
    name="provider_health",
    entity="EmailProvider",
    field="health_status",
    description="Tracks SMTP/SES/SendGrid/Brevo provider health checks.",
    states={
        "UNKNOWN": StateMetadata("UNKNOWN", "Unknown", "Provider has not been health-checked yet.", "initial", "neutral"),
        "HEALTHY": StateMetadata("HEALTHY", "Healthy", "Last health check passed.", "active", "success"),
        "DEGRADED": StateMetadata("DEGRADED", "Degraded", "Provider experiencing elevated error rate or latency.", "paused", "warning"),
        "UNHEALTHY": StateMetadata("UNHEALTHY", "Unhealthy", "Provider failed connectivity or authentication checks.", "error", "danger", recoverable=True),
    },
    transitions=[
        TransitionSpec("health_check_pass", "Health Check Passed", "Connection/credentials verified.", ("*",), "HEALTHY", actors=("user", "admin", "system")),
        TransitionSpec("health_check_degrade", "Health Degraded", "Intermittent errors detected.", ("*",), "DEGRADED", actors=("system",)),
        TransitionSpec("health_check_fail", "Health Check Failed", "Connection or credential check failed.", ("*",), "UNHEALTHY", actors=("user", "admin", "system")),
    ],
)


# =============================================================================
# 9. MAILBOX SYNC STATE MACHINE
# =============================================================================

MAILBOX_SYNC_STATE_MACHINE = StateMachine(
    name="mailbox_sync",
    entity="EmailAccount",
    field="sync_status",
    description="Tracks IMAP/provider mailbox synchronization worker state.",
    states={
        "IDLE": StateMetadata("IDLE", "Idle", "Ready and awaiting next periodic or manual sync.", "active", "success"),
        "SYNCING": StateMetadata("SYNCING", "Syncing", "Actively fetching new messages from mailbox.", "pending", "info"),
        "ERROR": StateMetadata("ERROR", "Sync Error", "Last sync encountered an authentication or connection error.", "error", "danger", recoverable=True),
        "DISABLED": StateMetadata("DISABLED", "Disabled", "Synchronization is disabled for this account.", "paused", "neutral", recoverable=True),
    },
    transitions=[
        TransitionSpec("start_sync", "Start Sync", "Begin IMAP fetch.", ("IDLE", "ERROR"), "SYNCING", actors=("user", "system")),
        TransitionSpec("finish_sync", "Finish Sync", "Sync completed cleanly.", ("SYNCING", "ERROR"), "IDLE", actors=("system",)),
        TransitionSpec("fail_sync", "Fail Sync", "Sync aborted with error.", ("IDLE", "SYNCING"), "ERROR", actors=("system",)),
        TransitionSpec("disable_sync", "Disable Sync", "Disable periodic sync.", ("IDLE", "ERROR", "SYNCING"), "DISABLED", actors=("user", "admin")),
        TransitionSpec("enable_sync", "Enable Sync", "Re-enable sync.", ("DISABLED", "ERROR"), "IDLE", actors=("user", "admin")),
    ],
)


# =============================================================================
# REGISTRY & INTROSPECTION HELPERS
# =============================================================================

STATE_MACHINE_REGISTRY: Dict[str, StateMachine] = {
    "campaign": CAMPAIGN_STATE_MACHINE,
    "delivery_log": DELIVERY_LOG_STATE_MACHINE,
    "email_queue": EMAIL_QUEUE_STATE_MACHINE,
    "sending_domain": SENDING_DOMAIN_STATE_MACHINE,
    "sender_email": SENDER_EMAIL_STATE_MACHINE,
    "template_approval": TEMPLATE_APPROVAL_STATE_MACHINE,
    "contact": CONTACT_STATE_MACHINE,
    "provider_health": PROVIDER_HEALTH_STATE_MACHINE,
    "mailbox_sync": MAILBOX_SYNC_STATE_MACHINE,
}


def get_all_state_machine_schemas() -> Dict[str, Any]:
    """Return full machine-readable definitions for DX and AX introspection."""
    return {
        name: sm.to_schema()
        for name, sm in STATE_MACHINE_REGISTRY.items()
    }
