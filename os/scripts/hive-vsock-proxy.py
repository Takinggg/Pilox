#!/usr/bin/env python3
"""
hive-vsock-proxy — Smart async inference proxy between agent VMs and the host.

Features:
  - Endpoint allowlist (blocks dangerous Ollama/vLLM admin endpoints)
  - Per-CID rate limiting (sliding window)
  - Activity tracking (Redis) for idle detection / auto-pause
  - Auto-resume: if agent is paused, resume it before forwarding
  - Body parsing: extract model, prompt length for routing decisions
  - Token counting: parse streaming responses for usage metrics
  - Priority tiers: concurrency limits per agent tier (low/medium/high)
  - vLLM OpenAI-compatible endpoint support
  - Async I/O: handles 200+ concurrent connections efficiently

Architecture:
  Agent VM (socat: localhost:11434 → vsock CID 2:11434)
    → this proxy (vsock :11434 → localhost:11434)
    → Ollama/vLLM (127.0.0.1:11434)
"""

import asyncio
import socket
import json
import time
import sys
import os
import signal
import urllib.request
from collections import defaultdict

# ── Config ────────────────────────────────────────────────

VSOCK_PORT = int(os.environ.get("VSOCK_PORT", "11434"))
INFERENCE_HOST = os.environ.get("INFERENCE_HOST", "127.0.0.1")
INFERENCE_PORT = int(os.environ.get("INFERENCE_PORT", "11434"))
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
HIVE_INTERNAL_TOKEN = os.environ.get("HIVE_INTERNAL_TOKEN", "")
HIVE_API_URL = os.environ.get("HIVE_API_URL", "http://localhost:3000")
INFERENCE_BACKEND = os.environ.get("INFERENCE_BACKEND", "ollama")

MAX_BODY_SIZE = 16 * 1024 * 1024
RATE_LIMIT_WINDOW_SEC = 60
RATE_LIMIT_MAX_REQUESTS = 120

# Ollama endpoints
OLLAMA_ENDPOINTS = {
    ("POST", "/api/generate"),
    ("POST", "/api/chat"),
    ("POST", "/api/embeddings"),
    ("POST", "/api/embed"),
    ("GET", "/api/tags"),
    ("POST", "/api/show"),
    ("GET", "/api/version"),
    ("GET", "/"),
}

# vLLM OpenAI-compatible endpoints
VLLM_ENDPOINTS = {
    ("POST", "/v1/chat/completions"),
    ("POST", "/v1/completions"),
    ("POST", "/v1/embeddings"),
    ("GET", "/v1/models"),
}

# Concurrency limits per tier
TIER_CONCURRENCY = {
    "low": 2,
    "medium": 5,
    "high": 10,
}

# ── Redis client (optional — graceful degradation) ────────

redis_client = None

async def init_redis():
    global redis_client
    try:
        import redis.asyncio as aioredis
        redis_client = aioredis.Redis.from_url(REDIS_URL, socket_connect_timeout=2, decode_responses=True)
        await redis_client.ping()
        print(f"Redis connected: {REDIS_URL}", flush=True)
    except Exception as e:
        print(f"Redis unavailable ({e}), running without activity tracking", flush=True)
        redis_client = None

# ── Rate limiter ──────────────────────────────────────────

class RateLimiter:
    def __init__(self):
        self._windows: dict[str, list[float]] = defaultdict(list)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - RATE_LIMIT_WINDOW_SEC
        timestamps = self._windows[key]
        self._windows[key] = [t for t in timestamps if t > cutoff]
        if len(self._windows[key]) >= RATE_LIMIT_MAX_REQUESTS:
            return False
        self._windows[key].append(now)
        return True

rate_limiter = RateLimiter()

# ── Tier concurrency tracker ──────────────────────────────

class TierTracker:
    def __init__(self):
        self._active: dict[str, int] = defaultdict(int)

    def try_acquire(self, tier: str) -> bool:
        limit = TIER_CONCURRENCY.get(tier, TIER_CONCURRENCY["medium"])
        if self._active[tier] >= limit:
            return False
        self._active[tier] += 1
        return True

    def release(self, tier: str):
        self._active[tier] = max(0, self._active[tier] - 1)

tier_tracker = TierTracker()

# ── Helpers ───────────────────────────────────────────────

def get_allowed_endpoints() -> set:
    endpoints = set(OLLAMA_ENDPOINTS)
    if INFERENCE_BACKEND == "vllm":
        endpoints |= VLLM_ENDPOINTS
    return endpoints

def parse_request_line(data: bytes) -> tuple[str, str, int]:
    header_end = data.find(b"\r\n\r\n")
    if header_end == -1:
        raise ValueError("Incomplete HTTP headers")
    first_line_end = data.find(b"\r\n")
    first_line = data[:first_line_end].decode("utf-8", errors="replace")
    parts = first_line.split(" ")
    if len(parts) < 2:
        raise ValueError(f"Malformed request line: {first_line}")
    method = parts[0].upper()
    path = parts[1].split("?")[0]
    return method, path, header_end + 4

