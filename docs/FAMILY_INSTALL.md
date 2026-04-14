# Installing WiseTutor on your computer

## Where to download (updated 2026-04-13)

The launcher zips live on the WiseTutor GitHub Release page:

https://github.com/yosiwizman/WiseTutor/releases/tag/launchers-v1.0-2026-04-13

Download the file for your OS:
- Windows: `wisetutor-windows-launcher.zip`
- Mac:     `wisetutor-macos-launcher.zip`

Then follow the OS-specific steps below.

If the release page later shows a newer tag (e.g. `launchers-v1.1-...`), grab that one instead — the release notes always say which URL it points to.

---

WiseTutor runs on Mr W's ai-desktop computer at home. This is a small
launcher that opens the app in your browser, like a bookmark that
looks like an app. Nothing is installed on your computer except the
launcher icon.

---

## If you are on Windows

1. Save `wisetutor-windows-launcher.zip` to your Desktop.
2. Right-click it and choose "Extract All". Click Extract.
3. Inside the new folder, right-click `install-wisetutor.ps1` and choose
   "Run with PowerShell".
   - If Windows shows a warning: right-click the file → Properties →
     tick "Unblock" at the bottom → click OK → try again.
4. You will now see a WiseTutor icon on your Desktop and in the Start Menu.
   Double-click it to open WiseTutor.

---

## If you are on Mac

1. Save `wisetutor-macos-launcher.zip` to your Desktop.
2. Double-click the zip to unzip it. You should see `WiseTutor.app`.
3. Drag `WiseTutor.app` into your Applications folder.
4. The first time only: right-click `WiseTutor.app` → click Open →
   click Open again when Mac asks if you trust it.
   After that, you can launch it from Launchpad like any other app.
5. If `WiseTutor.app` won't open at all, double-click `WiseTutor.command`
   from the unzipped folder instead. It does the same thing.

---

## Requirements

- You must be connected to the home Wi-Fi (the same network as Mr W's
  ai-desktop computer).
- Mr W's ai-desktop must be switched on.
- You do not need to install anything else — no backend, no extra software.

If the app does not load, text Yosi.

---

## Changing where WiseTutor is hosted

The launcher points at Mr W's computer on the home network at address
`192.168.1.133`. If that address ever changes, Yosi will send you a new
launcher zip. Unzip it and repeat the install steps above to replace the
old one. The old icon can be deleted from your Desktop.
