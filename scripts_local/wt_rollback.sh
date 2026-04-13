#!/usr/bin/env bash
set -euo pipefail

REPO=/home/ai-desktop/projects/WiseTutor
DRY_RUN=false
REQUIRED_BRANCH="bootstrap/wisetutor-baseline"

usage() {
  echo "Usage: $0 [--dry-run] <git-sha-or-ref>"
  exit 1
}

POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -*) echo "Unknown flag: $arg"; usage ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done

if [[ ${#POSITIONAL[@]} -ne 1 ]]; then
  usage
fi

TARGET_REF="${POSITIONAL[0]}"

# Precondition 1: working tree must be clean
DIRTY=$(git -C "$REPO" status --porcelain)
if [[ -n "$DIRTY" ]]; then
  echo "ERROR: working tree is not clean. Commit or stash changes before rollback."
  echo "$DIRTY"
  exit 1
fi

# Precondition 2: branch must be bootstrap/wisetutor-baseline
CURRENT_BRANCH=$(git -C "$REPO" rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "$REQUIRED_BRANCH" ]]; then
  echo "ERROR: current branch is '$CURRENT_BRANCH', expected '$REQUIRED_BRANCH'."
  echo "This script only operates on $REQUIRED_BRANCH."
  exit 1
fi

# Precondition 3: target ref must exist
if ! git -C "$REPO" rev-parse --verify "$TARGET_REF^{commit}" &>/dev/null; then
  echo "ERROR: target ref '$TARGET_REF' does not exist or is not a commit."
  exit 1
fi

TARGET_SHA=$(git -C "$REPO" rev-parse "$TARGET_REF^{commit}")
CURRENT_SHA=$(git -C "$REPO" rev-parse HEAD)

# Precondition 4: target must be an ancestor of current HEAD (or equal)
if ! git -C "$REPO" merge-base --is-ancestor "$TARGET_SHA" "$CURRENT_SHA"; then
  echo "ERROR: '$TARGET_REF' ($TARGET_SHA) is not an ancestor of current HEAD ($CURRENT_SHA)."
  echo "This script only supports rolling back to a prior commit on the current history."
  exit 1
fi

echo "Rollback plan:"
echo "  Current HEAD : $CURRENT_SHA"
echo "  Target ref   : $TARGET_REF"
echo "  Target SHA   : $TARGET_SHA"
echo "  Action       : git checkout $TARGET_SHA (detached HEAD)"
echo "  NOTE: This will result in a detached HEAD state, which is acceptable for personal use."

if $DRY_RUN; then
  echo ""
  echo "DRY-RUN mode: no changes made."
  exit 0
fi

git -C "$REPO" checkout "$TARGET_SHA"

echo ""
echo "Rolled back to $TARGET_SHA (detached HEAD)."
echo "NOTE: HEAD is now detached. To return to the branch tip: git checkout $REQUIRED_BRANCH"
echo ""
echo "NEXT STEP: restart WiseTutor, then run: scripts_local/wt_health.sh"
echo "(Do NOT run wt_health.sh automatically — restart the service first.)"
