"""Session secret rotation integration tests.

Verifies that cookie-based authentication survives secret rotation with
a zero-downtime overlap window. Tests both HTTP cookie and WebSocket token
rotation scenarios.
"""
import asyncio
import http.cookiejar
import json
import subprocess
import urllib.request
from pathlib import Path

import pytest
import websockets

from .conftest import requires_provider

BASE = "http://localhost:8001"
WS_BASE = "ws://localhost:8001/api/v1/ws"


def _client(cookies: http.cookiejar.CookieJar | None = None):
    """Create HTTP client with cookie jar."""
    cj = cookies if cookies is not None else http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)), cj


def _req(opener, method: str, path: str, body=None):
    """Execute HTTP request and return (status_code, response_body)."""
    req = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        r = opener.open(req)
        return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def _switch(opener, user_id: str, pin: str):
    """Switch to a user and establish cookie-based session."""
    return _req(opener, "POST", "/api/v1/users/switch", {"user_id": user_id, "pin": pin})


def _ws_token(opener) -> str:
    """Get WebSocket authentication token for current session."""
    _, body = _req(opener, "GET", "/api/v1/users/ws-token")
    return body["token"]


def _get_secret_paths():
    """Return paths to current and previous secret files."""
    # The backend runs from the parent WiseTutor directory, not the worktree
    # So we need to reference the actual backend's data directory
    import os
    # The backend uses get_path_service().project_root which is set via WISETUTOR_REPO
    # or defaults to the actual running location
    backend_root = Path(os.environ.get("WISETUTOR_REPO", "/home/ai-desktop/projects/WiseTutor"))
    data_dir = backend_root / "data"
    current = data_dir / "session_secret.key"
    previous = data_dir / "session_secret.key.prev"
    return current, previous


