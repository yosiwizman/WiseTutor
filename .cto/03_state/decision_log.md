# State — Decision Log

**Purpose:** One-line durable record of every decision that changed doctrine, architecture, stack, scope, or a stated constraint. Append-only. Oldest at top, newest at bottom.

**Format (one entry per line):**
```
YYYY-MM-DD · <who decided> · <short decision> · <link to ADR or PR if structural>
```

**Rules:**
- Never edit a past entry. Superseded decisions get a new line noting supersession.
- Chat-only decisions do not exist. If it isn't here, it didn't happen.
- Structural decisions (new service, new DB, new port, new framework, new external dep category) require a full ADR using `05_templates/adr_template.md` — link the ADR path from the one-line entry.
- An agent proposing a decision writes it as `· proposed ·` and stops. A founder converts it to `· approved ·` on acceptance.

---

## Entries

(none yet)
