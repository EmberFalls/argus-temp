from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    artifact_dir: Path = Path(os.getenv("ARGUS_ARTIFACT_DIR", "artifacts"))
    api_token: str = os.getenv("ARGUS_API_TOKEN", "")
    allowed_domains: tuple[str, ...] = tuple(
        domain.strip().lower()
        for domain in os.getenv("ARGUS_ALLOWED_DOMAINS", "localhost,127.0.0.1").split(",")
        if domain.strip()
    )
    browser: str = os.getenv("ARGUS_BROWSER", "chromium")


settings = Settings()
