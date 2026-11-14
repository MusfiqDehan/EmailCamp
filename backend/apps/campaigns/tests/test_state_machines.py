"""
Unit tests for declarative state machines in apps.campaigns.state_machines.

Uses pure Python unittest and direct module loading so tests execute both
inside a full Django environment and standalone without Django dependencies.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest


_STATE_MACHINES_PATH = (
    Path(__file__).resolve().parent.parent / "state_machines.py"
)
_SPEC = importlib.util.spec_from_file_location(
    "campaigns_state_machines", _STATE_MACHINES_PATH
)
assert _SPEC and _SPEC.loader
sm = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = sm
_SPEC.loader.exec_module(sm)


class StateMachineRegistryTests(unittest.TestCase):
    EXPECTED_MACHINES = {
        "campaign",
        "delivery_log",
        "email_queue",
        "sending_domain",
        "sender_email",
        "template_approval",
        "contact",
        "provider_health",
        "mailbox_sync",
    }

    def test_all_expected_machines_registered(self):
        self.assertEqual(
            set(sm.STATE_MACHINE_REGISTRY.keys()),
            self.EXPECTED_MACHINES,
        )

    def test_schemas_and_mermaid_integrity(self):
        schemas = sm.get_all_state_machine_schemas()
        self.assertEqual(set(schemas.keys()), self.EXPECTED_MACHINES)

        for name, schema in schemas.items():
            self.assertEqual(schema["name"], name)
            self.assertTrue(schema["entity"])
            self.assertTrue(schema["field"])
            self.assertIsInstance(schema["states"], dict)
            self.assertGreater(len(schema["states"]), 0)
            self.assertIsInstance(schema["transitions"], list)
            self.assertGreater(len(schema["transitions"]), 0)
            self.assertTrue(schema["mermaid"].startswith("stateDiagram-v2"))

            state_keys = set(schema["states"].keys())
            for tr in schema["transitions"]:
                for src in tr["from_states"]:
                    if src != "*":
                        self.assertIn(
                            src,
                            state_keys,
                            f"{name}.{tr['action']} references unknown from_state {src}",
                        )
                target = tr["to_state"]
                if target != "*" and not target.startswith("*"):
                    self.assertIn(
                        target,
                        state_keys,
                        f"{name}.{tr['action']} references unknown to_state {target}",
                    )


class CampaignStateMachineTests(unittest.TestCase):
    def test_valid_campaign_lifecycle(self):
        csm = sm.CAMPAIGN_STATE_MACHINE
        self.assertEqual(csm.validate_transition("DRAFT", action="schedule"), "SCHEDULED")
        self.assertEqual(csm.validate_transition("DRAFT", action="launch"), "SENDING")
        self.assertEqual(csm.validate_transition("SCHEDULED", action="launch"), "SENDING")
        self.assertEqual(csm.validate_transition("SCHEDULED", action="reset"), "DRAFT")
        self.assertEqual(csm.validate_transition("SENDING", action="pause"), "PAUSED")
        self.assertEqual(csm.validate_transition("PAUSED", action="resume"), "SENDING")
        self.assertEqual(csm.validate_transition("SENDING", action="complete"), "SENT")
        self.assertEqual(csm.validate_transition("FAILED", action="reset"), "DRAFT")
        self.assertEqual(csm.validate_transition("CANCELLED", action="reset"), "DRAFT")

    def test_terminal_sent_campaign_rejects_mutations_with_structured_error(self):
        csm = sm.CAMPAIGN_STATE_MACHINE
        payload = csm.get_state_payload("SENT", endpoint_params={"id": "abc"})
        self.assertTrue(payload["is_terminal"])
        self.assertEqual(payload["allowed_actions"], [])
        self.assertTrue(payload["recovery_hint"])

        for action in ("launch", "pause", "resume", "cancel", "reset", "schedule"):
            with self.assertRaises(sm.InvalidStateTransition) as ctx:
                csm.validate_transition("SENT", action=action)
            err = ctx.exception.to_dict()
            self.assertEqual(err["code"], "invalid_state_transition")
            self.assertEqual(err["entity"], "Campaign")
            self.assertEqual(err["current_state"], "SENT")
            self.assertEqual(err["action"], action)
            self.assertEqual(err["allowed_actions"], [])
            self.assertIn("duplicate", err["recovery_hint"].lower())

    def test_failed_campaign_cannot_launch_directly_and_formats_endpoints(self):
        csm = sm.CAMPAIGN_STATE_MACHINE
        with self.assertRaises(sm.InvalidStateTransition) as ctx:
            csm.validate_transition(
                "FAILED",
                action="launch",
                endpoint_params={"id": "42"},
            )
        err = ctx.exception.to_dict()
        action_names = [a["action"] for a in err["allowed_actions"]]
        self.assertEqual(action_names, ["cancel", "reset"])
        self.assertEqual(
            err["allowed_actions"][1]["endpoint"],
            "/api/v1/campaigns/42/reset/",
        )
        self.assertIn("recovery_hint", err)


class DeliveryLogStateMachineTests(unittest.TestCase):
    def test_monotonic_engagement_progression(self):
        self.assertEqual(sm.resolve_next_delivery_status("QUEUED", "SENT"), "SENT")
        self.assertEqual(sm.resolve_next_delivery_status("SENT", "DELIVERED"), "DELIVERED")
        self.assertEqual(sm.resolve_next_delivery_status("DELIVERED", "OPENED"), "OPENED")
        self.assertEqual(sm.resolve_next_delivery_status("OPENED", "CLICKED"), "CLICKED")

    def test_prevents_backward_engagement_regression(self):
        for earlier in ("QUEUED", "FAILED", "SENT", "DELIVERED", "OPENED"):
            self.assertEqual(
                sm.resolve_next_delivery_status("CLICKED", earlier),
                "CLICKED",
            )
        self.assertEqual(sm.resolve_next_delivery_status("OPENED", "DELIVERED"), "OPENED")
        self.assertEqual(sm.resolve_next_delivery_status("SENT", "FAILED"), "SENT")
        self.assertEqual(sm.resolve_next_delivery_status("QUEUED", "FAILED"), "FAILED")

    def test_suppression_precedence(self):
        # BOUNCED is only escalated by COMPLAINED
        for target in ("QUEUED", "FAILED", "SENT", "DELIVERED", "OPENED", "CLICKED", "UNSUBSCRIBED"):
            self.assertEqual(sm.resolve_next_delivery_status("BOUNCED", target), "BOUNCED")
            self.assertFalse(sm.DELIVERY_LOG_STATE_MACHINE.can_transition("BOUNCED", target))
        self.assertEqual(sm.resolve_next_delivery_status("BOUNCED", "COMPLAINED"), "COMPLAINED")
        self.assertTrue(sm.DELIVERY_LOG_STATE_MACHINE.can_transition("BOUNCED", "COMPLAINED"))

        # COMPLAINED is terminal override
        for target in ("QUEUED", "FAILED", "SENT", "DELIVERED", "OPENED", "CLICKED", "UNSUBSCRIBED", "BOUNCED"):
            self.assertEqual(sm.resolve_next_delivery_status("COMPLAINED", target), "COMPLAINED")

        # UNSUBSCRIBED never reverts to engagement but escalates to BOUNCED/COMPLAINED
        for target in ("OPENED", "CLICKED", "DELIVERED", "SENT"):
            self.assertEqual(sm.resolve_next_delivery_status("UNSUBSCRIBED", target), "UNSUBSCRIBED")
        self.assertEqual(sm.resolve_next_delivery_status("UNSUBSCRIBED", "BOUNCED"), "BOUNCED")
        self.assertEqual(sm.resolve_next_delivery_status("UNSUBSCRIBED", "COMPLAINED"), "COMPLAINED")


class OtherStateMachinesTests(unittest.TestCase):
    def test_email_queue_transitions(self):
        eq = sm.EMAIL_QUEUE_STATE_MACHINE
        self.assertEqual(eq.validate_transition("PENDING", action="claim"), "PROCESSING")
        self.assertEqual(eq.validate_transition("PROCESSING", action="retry"), "RETRYING")
        self.assertEqual(eq.validate_transition("RETRYING", action="claim"), "PROCESSING")
        self.assertEqual(eq.validate_transition("PROCESSING", action="succeed"), "SENT")
        self.assertEqual(eq.validate_transition("FAILED", action="requeue"), "PENDING")
        with self.assertRaises(sm.InvalidStateTransition):
            eq.validate_transition("SENT", action="retry")

    def test_sending_domain_dynamic_previous_status(self):
        dsm = sm.SENDING_DOMAIN_STATE_MACHINE
        verified_domain = SimpleNamespace(previous_status="VERIFIED")
        fallback_domain = SimpleNamespace(previous_status=None)

        self.assertEqual(
            dsm.validate_transition("SUSPENDED", action="reactivate", instance=verified_domain),
            "VERIFIED",
        )
        self.assertEqual(
            dsm.validate_transition("SUSPENDED", action="reactivate", instance=fallback_domain),
            "PENDING_VERIFICATION",
        )
        self.assertEqual(dsm.validate_transition("FAILED", action="retry"), "PENDING_VERIFICATION")
        self.assertEqual(dsm.get_allowed_transitions("DISABLED"), [])

    def test_sender_email_transitions(self):
        ssm = sm.SENDER_EMAIL_STATE_MACHINE
        self.assertEqual(ssm.validate_transition("ACTIVE", action="suspend"), "SUSPENDED")
        self.assertEqual(ssm.validate_transition("SUSPENDED", action="reactivate"), "ACTIVE")
        with self.assertRaises(sm.InvalidStateTransition):
            ssm.validate_transition("ACTIVE", action="reactivate")

    def test_template_approval_transitions(self):
        tsm = sm.TEMPLATE_APPROVAL_STATE_MACHINE
        self.assertEqual(tsm.validate_transition("DRAFT", action="submit_approval"), "PENDING_APPROVAL")
        self.assertEqual(tsm.validate_transition("PENDING_APPROVAL", action="reject"), "REJECTED")
        self.assertEqual(tsm.validate_transition("REJECTED", action="submit_approval"), "PENDING_APPROVAL")
        self.assertEqual(tsm.validate_transition("PENDING_APPROVAL", action="approve"), "APPROVED")
        self.assertEqual(tsm.validate_transition("APPROVED", action="reopen_draft"), "DRAFT")
        with self.assertRaises(sm.InvalidStateTransition):
            tsm.validate_transition("APPROVED", action="reject")

    def test_contact_transitions(self):
        csm = sm.CONTACT_STATE_MACHINE
        self.assertEqual(csm.validate_transition("PENDING", action="confirm"), "ACTIVE")
        self.assertEqual(csm.validate_transition("ACTIVE", action="unsubscribe"), "UNSUBSCRIBED")
        self.assertEqual(csm.validate_transition("UNSUBSCRIBED", action="reactivate"), "ACTIVE")
        self.assertEqual(csm.validate_transition("BOUNCED", action="reactivate"), "ACTIVE")
        with self.assertRaises(sm.InvalidStateTransition):
            csm.validate_transition("COMPLAINED", action="reactivate")

    def test_provider_health_and_mailbox_sync(self):
        psm = sm.PROVIDER_HEALTH_STATE_MACHINE
        for state in ("UNKNOWN", "HEALTHY", "DEGRADED", "UNHEALTHY"):
            self.assertEqual(psm.validate_transition(state, action="health_check_pass"), "HEALTHY")
            self.assertEqual(psm.validate_transition(state, action="health_check_fail"), "UNHEALTHY")

        msm = sm.MAILBOX_SYNC_STATE_MACHINE
        self.assertEqual(msm.validate_transition("IDLE", action="start_sync"), "SYNCING")
        self.assertEqual(msm.validate_transition("SYNCING", action="finish_sync"), "IDLE")
        self.assertEqual(msm.validate_transition("SYNCING", action="fail_sync"), "ERROR")
        self.assertEqual(msm.validate_transition("ERROR", action="enable_sync"), "IDLE")
        with self.assertRaises(sm.InvalidStateTransition):
            msm.validate_transition("DISABLED", action="start_sync")


if __name__ == "__main__":
    unittest.main()
