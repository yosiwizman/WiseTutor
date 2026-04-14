# WiseTutor Operator Runbook

WiseTutor runs locally on the ai-desktop computer for private family use only.
Once started, open Chrome and go to **http://localhost:3782**.

---

## 1. Start the app

Open a terminal and run:

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_start.sh
```

Wait until you see **OK** in the output (takes about 15–30 seconds).
Then open Chrome to http://localhost:3782.

---

## 2. Stop the app

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_stop.sh
```

---

## 3. Is it working?

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_health.sh
```

Every line should say **PASS**. If any line says **FAIL**, a short hint follows
it explaining what is wrong. Common fixes: make sure the app is started
(step 1), and make sure Ollama is running on the machine.

---

## 4. Where is the data?

- User accounts and sessions: `data/users/` and `data/user/` folders inside
  the WiseTutor project.
- User list file: `data/users.json`.
- Voice models: `/mnt/models/piper/` (on the large models drive).
- API keys and secrets: `.env` file in the WiseTutor project folder.

Do not move or delete these without backing up first (see section 6).

---

## 5. Check what is running

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_status.sh
```

Shows which processes are running and which ports are in use.

---

## 6. Back it up

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_backup.sh
```

Creates a timestamped file in the `backups/` folder inside the project.
The backup includes all user data and settings. Old backups older than
14 days are removed automatically.

---

## 7. Restore from a backup

First, list available backups:

```
ls /home/ai-desktop/projects/WiseTutor/backups/
```

Then restore by passing the filename:

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_restore.sh backups/wt-backup-YYYYMMDD-HHMMSS.tar.gz
```

Your current live data is moved aside (not deleted) before the backup is
extracted, so nothing is permanently lost in this step.

---

## 8. Roll back an update that broke things

Only do this if the health check (section 3) fails after a software update.

You need the git commit ID of the last working version (Yosi can look this
up). Then run:

```
bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_rollback.sh <git-sha>
```

After rollback, start the app again (section 1) and run the health check
(section 3) to confirm it is working.

---

## 9. If all else fails

1. Stop the app (section 2).
2. Back it up (section 6).
3. Restore the last known-good backup (section 7).
4. Start the app again (section 1).
5. Run the health check (section 3).

---

Need help? Text Yosi.

---

## 10. No-terminal host launch (on ai-desktop)

**One-time setup:** run `bash host/install_host_launcher.sh` in a terminal
(only needed once after a fresh clone or machine rebuild). This places a
"WiseTutor" icon on the Desktop and in the app grid, and registers a user
systemd unit so the app starts automatically when you log in.

**Daily use:** double-click the "WiseTutor" icon on the Desktop. It calls
`scripts_local/wt_launch.sh` under the hood, which starts the app and opens
Chrome in app mode pointing at http://100.109.173.59:3782. **Closing the
browser window closes your view only — the WiseTutor host keeps running
in the background so you can reopen it instantly.** No Stop icon is placed
on the Desktop; stopping the host is a maintenance action (see below),
not a daily-use click.

**How to intentionally stop WiseTutor (maintenance only):**
- `bash /home/ai-desktop/projects/WiseTutor/scripts_local/wt_stop.sh`
- or `systemctl --user stop wisetutor.service`

Daily family use never needs this. You only stop WiseTutor if you are
updating the app, restoring a backup, rolling back a commit, or
troubleshooting.

**Auto-start on login:** ENABLED (user systemd unit `wisetutor.service`).
The app starts automatically each time you log in to ai-desktop.

**Auto-start on boot without login:** NOT enabled — enabling that requires
`sudo loginctl enable-linger`, which is a separate step and was not part
of this setup. A logged-in session on ai-desktop is acceptable for family use.

**Terminal still required for:** backups (`wt_backup.sh`), restore, rollback.
Day-to-day launching no longer requires a terminal.

**Stable private URL (Tailscale MagicDNS — live since 2026-04-14):**
the family URL `http://100.109.173.59:3782` resolves
privately over Tailscale to `100.109.173.59`. Any family device
enrolled in the tailnet (iPhone, Android, Mac, Windows) reaches
WiseTutor from anywhere — not limited to home Wi-Fi. No public
internet exposure. Router DHCP reservation is no longer required.

---

## 11. Family members (Windows / Mac client launchers)

Family members on Windows or Mac do not run any backend. They install a small
launcher that opens the hosted app in their browser like a native app icon.

**Windows — `dist/wisetutor-windows-launcher.zip`:**
1. Send the zip file to the family member.
2. They unzip it, right-click `install-wisetutor.ps1` → "Run with PowerShell".
3. A WiseTutor icon appears on their Desktop and in the Start Menu.
4. Double-click to launch. Chrome opens in app mode to `http://100.109.173.59:3782`.

**Mac — `dist/wisetutor-macos-launcher.zip`:**
1. Send the zip file to the family member.
2. They unzip it and drag `WiseTutor.app` into Applications.
3. First launch: right-click `WiseTutor.app` → Open → Open (macOS Gatekeeper
   prompt). After that, launch from Launchpad normally.
4. Fallback: if `WiseTutor.app` won't open, double-click `WiseTutor.command`
   instead — it does the same thing.

**What the launcher does:** opens `http://100.109.173.59:3782` in Chrome app
mode. No local backend. No local frontend. No install beyond the small wrapper.

**Requirements:** the family member must be on the home Wi-Fi, and ai-desktop
must be switched on and logged in.

**If the LAN IP ever changes:** rebuild the two zips on ai-desktop:
```
bash clients/windows/build-zip.sh
bash clients/macos/build-zip.sh
```
Then send the new `dist/wisetutor-windows-launcher.zip` and
`dist/wisetutor-macos-launcher.zip` to the family member. They reinstall.

**Note:** these launchers were built and packaged on Linux. They have not been
installed on a real Windows or real macOS machine yet (Tier 3 — designed, not
confirmed). Confirm each OS path with a real install before declaring them
production-ready.

---

## 12. Remote access (phones / off-Wi-Fi)

Remote access requires a one-time Tailscale setup. See
`docs/TAILSCALE_SETUP.md` for the 5 steps. Until that is done:
- Family devices on home Wi-Fi: use the launcher zips or
  `http://100.109.173.59:3782` in any browser.
- Phones off home Wi-Fi: NOT reachable yet. Blocked on Tailscale.

---

## GitHub download + hosted validation

- **Release page for launcher downloads:**
  https://github.com/yosiwizman/WiseTutor/releases/tag/launchers-v1.1-2026-04-14
  — one Windows zip + one macOS zip attached.
- **GitHub Actions launcher validation:**
  https://github.com/yosiwizman/WiseTutor/actions/workflows/launcher-validate.yml
  — runs three jobs on push to any branch:
    1. Ubuntu: build both zips from source
    2. Windows-latest: unzip + assert the 4 files + URL + PowerShell syntax check
    3. macOS-latest: unzip + assert the .app bundle structure + URL + exec bit + plist lint
  Passes prove the zips are structurally valid on each OS. They do
  NOT prove a real family-member click-through install succeeds on
  their actual Windows/Mac laptop. That last-mile check is still one
  real click per OS.
