"""Unit tests for session secret rotation.

Verifies that the multi-secret support allows graceful rotation:
- Cookies signed with the current secret are accepted
- Cookies signed with a previous secret are still accepted during overlap
- Cookies signed with unknown secrets are rejected
"""

import os
import pytest
from unittest import mock

from deeptutor.services.users.identity import (
    sign_user_id,
    verify_cookie,
    _load_secrets,
)


def test_single_secret_sign_and_verify():
    """Basic test: sign with one secret, verify it works."""
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret1"}):
        signed = sign_user_id("test_user")
        assert verify_cookie(signed) == "test_user"


def test_multi_secret_current_secret_works():
    """With multiple secrets, cookies signed with current secret verify."""
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "current:previous"}):
        signed = sign_user_id("alice")
        assert verify_cookie(signed) == "alice"


def test_multi_secret_previous_secret_works():
    """Cookies signed with a previous secret still verify (rotation overlap)."""
    # First, sign with secret1 as current
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret1"}):
        signed_with_old = sign_user_id("bob")

    # Verify it works with secret1 as current
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret1"}):
        assert verify_cookie(signed_with_old) == "bob"

    # Now rotate: secret2 is current, secret1 is previous
    # The old cookie (signed with secret1) should still work
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret2:secret1"}):
        assert verify_cookie(signed_with_old) == "bob"


def test_unknown_secret_rejected():
    """Cookies signed with a secret not in the active list are rejected."""
    # Sign with secretA
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secretA"}):
        signed_with_a = sign_user_id("charlie")

    # Verify fails with a completely different secret
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secretB"}):
        assert verify_cookie(signed_with_a) is None


def test_rotation_scenario():
    """Full rotation scenario: sign with A, rotate to B (keeping A), both work."""
    # Initial state: secret_a is current
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret_a"}):
        cookie_signed_with_a = sign_user_id("user1")
        assert verify_cookie(cookie_signed_with_a) == "user1"

    # Rotation: secret_b is now current, secret_a is previous (overlap window)
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret_b:secret_a"}):
        # Old cookie (signed with secret_a) still works
        assert verify_cookie(cookie_signed_with_a) == "user1"

        # New cookies are signed with secret_b
        cookie_signed_with_b = sign_user_id("user2")
        assert verify_cookie(cookie_signed_with_b) == "user2"

        # Both old and new cookies work during overlap
        assert verify_cookie(cookie_signed_with_a) == "user1"
        assert verify_cookie(cookie_signed_with_b) == "user2"

    # Post-overlap: secret_a expired, only secret_b remains
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret_b"}):
        # New cookie (signed with secret_b) still works
        assert verify_cookie(cookie_signed_with_b) == "user2"

        # Old cookie (signed with secret_a) is now rejected
        assert verify_cookie(cookie_signed_with_a) is None


def test_invalid_cookie_format():
    """Malformed cookies are rejected."""
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret1"}):
        assert verify_cookie(None) is None
        assert verify_cookie("") is None
        assert verify_cookie("no_dot") is None
        assert verify_cookie("user..") is None
        assert verify_cookie(".sig") is None


def test_tampered_signature_rejected():
    """Cookies with tampered signatures are rejected."""
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret1"}):
        signed = sign_user_id("david")
        # Tamper with the signature
        user_id, _, sig = signed.rpartition(".")
        tampered = f"{user_id}.{sig[:-1]}X"
        assert verify_cookie(tampered) is None


def test_tampered_user_id_rejected():
    """Cookies with tampered user_id (but valid signature format) are rejected."""
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret1"}):
        signed = sign_user_id("eve")
        # Change the user_id but keep the signature
        _, _, sig = signed.rpartition(".")
        tampered = f"attacker.{sig}"
        assert verify_cookie(tampered) is None


def test_load_secrets_from_env():
    """_load_secrets correctly parses colon-separated env var."""
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "s1:s2:s3"}):
        secrets = _load_secrets()
        assert len(secrets) == 3
        assert secrets[0] == b"s1"
        assert secrets[1] == b"s2"
        assert secrets[2] == b"s3"


def test_load_secrets_ignores_empty_parts():
    """_load_secrets ignores empty parts in colon-separated list."""
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "s1::s2:"}):
        secrets = _load_secrets()
        assert len(secrets) == 2
        assert secrets[0] == b"s1"
        assert secrets[1] == b"s2"


@pytest.mark.parametrize(
    "user_id",
    ["alice", "bob", "child", "admin", "user_with_underscores", "123"],
)
def test_various_user_ids_work(user_id):
    """Various user_id formats can be signed and verified."""
    with mock.patch.dict(os.environ, {"WISETUTOR_SESSION_SECRET": "secret1"}):
        signed = sign_user_id(user_id)
        assert verify_cookie(signed) == user_id
