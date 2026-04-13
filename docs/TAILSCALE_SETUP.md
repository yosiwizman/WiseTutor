# WiseTutor — Tailscale setup (one-time founder action)

## Why
Right now WiseTutor is reachable inside the home only, at
`http://192.168.1.133:3782`. Two problems:
1. That IP can change if the home router hands ai-desktop a different
   lease.
2. It doesn't work off the home Wi-Fi, so phones don't reach WiseTutor
   when you're out.

Tailscale solves both: it gives ai-desktop a permanent private name
only your tailnet devices can reach (no public internet exposure).

## What Yosi does (one-time, ~3 minutes)

### Step 1 — Install Tailscale on ai-desktop
Open a terminal and run:

    curl -fsSL https://tailscale.com/install.sh | sh

Enter sudo password when asked.

### Step 2 — Start and log in
Run:

    sudo tailscale up

It prints a URL. Open that URL in any browser (phone or desktop) and
sign in with your Google / Apple / email. First device can create the
tailnet; name ai-desktop when prompted.

### Step 3 — Confirm
Run:

    tailscale status
    tailscale ip -4

Write down the 100.x.y.z IP. Also check MagicDNS is on (in the
Tailscale admin UI: DNS → Enable MagicDNS). The MagicDNS name will be
`ai-desktop` (or whatever you named it).

### Step 4 — Install Tailscale on every family phone / laptop
- Mac / Windows: download the Tailscale app from tailscale.com/download
- iOS / Android: install from the App Store / Play Store
- Sign in with the same account from Step 2
- Each device will appear in your tailnet

### Step 5 — Send the URL back to Claude
Once steps 1–4 are done, paste back:

    tailscale ip -4 output: <the 100.x.y.z IP>
    MagicDNS hostname:     <hostname from 'tailscale status' for ai-desktop>

Claude will then migrate the Windows/macOS launcher zips + Ubuntu
Desktop icon + host launcher to use the stable private URL, rebuild
the zips, and send them for the family.

## What NOT to do
- Do not make the tailnet public.
- Do not enable "Tailscale Funnel" (that exposes to the internet).
- Do not give anyone outside the family access to the tailnet.