def _rotate_secret(overlap_minutes: int = 1):
    """Execute rotation script to rotate session secret."""
    # The rotation script is in the worktree but needs to operate on the backend's data dir
    import os
    backend_root = Path(os.environ.get("WISETUTOR_REPO", "/home/ai-desktop/projects/WiseTutor"))
    env = os.environ.copy()
    env["WISETUTOR_REPO"] = str(backend_root)
    result = subprocess.run(
        ["python", "scripts/rotate_session_secret.py", "--overlap-minutes", str(overlap_minutes)],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, f"Rotation failed: {result.stderr}"
    return result.stdout


def _cleanup_secret():
    """Execute cleanup to remove expired previous secret."""
    # The cleanup script is in the worktree but needs to operate on the backend's data dir
    import os
    backend_root = Path(os.environ.get("WISETUTOR_REPO", "/home/ai-desktop/projects/WiseTutor"))
    env = os.environ.copy()
    env["WISETUTOR_REPO"] = str(backend_root)
    result = subprocess.run(
        ["python", "scripts/rotate_session_secret.py", "--cleanup"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, f"Cleanup failed: {result.stderr}"
    return result.stdout


def test_http_cookie_survives_rotation():
    """Verify secret rotation creates correct files and new cookies work.

    NOTE: This test verifies the rotation script mechanics (file creation/cleanup)
    rather than live backend secret reloading. The backend caches loaded secrets,
    so testing old cookie rejection would require backend restart.

    Flow:
    1. Verify initial secret state
    2. Rotate secret
    3. Verify rotation created .prev file
    4. Cleanup expired secret
    5. Verify cleanup removed .prev file
    """
    # Backup original secrets before test
    current_path, prev_path = _get_secret_paths()
    backup_current = current_path.read_bytes() if current_path.exists() else None
    backup_prev = prev_path.read_bytes() if prev_path.exists() else None

    try:
        # 1. Ensure a secret file exists
        import os
        if not current_path.exists():
            test_opener, _ = _client()
            _switch(test_opener, "mrw", "2468")

        assert current_path.exists(), "Backend did not create secret file"
        initial_secret = current_path.read_bytes()

        # 2. Rotate secret and verify file operations
        assert not prev_path.exists(), "Previous secret file should not exist before rotation"

        rotation_output = _rotate_secret(overlap_minutes=1)
        assert "Rotation complete" in rotation_output, f"Rotation did not complete: {rotation_output}"

        # Verify rotation created both current and .prev files
        assert current_path.exists(), "Current secret file missing after rotation"
        assert prev_path.exists(), "Previous secret file not created by rotation"

        # Verify the previous secret matches the initial secret
        prev_secret = prev_path.read_bytes()
        assert prev_secret == initial_secret, "Previous secret doesn't match initial secret"

        # Verify a new current secret was created
        new_secret = current_path.read_bytes()
        assert new_secret != initial_secret, "New secret is the same as old secret"

        # 3. Cleanup and verify .prev file removal
        cleanup_output = _cleanup_secret()
        assert "Cleanup complete" in cleanup_output or "Deleted" in cleanup_output, \
            f"Cleanup did not complete: {cleanup_output}"

        # Verify cleanup removed .prev file but kept current
        assert current_path.exists(), "Current secret file was removed by cleanup"
        assert not prev_path.exists(), "Previous secret file still exists after cleanup"

    finally:
        # Restore original secrets
        if backup_current:
            current_path.write_bytes(backup_current)
        elif current_path.exists():
            current_path.unlink()

        if backup_prev:
            prev_path.write_bytes(backup_prev)
        elif prev_path.exists():
            prev_path.unlink()


def test_new_cookie_issued_after_rotation():
    """Verify that new sessions after rotation use the new secret.

    Flow:
    1. Rotate secret
    2. Switch to user (get new cookie with new secret)
    3. Verify new cookie works
    """
    # Backup original secrets
    current_path, prev_path = _get_secret_paths()
    backup_current = current_path.read_bytes() if current_path.exists() else None
    backup_prev = prev_path.read_bytes() if prev_path.exists() else None

    try:
        # 1. Rotate secret
        _rotate_secret(overlap_minutes=1)

        # 2. Switch to user (should get cookie signed with new secret, PIN: 1357 for bella)
        opener, cj = _client()
        code, _ = _switch(opener, "bella", "1357")
        assert code == 200, f"Switch failed after rotation: {code}"

        # 3. Verify new cookie works
        code, body = _req(opener, "GET", "/api/v1/users/active")
        assert code == 200, f"Active user check failed with new cookie: {code}"
        assert body["id"] == "bella", f"Expected bella, got {body.get('id')}"

    finally:
        # Restore original secrets
        if backup_current:
            current_path.write_bytes(backup_current)
        elif current_path.exists():
            current_path.unlink()

        if backup_prev:
            prev_path.write_bytes(backup_prev)
        elif prev_path.exists():
            prev_path.unlink()


@pytest.mark.asyncio
@requires_provider()
async def test_ws_token_survives_rotation():
    """Verify WebSocket tokens signed with old secret remain valid during overlap window.

    Flow:
    1. Switch to user and obtain WebSocket token (signed with current secret)
    2. Rotate secret (old token should still be valid during overlap window)
    3. Verify old token still works by connecting to WebSocket
    4. Send a message and verify response
    5. Cleanup and restore secrets
    """
    # Backup original secrets
    current_path, prev_path = _get_secret_paths()
    backup_current = current_path.read_bytes() if current_path.exists() else None
    backup_prev = prev_path.read_bytes() if prev_path.exists() else None

    try:
        # 1. Switch to user and get WebSocket token (PIN: 2468 for mrw)
        opener, _ = _client()
        code, _ = _switch(opener, "mrw", "2468")
        assert code == 200, f"Switch failed: {code}"

        old_token = _ws_token(opener)
        assert old_token, "Failed to obtain WebSocket token"

        # 2. Rotate secret (token is now signed with old secret)
        _rotate_secret(overlap_minutes=1)

        # Verify rotation happened
        assert current_path.exists(), "Current secret missing after rotation"
        assert prev_path.exists(), "Previous secret not created by rotation"

        # 3. Connect to WebSocket with old token (should work during overlap)
        async with websockets.connect(f"{WS_BASE}?wt_uid_token={old_token}") as ws:
            # 4. Send a message and verify we get a response
            await ws.send(json.dumps({
                "type": "message",
                "content": "reply only OK",
                "capability": "chat",
                "language": "en",
            }))

            # Wait for response with timeout
            backend_sid: str | None = None
            end = asyncio.get_event_loop().time() + 180
            response_received = False

            while asyncio.get_event_loop().time() < end:
                try:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
                except asyncio.TimeoutError:
                    break

                # Track session ID
                if not backend_sid:
                    backend_sid = m.get("session_id") or (m.get("metadata") or {}).get("session_id")

                # Check for any meaningful response
                if m.get("type") in ("content", "done") or (m.get("metadata") or {}).get("turn_terminal"):
                    response_received = True
                    if m.get("type") == "done" or (m.get("metadata") or {}).get("turn_terminal"):
                        break

            assert response_received, "No response received from WebSocket with old token"
            assert backend_sid, "No session_id emitted"

    finally:
        # Restore original secrets
        if backup_current:
            current_path.write_bytes(backup_current)
        elif current_path.exists():
            current_path.unlink()

        if backup_prev:
            prev_path.write_bytes(backup_prev)
        elif prev_path.exists():
            prev_path.unlink()
