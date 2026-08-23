import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.schemas.missions import (
    MissionSessionRecord,
    MissionStatus,
    MissionTurnRecord,
    TeamId,
)
from app.tools.repository import ProjectWorkspace


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _title_from_prompt(prompt: str) -> str:
    title = " ".join(prompt.strip().split())
    return title[:80] or "Team chat"


class MissionSessionStore:
    def __init__(self, project_root: str | Path) -> None:
        self.root = ProjectWorkspace(project_root).root
        self.directory = self.root / ".tova" / "missions"
        self.path = self.directory / "sessions.json"

    def list_sessions(self, *, project_id: str | None = None) -> list[MissionSessionRecord]:
        sessions = self._load()
        if project_id is not None:
            sessions = [session for session in sessions if session.project_id == project_id]
        return [
            session.model_copy(deep=True)
            for session in sorted(sessions, key=lambda item: item.updated_at, reverse=True)
        ]

    def get_session(self, session_id: str) -> MissionSessionRecord:
        for session in self._load():
            if session.id == session_id:
                return session.model_copy(deep=True)
        raise KeyError(session_id)

    def create_session(
        self,
        *,
        project_id: str,
        prompt: str,
        team_id: TeamId = "hipo",
        model_profile_id: str,
        model: str,
        mission_id: str,
        session_id: str | None = None,
    ) -> MissionSessionRecord:
        timestamp = _now()
        session = MissionSessionRecord(
            id=session_id or f"session_{uuid4().hex}",
            project_id=project_id,
            project_root=str(self.root),
            title=_title_from_prompt(prompt),
            team_id=team_id,
            status=MissionStatus.CREATED,
            active_mission_id=mission_id,
            created_at=timestamp,
            updated_at=timestamp,
            turns=[
                MissionTurnRecord(
                    mission_id=mission_id,
                    prompt=prompt,
                    team_id=team_id,
                    status=MissionStatus.CREATED,
                    model_profile_id=model_profile_id,
                    model=model,
                    created_at=timestamp,
                    updated_at=timestamp,
                )
            ],
        )
        sessions = self._load()
        sessions.append(session)
        self._save(sessions)
        return session.model_copy(deep=True)

    def append_turn(
        self,
        session_id: str,
        *,
        prompt: str,
        team_id: TeamId = "hipo",
        model_profile_id: str,
        model: str,
        mission_id: str,
    ) -> MissionSessionRecord:
        sessions = self._load()
        for index, session in enumerate(sessions):
            if session.id != session_id:
                continue
            timestamp = _now()
            session.turns.append(
                MissionTurnRecord(
                    mission_id=mission_id,
                    prompt=prompt,
                    team_id=team_id,
                    status=MissionStatus.CREATED,
                    model_profile_id=model_profile_id,
                    model=model,
                    created_at=timestamp,
                    updated_at=timestamp,
                )
            )
            session.active_mission_id = mission_id
            session.team_id = team_id
            session.status = MissionStatus.CREATED
            session.updated_at = timestamp
            sessions[index] = session
            self._save(sessions)
            return session.model_copy(deep=True)
        raise KeyError(session_id)

    def build_context_summary(self, session_id: str, *, max_files: int = 40) -> str:
        session = self.get_session(session_id)
        lines = [
            f"Team Chat Session: {session.title}",
            "Previous prompts and outcomes:",
        ]
        for index, turn in enumerate(session.turns, start=1):
            lines.append(f"{index}. User: {turn.prompt}")
            if turn.summary:
                lines.append(f"   Result: {turn.summary}")
            else:
                lines.append(f"   Status: {turn.status.value}")
        workspace = ProjectWorkspace(self.root)
        entries = workspace.list(".")[:max_files]
        if entries:
            lines.append("Current project files:")
            lines.extend(f"- {path}" for path in entries)
        return "\n".join(lines)

    def build_project_context_summary(self, *, max_files: int = 40) -> str:
        workspace = ProjectWorkspace(self.root)
        entries = workspace.list(".")[:max_files]
        if not entries:
            return ""
        lines = [
            "Current project files:",
            *[f"- {path}" for path in entries],
        ]
        if {"index.html", "style.css", "script.js"}.issubset(set(entries)):
            lines.append(
                "Detected existing static website. Prefer editing index.html, "
                "style.css, and script.js for website changes; do not create a "
                "new src/ framework structure unless the user explicitly asks."
            )
        return "\n".join(lines)

    def update_turn_status(
        self,
        session_id: str,
        mission_id: str,
        *,
        status: MissionStatus,
        summary: str = "",
    ) -> MissionSessionRecord:
        sessions = self._load()
        for session_index, session in enumerate(sessions):
            if session.id != session_id:
                continue
            timestamp = _now()
            for turn_index, turn in enumerate(session.turns):
                if turn.mission_id != mission_id:
                    continue
                session.turns[turn_index] = turn.model_copy(
                    update={
                        "status": status,
                        "summary": summary.strip() or turn.summary,
                        "updated_at": timestamp,
                    }
                )
                session.status = status
                session.active_mission_id = mission_id
                session.updated_at = timestamp
                sessions[session_index] = session
                self._save(sessions)
                return session.model_copy(deep=True)
            raise KeyError(mission_id)
        raise KeyError(session_id)

    def _load(self) -> list[MissionSessionRecord]:
        if not self.path.exists():
            return []
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return []
        return [MissionSessionRecord.model_validate(item) for item in data]

    def _save(self, sessions: list[MissionSessionRecord]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        payload = [session.model_dump(mode="json") for session in sessions]
        self.path.write_text(
            json.dumps(payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )
