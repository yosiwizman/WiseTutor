# Ubuntu Desktop cleanup — 2026-04-13

## Scope
Project-related clutter only (WiseTutor / DeepTutor / AKIOR / Claude-project items on `~/Desktop/`). Unrelated personal files and the unrelated `Paperclip.desktop` launcher were left untouched.

## Archive location
`/home/ai-desktop/Documents/WiseTutor_Desktop_Archive/20260413T231047Z/`

Nothing was deleted. Every moved item is intact in the archive and can be restored at any time.

## What stayed on Desktop (project-related, intentional)
- `wisetutor.desktop` — Name: "WiseTutor" — Exec: `/home/ai-desktop/projects/WiseTutor/scripts_local/wt_launch.sh`
- `wisetutor-stop.desktop` — Name: "WiseTutor — Stop" — Exec: `/home/ai-desktop/projects/WiseTutor/scripts_local/wt_stop.sh`

## What stayed on Desktop (unrelated, intentional no-touch)
- `Paperclip.desktop` — not a WiseTutor/DeepTutor/AKIOR/Claude item; left alone.

## What moved to the archive
Legacy launchers:
- `DeepTutor.desktop`
- `DeepTutor Stop.desktop`

Project debris (docs, snapshots, folders, notes, temp files):
- `3D-PRINT-MANUAL-TEST-FINAL_REPORT.md`
- `3D-PRINT-MANUAL-TEST-REPORT.html`
- `AKIOR CTO BUILDING RULES ` (folder, trailing space in original name preserved)
- `AKIOR GROUND TRUTH AUDIT.txt`
- `akior-ssot-snapshot` (folder)
- `Claude_dual_operational_system_shadow_pack_2026-04-07` (folder)
- `HARDWARE Component Spec.txt`
- `mimeinfo.cache`

## App grid (`~/.local/share/applications/`)
Zero DeepTutor entries remain there either. Only `wisetutor.desktop` and `wisetutor-stop.desktop` live in the app grid.

## Launcher integrity after cleanup
- `wisetutor.desktop` Exec= target (`scripts_local/wt_launch.sh`) exists + is executable ✅
- `wisetutor-stop.desktop` Exec= target (`scripts_local/wt_stop.sh`) exists + is executable ✅
- Tier 1 evidence that `wt_launch.sh` end-to-end path works was captured in prior commit `ea4db40` (Playwright `ubuntu-launcher` spec + `artifacts/ubuntu_launcher/launcher-proof.png`).

## Reversibility
To restore anything, `mv` it back from the archive path above into `~/Desktop/`. The original filenames (including odd spacing / trailing space in `AKIOR CTO BUILDING RULES `) are preserved.
