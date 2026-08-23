import asyncio
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from app.events.broadcaster import EventBroadcaster
from app.events.reconstruct import reconstruct_mission
from app.events.store import EventStore
from app.schemas.events import EventEnvelope, EventType
from app.schemas.mission_plan import (
    MissionPlan,
    MissionPlanAcceptRequest,
    MissionPlanView,
)
from app.schemas.missions import (
    MissionCreateRequest,
    MissionRecord,
    MissionStatus,
)
from app.services.mission_sessions import MissionSessionStore
from app.services.plan_review import apply_plan_edits
from app.tools.repository import ProjectWorkspace

RuntimeLauncher = Callable[[MissionRecord], Coroutine[Any, Any, None]]


class PlanDecisionKind(StrEnum):
    ACCEPT = "accept"
    REGENERATE = "regenerate"
    DENY = "deny"


@dataclass(frozen=True)
class PlanDecision:
    kind: PlanDecisionKind
    plan: MissionPlan | None = None
    notes: str = ""


class MissionRegistry:
    def __init__(
        self,
        store: EventStore,
        broadcaster: EventBroadcaster,
    ) -> None:
        self.store = store
        self.broadcaster = broadcaster
        self._missions: dict[str, MissionRecord] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._run_events: dict[str, asyncio.Event] = {}
        self._plans: dict[str, MissionPlan] = {}
        self._plan_views: dict[str, MissionPlanView] = {}
        self._plan_decisions: dict[str, asyncio.Future[PlanDecision]] = {}
        self._emit_lock = asyncio.Lock()
        self._plan_lock = asyncio.Lock()
        self._runtime_launcher: RuntimeLauncher | None = None

    def set_runtime_launcher(self, launcher: RuntimeLauncher) -> None:
        self._runtime_launcher = launcher

    async def create(
        self,
        project_id: str,
        request: MissionCreateRequest,
        *,
        project_root: str,
        session_id: str | None = None,
        turn_index: int | None = None,
        context_summary: str = "",
    ) -> MissionRecord:
        workspace = ProjectWorkspace(project_root)
        mission = MissionRecord(
            id=f"mission_{uuid4().hex}",
            project_id=project_id,
            objective=request.objective,
            team_id=request.team_id,
            project_root=str(workspace.root),
            model_profile_id=request.model_profile_id,
            model=request.model,
            status=MissionStatus.CREATED,
            session_id=session_id,
            turn_index=turn_index,
            context_summary=context_summary,
        )
        self._missions[mission.id] = mission
        self._cancel_events[mission.id] = asyncio.Event()
        self._run_events[mission.id] = asyncio.Event()
        self._plans.pop(mission.id, None)
        self._plan_views.pop(mission.id, None)
        self._plan_decisions.pop(mission.id, None)
        self.store.persist_mission(mission)
        await self.emit(
            mission.id,
            "mission.created",
            {
                "objective": mission.objective,
                "team_id": mission.team_id,
                "project_root": mission.project_root,
                "model_profile_id": mission.model_profile_id,
                "model": mission.model,
                "session_id": mission.session_id,
                "turn_index": mission.turn_index,
                "context_summary": mission.context_summary,
            },
        )
        return mission.model_copy(deep=True)

    async def start(self, mission_id: str) -> MissionRecord:
        mission = self._require(mission_id)
        if mission.status not in {MissionStatus.CREATED, MissionStatus.PAUSED}:
            raise ValueError("Mission cannot be started")
        mission.status = MissionStatus.RUNNING
        self.store.persist_mission(mission)
        self._run_events[mission_id].set()
        if self._runtime_launcher is not None and mission_id not in self._tasks:
            task: asyncio.Task[None] = asyncio.create_task(
                self._runtime_launcher(mission.model_copy(deep=True))
            )
            self._tasks[mission_id] = task
            task.add_done_callback(lambda _task: self._tasks.pop(mission_id, None))
        return mission.model_copy(deep=True)

    async def pause(self, mission_id: str) -> MissionRecord:
        mission = self._require(mission_id)
        if mission.status != MissionStatus.RUNNING:
            raise ValueError("Only running missions can be paused")
        mission.status = MissionStatus.PAUSED
        self.store.persist_mission(mission)
        self._run_events[mission_id].clear()
        await self.emit(mission_id, "mission.paused", {"summary": "Mission paused"})
        return mission.model_copy(deep=True)

    async def resume(self, mission_id: str) -> MissionRecord:
        mission = self._require(mission_id)
        if mission.status != MissionStatus.PAUSED:
            raise ValueError("Only paused missions can be resumed")
        mission.status = MissionStatus.RUNNING
        self.store.persist_mission(mission)
        self._run_events[mission_id].set()
        await self.emit(mission_id, "mission.resumed", {"summary": "Mission resumed"})
        return mission.model_copy(deep=True)

    async def cancel(self, mission_id: str) -> MissionRecord:
        mission = self._require(mission_id)
        if mission.status in {MissionStatus.COMPLETED, MissionStatus.CANCELLED}:
            raise ValueError("Mission is already terminal")
        mission.status = MissionStatus.CANCELLED
        self.store.persist_mission(mission)
        self._cancel_events[mission_id].set()
        self._run_events[mission_id].set()
        future = self._plan_decisions.get(mission_id)
        if future is not None and not future.done():
            future.cancel()
        task = self._tasks.get(mission_id)
        if task is not None:
            task.cancel()
        await self.emit(mission_id, "mission.cancelled", {"summary": "Mission cancelled"})
        return mission.model_copy(deep=True)

    async def propose_plan(
        self,
        mission_id: str,
        plan: MissionPlan,
        view: MissionPlanView,
    ) -> MissionPlanView:
        self._require(mission_id)
        async with self._plan_lock:
            self._plans[mission_id] = plan.model_copy(deep=True)
            self._plan_views[mission_id] = view.model_copy(deep=True)
            loop = asyncio.get_running_loop()
            previous = self._plan_decisions.get(mission_id)
            if previous is not None and not previous.done():
                previous.cancel()
            self._plan_decisions[mission_id] = loop.create_future()
        await self.emit(
            mission_id,
            "mission.plan.proposed",
            {**view.model_dump(), "team_id": self._require(mission_id).team_id},
        )
        return view.model_copy(deep=True)

    def get_proposed_plan(self, mission_id: str) -> MissionPlanView:
        self._require(mission_id)
        view = self._plan_views.get(mission_id)
        if view is None:
            raise LookupError("No proposed plan")
        return view.model_copy(deep=True)

    async def accept_plan(
        self,
        mission_id: str,
        request: MissionPlanAcceptRequest,
    ) -> MissionPlanView:
        self._require(mission_id)
        async with self._plan_lock:
            plan = self._plans.get(mission_id)
            future = self._plan_decisions.get(mission_id)
            if plan is None or future is None or future.done():
                raise ValueError("No proposed plan is awaiting a decision")
            updated = apply_plan_edits(plan, request)
            self._plans[mission_id] = updated
            view = self._plan_views.get(mission_id)
            if view is None:
                raise ValueError("No proposed plan is awaiting a decision")
            view = view.model_copy(deep=True)
            view.interpretation = updated.interpretation
            rationale_by_role = {
                assignment.staff_role: assignment.rationale
                for assignment in updated.assignments
            }
            objective_by_role = {
                assignment.staff_role: assignment.objective
                for assignment in updated.assignments
            }
            view.assignments = [
                assignment
                for assignment in view.assignments
                if assignment.staff_role in rationale_by_role
            ]
            for assignment in view.assignments:
                assignment.rationale = rationale_by_role.get(
                    assignment.staff_role,
                    assignment.rationale,
                )
                assignment.objective = objective_by_role.get(
                    assignment.staff_role,
                    assignment.objective,
                )
            self._plan_views[mission_id] = view
            future.set_result(PlanDecision(kind=PlanDecisionKind.ACCEPT, plan=updated))
        await self.emit(
            mission_id,
            "mission.plan.accepted",
            {**view.model_dump(), "team_id": self._require(mission_id).team_id},
        )
        return view.model_copy(deep=True)

    async def regenerate_plan(self, mission_id: str, notes: str = "") -> None:
        self._require(mission_id)
        async with self._plan_lock:
            future = self._plan_decisions.get(mission_id)
            if future is None or future.done():
                raise ValueError("No proposed plan is awaiting a decision")
            future.set_result(
                PlanDecision(kind=PlanDecisionKind.REGENERATE, notes=notes.strip())
            )
        await self.emit(
            mission_id,
            "mission.plan.regenerating",
            {"summary": "Regenerating mission plan", "notes": notes.strip()},
        )

    async def deny_plan(self, mission_id: str, notes: str = "") -> None:
        mission = self._require(mission_id)
        async with self._plan_lock:
            future = self._plan_decisions.get(mission_id)
            if future is None or future.done():
                raise ValueError("No proposed plan is awaiting a decision")
            mission.status = MissionStatus.CANCELLED
            future.set_result(
                PlanDecision(kind=PlanDecisionKind.DENY, notes=notes.strip())
            )
        self._run_events[mission_id].set()
        await self.emit(
            mission_id,
            "mission.plan.denied",
            {
                "summary": "Alex's proposed plan was denied",
                "notes": notes.strip(),
                "status": MissionStatus.CANCELLED.value,
            },
        )

    async def wait_for_plan_decision(self, mission_id: str) -> PlanDecision:
        self._require(mission_id)
        future = self._plan_decisions.get(mission_id)
        if future is None:
            raise KeyError(mission_id)
        cancel = self._cancel_events[mission_id]
        decision_task: asyncio.Future[PlanDecision] = asyncio.ensure_future(
            asyncio.shield(future)
        )
        cancel_task = asyncio.create_task(cancel.wait())
        wait_tasks: set[asyncio.Future[Any]] = {decision_task, cancel_task}
        try:
            _done, pending = await asyncio.wait(
                wait_tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            if cancel.is_set():
                raise asyncio.CancelledError
            return await decision_task
        finally:
            for task in (decision_task, cancel_task):
                if not task.done():
                    task.cancel()

    def get(self, mission_id: str) -> MissionRecord:
        return self._require(mission_id).model_copy(deep=True)

    def cancellation_event(self, mission_id: str) -> asyncio.Event:
        self._require(mission_id)
        return self._cancel_events[mission_id]

    async def wait_until_running(self, mission_id: str) -> None:
        self._require(mission_id)
        await self._run_events[mission_id].wait()
        if self._cancel_events[mission_id].is_set():
            raise asyncio.CancelledError

    def set_status(self, mission_id: str, status: MissionStatus) -> None:
        mission = self._require(mission_id)
        mission.status = status
        self.store.persist_mission(mission)

    async def restore(self) -> None:
        snapshots = {item.id: item for item in await self.store.load_missions()}
        mission_ids = set(await self.store.list_mission_ids()) | set(snapshots)
        for mission_id in mission_ids:
            record = snapshots.get(mission_id)
            if record is None:
                events = await self.store.list_after(mission_id, 0)
                record = reconstruct_mission(events)
            if record is None:
                continue
            restored = record.model_copy(deep=True)
            if restored.status == MissionStatus.RUNNING:
                restored.status = MissionStatus.PAUSED
            self._missions[restored.id] = restored
            self._cancel_events[restored.id] = asyncio.Event()
            run = asyncio.Event()
            if restored.status in {
                MissionStatus.COMPLETED,
                MissionStatus.FAILED,
                MissionStatus.CANCELLED,
            }:
                run.set()
            self._run_events[restored.id] = run
            self.store.persist_mission(restored)

    async def aclose(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks.clear()

    async def emit(
        self,
        mission_id: str,
        event_type: EventType,
        payload: dict[str, Any],
        *,
        staff_id: str | None = None,
    ) -> EventEnvelope:
        mission = self._require(mission_id)
        async with self._emit_lock:
            sequence = await self.store.next_sequence(mission_id)
            event = EventEnvelope(
                version="1.0",
                event_id=f"evt_{uuid4().hex}",
                event_type=event_type,
                timestamp=datetime.now(UTC),
                project_id=mission.project_id,
                mission_id=mission.id,
                staff_id=staff_id,
                sequence=sequence,
                payload=payload,
            )
            await self.store.append(event)
            self.store.persist_mission(mission)
            self._sync_session_turn(mission, payload)
            await self.broadcaster.publish(event)
            return event

    def _require(self, mission_id: str) -> MissionRecord:
        mission = self._missions.get(mission_id)
        if mission is None:
            raise KeyError(mission_id)
        return mission

    def _sync_session_turn(
        self,
        mission: MissionRecord,
        payload: dict[str, Any],
    ) -> None:
        if mission.session_id is None:
            return
        if mission.status not in {
            MissionStatus.COMPLETED,
            MissionStatus.FAILED,
            MissionStatus.CANCELLED,
        }:
            return
        summary = payload.get("summary", "")
        try:
            MissionSessionStore(mission.project_root).update_turn_status(
                mission.session_id,
                mission.id,
                status=mission.status,
                summary=summary if isinstance(summary, str) else "",
            )
        except KeyError:
            return
