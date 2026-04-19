# State — Risk Log

**Purpose:** The live list of risks currently affecting the project. If a risk is not here, nobody is watching it.

**Format (one entry per block):**
```
### R-NNN · <short name>
- **Opened:** YYYY-MM-DD
- **Status:** open | mitigating | accepted | closed
- **Owner:** <name or "founder">
- **Likelihood × Impact:** L/M/H × L/M/H
- **Trigger that would prove this is hitting:** <the signal>
- **Mitigation / plan:** <short>
- **Reversal / containment if it hits:** <short>
- **Links:** <code path, ADR, decision_log entry>
```

**Rules:**
- One block per risk. Risks are *not* merged; a closed risk stays with its close date.
- Every open risk has an owner and a trigger signal. If you can't name the signal, you can't see the risk.
- Agents raise risks proactively during planning. They do not silently close them.
- A risk is only **closed** when the trigger can no longer fire, not when we stopped paying attention.

---

## Open / active

(none yet)

## Closed

(none yet)
