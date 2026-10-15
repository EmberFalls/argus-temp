from __future__ import annotations

import asyncio

from argus_contracts.artifacts import RunArtifactLayout
from argus_contracts.models import Evidence
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page

from argus.browser.session import BrowserSession
from argus.evidence.recorder import EvidenceRecorder
from argus.perception.a11y import resolve_semantic_locator
from argus.state.test_case import Step, TestCase


async def execute_case(session: BrowserSession, case: TestCase, layout: RunArtifactLayout,
                       *, initial_url: str | None = None,
                       synthetic_values: tuple[str, ...] = ()) -> tuple[str, Evidence, int]:
    started = asyncio.get_running_loop().time()
    page = session.page
    recorder = EvidenceRecorder(session, layout, case.id, case.steps,
                                expected=case.expected, synthetic_values=synthetic_values)
    actual = "Journey completed."
    verdict = "PASS"
    if initial_url:
        recorder.current_step_index = 0
        try:
            await page.goto(initial_url, wait_until="domcontentloaded", timeout=30000)
        except PlaywrightError as exc:
            verdict, actual = "FAIL", f"{type(exc).__name__}: {exc}"
    for step_index, step in enumerate(case.steps):
        if verdict == "FAIL":
            break
        await recorder.begin_step(
            step_index, _step_element(page, step),
            step=step,
            sensitive=bool(step.value and step.value in recorder.redactor.secret_values),
        )
        try:
            await _run_step(page, step)
        except PlaywrightError as exc:
            verdict, actual = "FAIL", f"{type(exc).__name__}: {exc}"
        await recorder.finish_step(step_index)
        if verdict == "FAIL":
            break
    evidence = await recorder.finish(actual=actual)
    elapsed = int((asyncio.get_running_loop().time() - started) * 1000)
    return verdict, evidence, elapsed


def _step_element(page: Page, step: Step):
    if step.action in {"click", "fill", "hover"} and step.locator:
        return _semantic_locator(page, step.locator)
    if step.action == "assert":
        return page.get_by_text(step.value or step.locator, exact=False)
    return None


async def _run_step(page: Page, step: Step) -> None:
    if step.action == "goto":
        await page.goto(step.value or step.locator, wait_until="domcontentloaded", timeout=step.timeout_ms)
    elif step.action == "wait":
        await page.wait_for_timeout(min(step.timeout_ms, 10000))
    elif step.action == "assert":
        locator = page.get_by_text(step.value or step.locator, exact=False)
        await locator.first.wait_for(state="visible", timeout=step.timeout_ms)
    else:
        locator = _semantic_locator(page, step.locator)
        if step.action == "click":
            await locator.click(timeout=step.timeout_ms)
        elif step.action == "fill":
            await locator.fill(step.value or "", timeout=step.timeout_ms)
        elif step.action == "hover":
            await locator.hover(timeout=step.timeout_ms)


def _semantic_locator(page: Page, expression: str):
    """Resolve catalog semantic locators, including duplicate-name ordinals."""
    return resolve_semantic_locator(page, expression)