def get_content_length(data: bytes) -> int:
    headers_str = data.split(b"\r\n\r\n")[0].decode("utf-8", errors="replace")
    for line in headers_str.split("\r\n")[1:]:
        if line.lower().startswith("content-length:"):
            try:
                return int(line.split(":", 1)[1].strip())
            except ValueError:
                return 0
    return 0

def parse_body_json(data: bytes, header_end: int) -> dict | None:
    """Try to parse the request body as JSON."""
    try:
        body = data[header_end:]
        if body:
            return json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        pass
    return None

async def get_agent_tier(cid: str) -> str:
    """Get inference tier for a CID from Redis."""
    if not redis_client:
        return "medium"
    try:
        tier = await redis_client.get(f"hive:agent:tier:{cid}")
        return tier if tier in TIER_CONCURRENCY else "medium"
    except Exception:
        return "medium"

async def get_agent_id_for_cid(cid: str) -> str | None:
    """Resolve CID to agentId via Redis."""
    if not redis_client:
        return None
    try:
        return await redis_client.get(f"hive:vm:cid:{cid}")
    except Exception:
        return None

async def track_activity(agent_id: str):
    """Record activity timestamp for idle detection."""
    if not redis_client or not agent_id:
        return
    try:
        await redis_client.set(f"hive:agent:activity:{agent_id}", str(int(time.time() * 1000)), ex=600)
    except Exception:
        pass

async def track_tokens(agent_id: str, tokens_in: int, tokens_out: int, model: str = ""):
    """Increment token counters in Redis."""
    if not redis_client or not agent_id:
        return
    try:
        key = f"hive:agent:tokens:{agent_id}"
        if tokens_in:
            await redis_client.hincrby(key, "input", tokens_in)
        if tokens_out:
            await redis_client.hincrby(key, "output", tokens_out)
        if model:
            await redis_client.hset(key, "last_model", model)
        await redis_client.expire(key, 86400)  # 24h TTL
    except Exception:
        pass

