# WiseTutor — final deployment proof loop

Three irreducible human actions close the remaining Tier-3 gaps. Everything
else on Claude's side is ready. Do each step, paste back the short required
evidence, and Claude will immediately finish the lane.

You can do the steps in any order. Tailscale is the biggest unlock.

---

## Step 1 — Tailscale install + login on ai-desktop

**Do this in a terminal on ai-desktop:**

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

The second command prints a URL. Open it in any browser, sign in with
Google / Apple / email. When asked, name the device `ai-desktop`.

**Then run:**

```bash
tailscale status
tailscale ip -4
```

**Paste back exactly this block, filling in the two lines:**

```
tailscale ip -4: <the 100.x.y.z IP>
tailscale status hostname: <the name listed for ai-desktop, usually "ai-desktop">
```

*(Optional — strongly recommended)* Install the Tailscale app on family
phones / Windows laptops / Macs from https://tailscale.com/download and
sign in with the same account. Each device shows up in your tailnet and
can reach the `ai-desktop` hostname.

**What Claude will do automatically when you paste the block back:**

1. Verify the IP and hostname shapes.
2. Swap the URL in 5 launcher files from `http://192.168.1.133:3782` to
   `http://ai-desktop:3782` (or the MagicDNS name you supply).
3. Rebuild `dist/wisetutor-windows-launcher.zip` and
   `dist/wisetutor-macos-launcher.zip`.
4. Publish a new GitHub Release `launchers-v1.1-<date>` with the new zips.
5. Re-run the `launcher-validate` workflow against the rebuilt zips.
6. Update `docs/FAMILY_INSTALL.md` and `OPERATOR_RUNBOOK.md` with the
   new download URL and drop the "router DHCP reservation" requirement.
7. Mark `Tailscale MagicDNS URL` Tier 4 → Tier 1 in SSOT.

---

## Step 2 — one real Windows click-through

**On a real Windows computer:**

1. Go to
   https://github.com/yosiwizman/WiseTutor/releases/tag/launchers-v1.0-2026-04-13
   and download `wisetutor-windows-launcher.zip`.
2. Right-click the zip → "Extract All".
3. In the extracted folder, right-click `install-wisetutor.ps1` → "Run
   with PowerShell". If Windows blocks it: right-click → Properties →
   Unblock → OK, then run again.
4. You should now see a "WiseTutor" icon on the Desktop and in the Start
   Menu. Double-click it. A Chrome-style window should open to WiseTutor
   (requires ai-desktop to be on and the Windows laptop to be reachable
   to it — either same Wi-Fi today, or via Tailscale once Step 1 is done).

**Paste back exactly one of these lines:**

```
windows install: yes — icon appears, click opens WiseTutor
windows install: fail — <one sentence on what happened>
```

A screenshot of the running WiseTutor window is welcome but not required.

**What Claude will do automatically on `yes`:**

- Update the Windows-launcher evidence tier from Tier 3 → Tier 1 in
  `CURRENT_STATE.md` + `DECISIONS_LOG.md`.
- Update `docs/FAMILY_INSTALL.md` to note that Windows install is now
  independently proven.

**On `fail`:** Claude debugs the specific failure and fixes the Windows
launcher. Don't worry about wording the failure — any short sentence is
fine.

---

## Step 3 — one real macOS click-through

**On a real Mac:**

1. Go to
   https://github.com/yosiwizman/WiseTutor/releases/tag/launchers-v1.0-2026-04-13
   and download `wisetutor-macos-launcher.zip`.
2. Double-click the zip to unzip. You should see `WiseTutor.app`.
3. Drag `WiseTutor.app` into your Applications folder.
4. **Important — the first launch:** in Finder, open the Applications
   folder, **right-click** `WiseTutor.app` → **Open** → in the popup,
   click **Open** again. (MacOS Gatekeeper blocks unsigned apps on the
   first launch; right-click → Open is the one-time bypass.) After that
   you can launch normally from Launchpad.
5. A Chrome-style window should open to WiseTutor.

**Paste back exactly one of these lines:**

```
macos install: yes — WiseTutor.app opens after right-click → Open
macos install: fail — <one sentence on what happened>
```

**What Claude will do automatically on `yes`:**

- Update the macOS-launcher evidence tier from Tier 3 → Tier 1 in
  `CURRENT_STATE.md` + `DECISIONS_LOG.md`.
- Update `docs/FAMILY_INSTALL.md` to note macOS install is independently
  proven.

**On `fail`:** Claude debugs the specific failure and either fixes the
`.app` bundle or adjusts the README so future installs don't hit the
same issue.

---

## Required evidence shapes (copy-ready)

```
# Tailscale
tailscale ip -4: 100.___.___.___
tailscale status hostname: ___

# Windows
windows install: yes|fail — ___

# macOS
macos install: yes|fail — ___
```

You can paste all three at once, or one at a time. Claude will act on
whatever arrives.

---

## What's already done (so you don't worry about it)

- ai-desktop host launcher: **Tier 1**, proven end-to-end by Playwright.
- GitHub main CI: **green**.
- GitHub launcher-validate CI on real Windows + macOS + Ubuntu runners:
  **green** (structural validation, not click-through).
- Launcher zips live on a GitHub Release with a clean download URL.
- Operator runbook + family install doc published.
- Backup / restore / rollback scripts proven.
- Ubuntu click-launch behavior proven.

Only the three human actions above remain.
