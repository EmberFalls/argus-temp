from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

import typer
from rich import print

from argus.config import settings
from argus.state.test_case import TestCase
from argus.supervisor.loop import run_qa

app = typer.Typer(
    help="Explore web applications and collect reproducible QA evidence.",
    no_args_is_help=True,
)


def _run(url: str | None, spec: str | None, output: Path,
         journeys: Path | None, stubs: bool, real: str | None) -> None:
    if stubs:
        from argus.stubs import run_stub_demo

        real_roles = tuple(role.strip() for role in (real or "").split(",") if role.strip())
        try:
            result = run_stub_demo(output, real_roles=real_roles)
        except (TypeError, ValueError) as exc:
            raise typer.BadParameter(str(exc), param_hint="--real") from exc
        mode = "mixed run" if real_roles else "stub run"
        print(f"[green]Walking skeleton complete[/green] ({mode}): {len(result['state'].findings)} findings, "
              f"{len(result['state'].bugs_found)} verified report(s), {result['event_count']} events")
        if real_roles:
            print(f"Components swapped in: {', '.join(real_roles)}")
        if result["reports"]:
            from argus.agents.reporter import format_markdown

            print(format_markdown(result["reports"][0]))
        print(f"Artifacts: {result['artifact_dir']}")
        return
    if real:
        raise typer.BadParameter("--real can only be used together with --stubs", param_hint="--real")
    if not url:
        raise typer.BadParameter("--url is required unless --stubs is selected", param_hint="--url")
    if not spec:
        raise typer.BadParameter("--spec is required unless --stubs is selected", param_hint="--spec")
    cases = None
    if journeys:
        raw = json.loads(journeys.read_text(encoding="utf-8"))
        cases = [TestCase.model_validate(item) for item in raw]
    summary = asyncio.run(run_qa(url, spec, cases, output))
    print(f"[green]Run complete[/green]: {summary['metrics']}")
    print(f"Evidence: {summary['artifact_dir']}")


@app.callback(invoke_without_command=True)
def default_run(
    ctx: typer.Context,
    url: str | None = typer.Option(None, help="Target web application URL"),
    spec: str | None = typer.Option(None, help="Short description of expected application behavior"),
    output: Path = typer.Option(settings.artifact_dir, help="Directory for run evidence"),  # noqa: B008
    journeys: Path | None = typer.Option(None, help="JSON file containing explicit TestCase objects"),  # noqa: B008
    stubs: bool = typer.Option(False, "--stubs", help="Run all role interfaces against golden fixtures; no browser or network required"),
    real: str | None = typer.Option(
        None, "--real", help="Comma-separated roles to replace (for example: explorer,tester)"
    ),
) -> None:
    """Keep the original top-level run syntax as a backwards-compatible shortcut."""
    if ctx.invoked_subcommand is None:
        _run(url, spec, output, journeys, stubs, real)


@app.command()
def run(
    url: str | None = typer.Option(None, help="Target web application URL"),
    spec: str | None = typer.Option(None, help="Short description of expected application behavior"),
    output: Path = typer.Option(settings.artifact_dir, help="Directory for run evidence"),  # noqa: B008
    journeys: Path | None = typer.Option(None, help="JSON file containing explicit TestCase objects"),  # noqa: B008
    stubs: bool = typer.Option(False, "--stubs", help="Run all role interfaces against golden fixtures; no browser or network required"),
    real: str | None = typer.Option(
        None, "--real", help="Comma-separated roles to replace (for example: explorer,tester)"
    ),
) -> None:
    """Run the fixture skeleton or inspect a target and execute supplied journeys."""
    _run(url, spec, output, journeys, stubs, real)


def _default_snapshot_path(url: str) -> Path:
    parsed = urlsplit(url)
    host = re.sub(r"[^A-Za-z0-9._-]+", "_", parsed.netloc).strip("._-") or "page"
    path = re.sub(r"[^A-Za-z0-9._-]+", "_", parsed.path.strip("/"))
    stem = f"{host}_{path}" if path else f"{host}_index"
    return settings.artifact_dir / "snapshots" / f"{stem[:150]}.json"


@app.command()
def snapshot(
    url: str = typer.Argument(..., help="HTTP(S) page URL to snapshot"),
    output: Path | None = typer.Option(None, "--output", help="JSON output file (default: artifacts/snapshots/<page>.json)"),  # noqa: B008
    max_tokens: int = typer.Option(1500, "--max-tokens", min=1, max=1500,
                                   help="Maximum estimated tokens in the compact prompt rendering"),
) -> None:
    """Write a page ARIA snapshot and semantic element catalog as JSON."""
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise typer.BadParameter("URL must use http:// or https://", param_hint="url")

    from argus.browser.session import BrowserSessionFactory
    from argus.perception.a11y import inspect_page

    destination = output or _default_snapshot_path(url)

    async def capture() -> dict:
        async with BrowserSessionFactory(artifact_dir=destination.parent / "browser") as factory:
            session, _ = await factory.new_context(settings.browser)
            try:
                await session.page.goto(url, wait_until="domcontentloaded", timeout=30000)
                return await inspect_page(session.page, max_tokens=max_tokens)
            finally:
                await session.close()

    result = asyncio.run(capture())
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    visible_total = sum(1 for item in result["elements"] if item["visible"])
    print(f"[green]Snapshot saved[/green]: {destination}")
    print(f"Page: {result['title'] or '(untitled)'} — {result['url']}")
    print(f"Controls: {len(result['elements'])} total, {visible_total} visible")
    print(f"Strict-mode locators: {result['visible_strict_mode_resolved']}/{visible_total} visible controls "
          f"({result['visible_strict_mode_resolution_rate']:.1%})")
    print(f"Compact rendering: {result['compact_token_estimate']}/{max_tokens} estimated tokens")

