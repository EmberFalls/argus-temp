from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from argus_contracts.artifacts import RunArtifactLayout
from argus_contracts.models import RunEvent, RunMetrics, RunSummary, TestResult

from argus.agents.explorer import explore
from argus.agents.tester import execute_case
from argus.browser.session import BrowserSessionFactory
from argus.config import settings
from argus.state.test_case import TestCase


async def run_qa(target_url: str, spec: str, journeys: list[TestCase] | None = None,
                 output_dir: Path | None = None, *, record_video: bool = False,
                 run_id: str | None = None) -> dict:
    output_dir = output_dir or settings.artifact_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    run_id = run_id or uuid4().hex
    layout = RunArtifactLayout(output_dir / "runs", run_id).initialize()
    layout.append_event(RunEvent(id=uuid4().hex, run_id=run_id, agent="supervisor",
                                 correlation_id=run_id, type="run_started",
                                 payload={"target_url": target_url, "spec": spec}))
    async with BrowserSessionFactory(artifact_dir=layout.artifacts_dir) as browser_factory:
        exploration_session, _ = await browser_factory.new_context(settings.browser)
        page = exploration_session.page
        await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
        snapshot, inventory = await explore(page)
        layout.append_event(RunEvent(id=uuid4().hex, run_id=run_id, agent="explorer",
                                     correlation_id=run_id, type="page_discovered",
                                     payload={"url": page.url, "element_count": len(inventory)}))
        await exploration_session.close()
        results = []
        for case in journeys or []:
            # A fresh context prevents cookie and web-storage state from crossing journeys.
            case_session, _ = await browser_factory.new_context(
                settings.browser,
                record={"trace": True, "video": record_video},
                artifact_id=case.id,
            )
            verdict, evidence, duration = await execute_case(
                case_session, case, layout, initial_url=target_url,
            )
            results.append(TestResult(test_id=case.id, verdict=verdict,
                                      evidence=evidence, duration_ms=duration))
            await case_session.close()
            layout.append_event(RunEvent(id=uuid4().hex, run_id=run_id, agent="tester",
                                         correlation_id=case.id, type="test_result",
                                         payload={"test_id": case.id, "verdict": verdict,
                                                  "duration_ms": duration}))
    summary = RunSummary(
        run_id=run_id, artifact_dir=str(layout.run_dir), target_url=target_url,
        spec=spec, accessibility_snapshot=snapshot,
        discovered_elements=inventory, test_results=results,
        metrics=RunMetrics(journeys=len(results),
                           passed=sum(r.verdict == "PASS" for r in results),
                           failed=sum(r.verdict == "FAIL" for r in results)),
    )
    result = summary.model_dump(mode="json")
    layout.write_state(result)
    layout.append_event(RunEvent(id=uuid4().hex, run_id=run_id, agent="supervisor",
                                 correlation_id=run_id, type="run_completed",
                                 payload={"status": "completed", "finding_count": 0,
                                          "artifact_dir": str(layout.run_dir)}))
    return result
