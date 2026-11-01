"""Session directory layout and loading."""

from __future__ import annotations

import datetime as dt
import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from aimharness.data.schema import TABLES


def sessions_root(data_root: Path) -> Path:
    return data_root / "sessions"


def new_session_dir(data_root: Path, scenario_id: str, now: dt.datetime | None = None) -> Path:
    now = now or dt.datetime.now()
    base = sessions_root(data_root) / f"{now:%Y-%m-%d_%H-%M-%S}_{scenario_id}"
    path, n = base, 1
    while path.exists():
        n += 1
        path = base.with_name(f"{base.name}_{n}")
    return path


def list_sessions(data_root: Path) -> list[Path]:
    root = sessions_root(data_root)
    if not root.is_dir():
        return []
    return sorted(p for p in root.iterdir() if (p / "meta.json").exists())


def resolve_session(data_root: Path, ref: str) -> Path:
    """'latest', a directory path, a session name or a unique name prefix."""
    sessions = list_sessions(data_root)
    if ref == "latest":
        if not sessions:
            raise FileNotFoundError("no recorded sessions")
        return sessions[-1]
    p = Path(ref)
    if (p / "meta.json").exists():
        return p
    matches = [s for s in sessions if s.name == ref] or [s for s in sessions if s.name.startswith(ref)]
    if len(matches) != 1:
        raise FileNotFoundError(f"session {ref!r} not found" if not matches else f"session {ref!r} is ambiguous")
    return matches[0]


def read_meta(path: Path) -> dict:
    return json.loads((path / "meta.json").read_text(encoding="utf-8"))


@dataclass
class SessionData:
    path: Path
    meta: dict
    input_events: pd.DataFrame
    frames: pd.DataFrame
    target_frames: pd.DataFrame
    targets: pd.DataFrame
    shots: pd.DataFrame
    target_events: pd.DataFrame

    @property
    def scenario_id(self) -> str:
        return self.meta["scenario"]["id"]

    @property
    def scoring(self) -> str:
        return self.meta["scenario"]["scoring"]


def load_session(path: Path) -> SessionData:
    meta = read_meta(path)
    tables = {}
    for name, cols in TABLES.items():
        f = path / f"{name}.parquet"
        tables[name] = pd.read_parquet(f) if f.exists() else pd.DataFrame(columns=list(cols)).astype(cols)
    return SessionData(path=path, meta=meta, **tables)
