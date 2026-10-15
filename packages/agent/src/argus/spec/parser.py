from argus_contracts.models import Spec

from argus.state.test_case import TestCase


def parse_spec(description: str) -> Spec:
    """Return a minimal typed spec until model-backed journey decomposition is configured."""
    if not description.strip():
        raise ValueError("spec description cannot be empty")
    journey = TestCase(id="journey-001", journey="Main journey",
                       description="Exercise the primary journey described by the spec.",
                       expected="", steps=[], category="journey", source="spec")
    return Spec(description=description, journeys=[journey])
