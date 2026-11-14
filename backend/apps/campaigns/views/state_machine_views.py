"""
Machine- and developer-readable State Machine Introspection Views (DX + AX).
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound

from ..state_machines import STATE_MACHINE_REGISTRY, get_all_state_machine_schemas


class StateMachineCatalogView(APIView):
    """
    Inspect all declarative state machines (states, transitions, actors, endpoints,
    and Mermaid state diagrams) for Developer Experience and Agent Experience.

    GET /api/v1/campaigns/state-machines/
    GET /api/v1/campaigns/state-machines/<name>/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, name=None):
        if name:
            sm = STATE_MACHINE_REGISTRY.get(name)
            if not sm:
                raise NotFound(
                    f"State machine '{name}' not found. "
                    f"Available: {', '.join(sorted(STATE_MACHINE_REGISTRY.keys()))}"
                )
            current_state = request.query_params.get('current_state')
            actor = request.query_params.get('actor')
            payload = sm.to_schema()
            if current_state:
                payload['evaluation'] = sm.get_state_payload(current_state, actor=actor)
            return Response(payload)

        return Response({
            'count': len(STATE_MACHINE_REGISTRY),
            'machines': get_all_state_machine_schemas(),
        })
