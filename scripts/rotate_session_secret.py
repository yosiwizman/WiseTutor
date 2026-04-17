#!/usr/bin/env python
"""Rotate the HMAC secret used to sign wt_uid cookies and ws-tokens.

This script rotates the session secret with a configurable overlap window
to ensure zero-downtime rotation. During the overlap period, both the old
and new secrets are valid for signature verification.

Usage:
    python scripts/rotate_session_secret.py                 # rotate with 5-min overlap
    python scripts/rotate_session_secret.py --overlap-minutes 10
    python scripts/rotate_session_secret.py --dry-run        # preview changes
    python scripts/rotate_session_secret.py --cleanup        # remove expired secrets
    python scripts/rotate_session_secret.py --env-format     # show env var format
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Respect WISETUTOR_REPO env var to support running from worktrees/CI
project_root = Path(os.environ.get("WISETUTOR_REPO") or Path(__file__).parent.parent)
sys.path.insert(0, str(project_root))

from scripts._cli_kit import banner, error, success, warn, dim, bold, accent


def print_step(message: str, status: str = "") -> None:
    """Print a step with optional status indicator."""
    if status:
        print(f"  {message} - {status}")
    else:
        print(f"  ... {message}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rotate session secret with zero-downtime overlap window",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          # rotate with default 5-minute overlap
  %(prog)s --overlap-minutes 10     # rotate with 10-minute overlap
  %(prog)s --dry-run                # preview rotation without changes
  %(prog)s --cleanup                # remove expired previous secret
  %(prog)s --env-format             # show WISETUTOR_SESSION_SECRET format
        """,
    )
    parser.add_argument(
        "--overlap-minutes",
        type=int,
        default=5,
        metavar="N",
        help="overlap window in minutes (default: 5, max: 60)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="show what would be done without making changes",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="remove expired previous secret",
    )
    parser.add_argument(
        "--env-format",
        action="store_true",
        help="output secrets in WISETUTOR_SESSION_SECRET env var format",
    )
    return parser.parse_args()


def get_secret_paths() -> tuple[Path, Path]:
    """Return paths to current and previous secret files."""
    data_dir = project_root / "data"
    current = data_dir / "session_secret.key"
    previous = data_dir / "session_secret.key.prev"
    return current, previous


def generate_secret() -> bytes:
    """Generate a new 32-byte hex-encoded secret."""
    return os.urandom(32).hex().encode("utf-8")


def read_secret(path: Path) -> bytes | None:
    """Read secret from file, return None if file doesn't exist."""
    if not path.exists():
        return None
    return path.read_bytes().strip()


def write_secret(path: Path, secret: bytes, dry_run: bool = False) -> None:
    """Write secret to file with 0600 permissions."""
    if dry_run:
        print_step(f"Would write {len(secret)} bytes to {path.name}")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(secret)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    print_step(f"Wrote {len(secret)} bytes to {path.name}")


def rotate_secrets(overlap_minutes: int, dry_run: bool) -> tuple[bytes, bytes | None]:
    """Perform secret rotation.

    Returns:
        (new_secret, old_secret) tuple
    """
    current_path, prev_path = get_secret_paths()

    # Read current secret (will become previous)
    current_secret = read_secret(current_path)
    if not current_secret:
        print_step("No current secret found", warn("will generate initial secret"))
    else:
        print_step(f"Current secret: {current_secret[:16].decode()+'...'}", success("loaded"))

    # Generate new secret
    new_secret = generate_secret()
    print_step(f"New secret: {new_secret[:16].decode()+'...'}", success("generated"))

    # Move current to previous
    if current_secret:
        if dry_run:
            print_step(f"Would move {current_path.name} -> {prev_path.name}")
        else:
            if prev_path.exists():
                prev_path.unlink()
            shutil.copy2(current_path, prev_path)
            print_step(f"Moved {current_path.name} -> {prev_path.name}", success("OK"))

    # Write new secret as current
    write_secret(current_path, new_secret, dry_run)

    return new_secret, current_secret


def cleanup_expired(dry_run: bool) -> None:
    """Remove expired previous secret."""
    _, prev_path = get_secret_paths()

    if not prev_path.exists():
        print_step("No previous secret to clean up", dim("skipped"))
        return

    if dry_run:
        print_step(f"Would delete {prev_path.name}")
    else:
        prev_path.unlink()
        print_step(f"Deleted {prev_path.name}", success("OK"))


def show_env_format(new_secret: bytes, old_secret: bytes | None) -> None:
    """Display secrets in WISETUTOR_SESSION_SECRET env var format."""
    print()
    banner("Environment Variable Format", [
        "To use env var instead of files, set:",
        "",
        "export WISETUTOR_SESSION_SECRET=\"<current>:<previous>\"",
        "",
        "During overlap window:",
    ])

    if old_secret:
        env_value = f"{new_secret.decode()}:{old_secret.decode()}"
    else:
        env_value = new_secret.decode()

    print(f"  {accent('export')} WISETUTOR_SESSION_SECRET=\"{env_value[:32]}...\"")
    print()
    print(dim("  After overlap expires (remove previous secret):"))
    print(f"  {accent('export')} WISETUTOR_SESSION_SECRET=\"{new_secret.decode()}\"")
    print()


def main() -> None:
    args = parse_args()

    # Validate overlap window
    if args.overlap_minutes < 1 or args.overlap_minutes > 60:
        print(error("Error: overlap-minutes must be between 1 and 60"))
        sys.exit(1)

    # Handle cleanup mode
    if args.cleanup:
        banner("Session Secret Cleanup", [
            "Removing expired previous secret",
        ])
        cleanup_expired(args.dry_run)
        if not args.dry_run:
            print()
            print(success("✓ Cleanup complete"))
        print()
        return

    # Rotation mode
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=args.overlap_minutes)

    banner_lines = [
        "Rotating session secret with zero-downtime overlap window",
        "",
        f"Overlap window: {args.overlap_minutes} minutes",
        f"Previous secret expires at: {expires_at.strftime('%Y-%m-%d %H:%M:%S %Z')}",
    ]

    if args.dry_run:
        banner_lines.append("")
        banner_lines.append(warn("DRY RUN - no changes will be made"))

    banner("Session Secret Rotation", banner_lines)

    # Perform rotation
    new_secret, old_secret = rotate_secrets(args.overlap_minutes, args.dry_run)

    # Show results
    print()
    if args.dry_run:
        print(warn("DRY RUN - no files were modified"))
    else:
        print(success("✓ Rotation complete"))

    print()
    print(dim("During the overlap window:"))
    print(f"  • Both old and new secrets are valid for signature verification")
    print(f"  • New signatures are created with the new secret")
    print(f"  • Active sessions continue without interruption")
    print()
    print(dim(f"After {args.overlap_minutes} minutes:"))
    print(f"  • Old signatures will be rejected")
    print(f"  • Run: {bold('python scripts/rotate_session_secret.py --cleanup')}")
    print()

    # Show env format if requested
    if args.env_format:
        show_env_format(new_secret, old_secret)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        print(error("Aborted"))
        sys.exit(130)