async def check_and_resume_paused(agent_id: str) -> bool:
    """If agent is paused, trigger auto-resume via internal API. Returns True if resumed."""
    if not redis_client or not agent_id or not HIVE_INTERNAL_TOKEN:
        return False
    try:
        is_paused = await redis_client.get(f"hive:agent:paused:{agent_id}")
        if not is_paused:
            return False

        print(f"[AUTO-RESUME] Agent {agent_id} is paused, triggering resume...", flush=True)

        # Run sync HTTP call in thread to avoid blocking the loop
        def _do_resume():
            url = f"{HIVE_API_URL}/api/agents/{agent_id}/resume"
            req = urllib.request.Request(url, method="POST", data=b"", headers={
                "Authorization": f"Bearer {HIVE_INTERNAL_TOKEN}",
                "Content-Type": "application/json",
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status

        status = await asyncio.to_thread(_do_resume)
        if status == 200:
            print(f"[AUTO-RESUME] Agent {agent_id} resumed successfully", flush=True)
            await asyncio.sleep(0.15)
            return True
        else:
            print(f"[AUTO-RESUME] Failed to resume agent {agent_id}: HTTP {status}", flush=True)
            return False
    except Exception as e:
        print(f"[AUTO-RESUME] Error resuming agent {agent_id}: {e}", flush=True)
        return False

def count_tokens_in_response(response_data: bytes) -> tuple[int, int]:
    """Parse Ollama NDJSON streaming response for token counts."""
    tokens_in = 0
    tokens_out = 0
    try:
        for line in response_data.split(b"\n"):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                tokens_in += obj.get("prompt_eval_count", 0)
                tokens_out += obj.get("eval_count", 0)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
    except Exception:
        pass
    return tokens_in, tokens_out

# ── Connection handler ────────────────────────────────────

async def handle_connection(client_sock: socket.socket, peer_cid: str):
    loop = asyncio.get_running_loop()
    client_sock.setblocking(False)

    tier = await get_agent_tier(peer_cid)
    agent_id = await get_agent_id_for_cid(peer_cid)
    tier_acquired = False

    try:
        # Read headers
        data = b""
        while b"\r\n\r\n" not in data and len(data) < 65536:
            chunk = await loop.sock_recv(client_sock, 4096)
            if not chunk:
                return
            data += chunk

        method, path, header_end = parse_request_line(data)

        # Check endpoint allowlist
        if (method, path) not in get_allowed_endpoints():
            response = (
                b"HTTP/1.1 403 Forbidden\r\n"
                b"Content-Type: application/json\r\n"
                b"Connection: close\r\n\r\n"
                + json.dumps({"error": f"Endpoint {method} {path} is not allowed"}).encode()
            )
            await loop.sock_sendall(client_sock, response)
            print(f"[BLOCKED] CID={peer_cid} {method} {path}", flush=True)
            return

        # Rate limiting
        if not rate_limiter.allow(peer_cid):
            response = (
                b"HTTP/1.1 429 Too Many Requests\r\n"
                b"Content-Type: application/json\r\n"
                b"Retry-After: 10\r\n"
                b"Connection: close\r\n\r\n"
                + json.dumps({"error": "Rate limit exceeded"}).encode()
            )
            await loop.sock_sendall(client_sock, response)
            return

        # Body size check
        content_length = get_content_length(data)
        if content_length > MAX_BODY_SIZE:
            response = (
                b"HTTP/1.1 413 Payload Too Large\r\n"
                b"Content-Type: application/json\r\n"
                b"Connection: close\r\n\r\n"
                + json.dumps({"error": f"Body too large ({content_length} > {MAX_BODY_SIZE})"}).encode()
            )
            await loop.sock_sendall(client_sock, response)
            return

        # Read remaining body
        body_received = len(data) - header_end
        while body_received < content_length:
            remaining = content_length - body_received
            chunk = await loop.sock_recv(client_sock, min(remaining, 65536))
            if not chunk:
                break
            data += chunk
            body_received += len(chunk)

        # Parse body for model info
        request_model = ""
        if method == "POST" and path in ("/api/generate", "/api/chat", "/v1/chat/completions", "/v1/completions"):
            body_json = parse_body_json(data, header_end)
            if body_json:
                request_model = body_json.get("model", "")

        # Auto-resume paused agent
        if agent_id:
            await check_and_resume_paused(agent_id)
            await track_activity(agent_id)

        # Tier concurrency check
        if not tier_tracker.try_acquire(tier):
            response = (
                b"HTTP/1.1 503 Service Unavailable\r\n"
                b"Content-Type: application/json\r\n"
                b"Retry-After: 5\r\n"
                b"Connection: close\r\n\r\n"
                + json.dumps({"error": f"Tier '{tier}' concurrency limit reached"}).encode()
            )
            await loop.sock_sendall(client_sock, response)
            return
        tier_acquired = True

        # Forward to inference backend via asyncio streams
        upstream_reader, upstream_writer = await asyncio.open_connection(
            INFERENCE_HOST, INFERENCE_PORT
        )
        try:
            upstream_writer.write(data)
            await upstream_writer.drain()

            # Stream response and capture for token counting
            response_buf = b""
            is_inference_req = path in ("/api/generate", "/api/chat")
            while True:
                chunk = await upstream_reader.read(65536)
                if not chunk:
                    break
                await loop.sock_sendall(client_sock, chunk)
                if is_inference_req and len(response_buf) < 1024 * 1024:
                    response_buf += chunk
        finally:
            upstream_writer.close()
            await upstream_writer.wait_closed()

        # Count tokens from response
        if is_inference_req and response_buf and agent_id:
            t_in, t_out = count_tokens_in_response(response_buf)
            if t_in or t_out:
                await track_tokens(agent_id, t_in, t_out, request_model)

    except (ConnectionResetError, BrokenPipeError, OSError):
        pass
    except Exception as e:
        print(f"[ERROR] CID={peer_cid}: {e}", flush=True)
        try:
            response = (
                b"HTTP/1.1 502 Bad Gateway\r\n"
                b"Content-Type: application/json\r\n"
                b"Connection: close\r\n\r\n"
                + json.dumps({"error": "Inference service unavailable"}).encode()
            )
            await loop.sock_sendall(client_sock, response)
        except OSError:
            pass
    finally:
        if tier_acquired:
            tier_tracker.release(tier)
        client_sock.close()

# ── Main ──────────────────────────────────────────────────

async def main():
    await init_redis()

    AF_VSOCK = 40
    VMADDR_CID_ANY = 0xFFFFFFFF

    server = socket.socket(AF_VSOCK, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((VMADDR_CID_ANY, VSOCK_PORT))
    server.listen(256)
    server.setblocking(False)

    print(f"hive-vsock-proxy listening on vsock port {VSOCK_PORT} (async)", flush=True)
    print(f"Forwarding to {INFERENCE_HOST}:{INFERENCE_PORT} (backend={INFERENCE_BACKEND})", flush=True)
    print(f"Rate limit: {RATE_LIMIT_MAX_REQUESTS} req/{RATE_LIMIT_WINDOW_SEC}s per VM", flush=True)
    print(f"Auto-resume: {'enabled' if HIVE_INTERNAL_TOKEN else 'disabled (no HIVE_INTERNAL_TOKEN)'}", flush=True)

    loop = asyncio.get_running_loop()

    shutdown_event = asyncio.Event()

    def handle_signal():
        print("Shutting down...", flush=True)
        shutdown_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, handle_signal)

    while not shutdown_event.is_set():
        try:
            client, addr = await loop.sock_accept(server)
            peer_cid = str(addr[0]) if len(addr) >= 1 else "unknown"
            asyncio.create_task(handle_connection(client, peer_cid))
        except OSError:
            if shutdown_event.is_set():
                break
            raise

    server.close()
    if redis_client:
        await redis_client.close()


if __name__ == "__main__":
    asyncio.run(main())
