from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from types import SimpleNamespace

from argus import api
from argus.api import RunService
from argus.run_store import RunStore
from fastapi.testclient import TestClient


def _sse_frames(text: str) -> list[tuple[int, dict]]:
    frames = []
    for frame in text.strip().split("\n\n"):
        fields = dict(line.split(":", 1) for line in frame.splitlines() if ":" in line)
        if "id" in fields and "data" in fields:
            frames.append(
                (int(fields["id"].strip()), json.loads(fields["data"].strip()))
            )
    return frames


def _configure_api(monkeypatch, tmp_path: Path, *, token: str = "") -> None:
    monkeypatch.setattr(
        api,
        "settings",
        SimpleNamespace(artifact_dir=tmp_path, allowed_domains=(), api_token=token),
    )
    monkeypatch.setattr(api, "run_service", RunService(tmp_path))


def test_fixture_run_sse_resume_run_index_and_artifact_urls(tmp_path, monkeypatch):
    monkeypatch.delenv("ARGUS_API_TOKEN", raising=False)
    _configure_api(monkeypatch, tmp_path)
    with TestClient(api.app) as client:
        response = client.post(
            "/runs?mode=fixture",
            json={"url": "http://localhost:3100", "spec": "Fixture run"},
        )
        assert response.status_code == 202
        run_id = response.json()["run_id"]

        streamed = _sse_frames(client.get(f"/runs/{run_id}/events").text)
        sequences = [sequence for sequence, _ in streamed]
        assert len(streamed) == 60
        assert sequences == list(range(60))
        assert streamed[-1][1]["type"] == "run_completed"

        resumed = _sse_frames(
            client.get(f"/runs/{run_id}/events", headers={"Last-Event-ID": "24"}).text
        )
        assert [sequence for sequence, _ in resumed] == list(range(25, 60))

        detail = client.get(f"/runs/{run_id}")
        assert detail.status_code == 200
        assert detail.json()["status"] == "completed"
        assert detail.json()["artifacts"]
        report = next(
            item
            for item in detail.json()["artifacts"]
            if item["path"] == "reports/bug_reports.json"
        )
        artifact = client.get(report["url"])
        assert artifact.status_code == 200
        assert json.loads(artifact.text)

        listed = client.get("/runs").json()
        assert listed["total"] == 1
        assert listed["items"][0]["run_id"] == run_id
        assert RunStore(tmp_path).get(run_id)["status"] == "completed"


def test_real_run_start_and_api_token_protection(tmp_path, monkeypatch):
    _configure_api(monkeypatch, tmp_path, token="local-test-token")
    monkeypatch.setenv("ARGUS_API_TOKEN", "local-test-token")

    class TargetHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"<!doctype html><title>API target</title><h1>Target ready</h1><button>Continue</button>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format, *_args):
            return

    target_server = ThreadingHTTPServer(("127.0.0.1", 0), TargetHandler)
    target_thread = Thread(target=target_server.serve_forever, daemon=True)
    target_thread.start()
    target_url = f"http://127.0.0.1:{target_server.server_port}"
    try:
        with TestClient(api.app) as client:
            assert client.get("/health").status_code == 200
            request = {"url": target_url, "spec": "Real run"}
            assert client.post("/runs", json=request).status_code == 401

            headers = {"Authorization": "Bearer local-test-token"}
            response = client.post("/runs", json=request, headers=headers)
            assert response.status_code == 202
            run_id = response.json()["run_id"]
            events = client.get(f"/runs/{run_id}/events", headers=headers)
            frames = _sse_frames(events.text)
            assert [sequence for sequence, _ in frames] == [0, 1, 2]
            assert [event["type"] for _, event in frames] == [
                "run_started",
                "page_discovered",
                "run_completed",
            ]
            resumed = client.get(
                f"/runs/{run_id}/events",
                headers={**headers, "Last-Event-ID": "0"},
            )
            assert [sequence for sequence, _ in _sse_frames(resumed.text)] == [1, 2]
            detail = client.get(f"/runs/{run_id}", headers=headers).json()
            assert detail["status"] == "completed"
            assert detail["summary"]["accessibility_snapshot"]
    finally:
        target_server.shutdown()
        target_server.server_close()
        target_thread.join(timeout=2)
