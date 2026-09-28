"""
Ciel Server — High-Speed Async Web & WebSocket Server
Drives the Ciel Web HUD, audio streaming, and multi-agent event orchestration.
Powered by aiohttp.
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from aiohttp import web

BASE_DIR = Path(__file__).parent
WORKSPACE_DIR = BASE_DIR.parent
HUD_DIR = WORKSPACE_DIR / "ciel-hud"
AUDIO_DIR = BASE_DIR / "audio_cache"

AUDIO_DIR.mkdir(exist_ok=True)
HUD_DIR.mkdir(exist_ok=True)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from ciel_orchestrator import CielOrchestrator
from voice_engine import transcribe_audio, transcribe_audio_groq, prune_audio_cache
from eunchae_engine import get_system_vitals
from llm_client import get_brain_status
from proactive_sentinel import evaluate_proactive_suggestions

ciel = CielOrchestrator()
active_websockets = set()


async def broadcast_ws(payload: dict):
    """Sends live state updates to all open HUD browsers."""
    if not active_websockets:
        return
    msg = json.dumps(payload)
    dead_ws = set()
    for ws in active_websockets:
        try:
            await ws.send_str(msg)
        except Exception:
            dead_ws.add(ws)
    active_websockets.difference_update(dead_ws)


async def handle_telemetry(request):
    """Returns real-time system, memory, and AI brain status."""
    vitals = get_system_vitals() if get_system_vitals else {}
    brain = get_brain_status() if get_brain_status else {}
    return web.json_response({
        "status": "online",
        "name": "Ciel",
        "vitals": vitals,
        "brain": brain,
        "memory_turns": len(ciel.conversation_history)
    })


async def handle_clear_memory(request):
    """Resets the short-term working conversation memory."""
    ciel.reset_memory()
    await broadcast_ws({"type": "memory_cleared", "message": "Session memory cleared."})
    return web.json_response({"status": "cleared", "turns": 0})


async def handle_get_memory(request):
    """Returns active session conversation memory turns."""
    return web.json_response({
        "turns": len(ciel.conversation_history),
        "history": ciel.conversation_history
    })


async def handle_chat(request):
    """Standard REST chat dispatch for Ciel."""
    try:
        data = await request.json()
        user_prompt = data.get("prompt", "").strip()
        if not user_prompt:
            return web.json_response({"error": "Empty prompt"}, status=400)

        # Broadcast start
        await broadcast_ws({"type": "chat_received", "prompt": user_prompt})

        # Execute mission with live WS events
        result = await ciel.execute_mission(user_prompt, event_callback=broadcast_ws)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_suggestions(request):
    """Returns real-time proactive suggestions evaluated across sentinels."""
    try:
        suggs = evaluate_proactive_suggestions()
        return web.json_response({
            "suggestions": suggs,
            "count": len(suggs),
            "timestamp": asyncio.get_event_loop().time()
        })
    except Exception as e:
        return web.json_response({"error": str(e), "suggestions": []}, status=500)


async def handle_transcribe(request):
    """Receives voice audio from HUD microphone and returns transcribed text."""
    try:
        reader = await request.multipart()
        audio_bytes = None
        filename = "recording.wav"

        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "file":
                filename = part.filename or "recording.wav"
                audio_bytes = await part.read()
                break

        if not audio_bytes:
            return web.json_response({"error": "No audio received"}, status=400)

        result = transcribe_audio(audio_bytes, filename=filename)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def websocket_handler(request):
    """Maintains a persistent bi-directional connection for live agent pulsing."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    active_websockets.add(ws)

    # Send initial welcome telemetry
    await ws.send_str(json.dumps({
        "type": "ciel_connected",
        "message": "Ciel Core linked to HUD.",
        "agents": ["sakura", "chaewon", "kazuha", "yunjin", "eunchae"]
    }))

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                action = data.get("action")
                if action == "chat":
                    prompt = data.get("prompt", "")
                    await ciel.execute_mission(prompt, event_callback=broadcast_ws)
                elif action == "ping":
                    await ws.send_str(json.dumps({"type": "pong", "time": asyncio.get_event_loop().time()}))
    finally:
        active_websockets.discard(ws)

    return ws


async def background_sentinel_worker(app):
    """Periodically monitors workspace sentinels and broadcasts suggestions to HUD."""
    print("👁️ [CielServer] Proactive Sentinel watcher loop initialized.")
    while True:
        try:
            await asyncio.sleep(45)
            if active_websockets:
                suggs = evaluate_proactive_suggestions()
                await broadcast_ws({
                    "type": "ciel_suggestion",
                    "suggestions": suggs,
                    "count": len(suggs)
                })
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"⚠️ [CielServer] Sentinel worker warning: {e}", flush=True)


async def start_background_tasks(app):
    app["sentinel_task"] = asyncio.create_task(background_sentinel_worker(app))


async def cleanup_background_tasks(app):
    if "sentinel_task" in app:
        app["sentinel_task"].cancel()
        try:
            await app["sentinel_task"]
        except asyncio.CancelledError:
            pass


def create_app():
    # Auto-prune audio cache on server spin-up
    pruned = prune_audio_cache()
    if pruned:
        print(f"🧹 [CielServer] Pruned {pruned} old audio cache files.")

    app = web.Application()
    app.on_startup.append(start_background_tasks)
    app.on_cleanup.append(cleanup_background_tasks)
    
    # API endpoints
    app.router.add_get("/api/telemetry", handle_telemetry)
    app.router.add_get("/api/suggestions", handle_get_suggestions)
    app.router.add_post("/api/chat", handle_chat)
    app.router.add_post("/api/transcribe", handle_transcribe)
    app.router.add_get("/ws", websocket_handler)
    app.router.add_post("/api/memory/clear", handle_clear_memory)
    app.router.add_get("/api/memory", handle_get_memory)

    # Static audio cache serving
    app.router.add_static("/audio", path=str(AUDIO_DIR), name="audio")

    # Static HUD UI serving
    app.router.add_static("/", path=str(HUD_DIR), name="hud", show_index=True)

    return app


if __name__ == "__main__":
    port = int(os.getenv("CIEL_PORT", 8000))
    print(f"✨ Starting Ciel Server on http://localhost:{port}")
    app = create_app()
    web.run_app(app, host="127.0.0.1", port=port)
