from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.api.missions import event_broadcaster, event_store, mission_registry

router = APIRouter(prefix="/api")


@router.websocket("/ws/missions/{mission_id}")
async def mission_events(
    websocket: WebSocket,
    mission_id: str,
    after_sequence: int = Query(default=0, ge=0),
) -> None:
    try:
        mission_registry.get(mission_id)
    except KeyError:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    queue = event_broadcaster.subscribe(mission_id)
    last_sequence = after_sequence
    try:
        replay = await event_store.list_after(mission_id, after_sequence)
        for event in replay:
            await websocket.send_json(event.model_dump(mode="json"))
            last_sequence = event.sequence
        while True:
            event = await queue.get()
            if event.sequence <= last_sequence:
                continue
            await websocket.send_json(event.model_dump(mode="json"))
            last_sequence = event.sequence
    except WebSocketDisconnect:
        pass
    finally:
        event_broadcaster.unsubscribe(mission_id, queue)
