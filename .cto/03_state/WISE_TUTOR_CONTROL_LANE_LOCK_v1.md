# WISE_TUTOR_CONTROL_LANE_LOCK_v1

## Status
Closed and verified.

## Canonical repo
`/home/ai-desktop/projects/WiseTutor`

## What is verified
1. Neutral machine-level doctrine baseline passes.
2. `/etc/claude-code/CLAUDE.md` is installed.
3. `/etc/claude-code/managed-settings.json` is installed.
4. `allowManagedPermissionRulesOnly: true` is active.
5. `~/.claude/CLAUDE.md` exists and imports resolve.
6. WiseTutor preflight passes.
7. Active WiseTutor project instruction surface is:
   `/home/ai-desktop/projects/WiseTutor/CLAUDE.md`
8. WiseTutor `.cto/03_state/` scaffold exists.
9. In-session `/memory` shows:
   - managed policy
   - user/global doctrine
   - project-local `/CLAUDE.md`
10. In-session `/status` shows Enterprise managed settings active.

## Verified scope
This lock proves the control stack is working end-to-end in the WiseTutor repo:
machine layer + managed settings + user/global doctrine + project-local doctrine + project state scaffold.

## Not verified by this lock
- Cleanup of `/home/ai-desktop` root-level noise
- Retirement of older home-root `CLAUDE.md`
- Any repo other than WiseTutor
- Any broader multi-project consolidation

## Rule
Future work should use WiseTutor as the first clean proof repo and should not reopen root/home cleanup until a separate bounded lane is opened for it.

## Reopen condition
Only reopen this lock if new evidence shows:
- preflight failure in WiseTutor
- `/memory` no longer loads the project-local surface
- managed settings no longer appear active
- the state scaffold becomes invalid
