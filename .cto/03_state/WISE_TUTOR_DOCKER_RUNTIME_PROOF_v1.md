# WISE_TUTOR_DOCKER_RUNTIME_PROOF_v1

## Status
Closed and verified.

## Scope
This artifact records that the WiseTutor Docker runtime proof lane is complete on the current Ubuntu host.

## What is proven
1. Docker Compose v2 is installed and functioning on the host.
2. `docker compose -f docker-compose.yml config --services` succeeds.
3. The `deeptutor` image builds successfully.
4. The `deeptutor` container starts successfully.
5. Container health reaches `healthy`.
6. Live port publication is present for:
   - 8001/tcp -> host 8001
   - 3782/tcp -> host 3782
7. Host smoke checks succeed:
   - backend `http://localhost:8001/` -> HTTP 200
   - frontend `http://localhost:3782/` -> HTTP 200

## Important findings during proof
1. Initial host blocker:
   - Compose v2 missing on host
   - fixed by installing `docker-compose-v2`

2. Initial app build blocker:
   - frontend build failed due to invalid Next.js rewrite destination caused by placeholder-driven `NEXT_PUBLIC_API_BASE`
   - fixed by removing `process.env.NEXT_PUBLIC_API_BASE` from `web/next.config.js` rewrite backend resolution

3. Initial runtime blocker:
   - stale local `next-server` process held host port 3782
   - stale local `uvicorn` process held host port 8001
   - both were non-Docker local processes and were stopped before final recreate

## Final verified state
- container: `deeptutor`
- image: `wisetutor-deeptutor:latest`
- container state: running
- health state: healthy
- backend host smoke: 200
- frontend host smoke: 200

## Limits
This proof confirms a development-ready Docker runtime base for WiseTutor on this host.
It does not by itself prove:
- feature correctness beyond root-route smoke
- business workflow correctness
- provider correctness under live API usage
- full regression coverage

## Decision
This lane is closed.
The WiseTutor Docker runtime base is proven and ready for bounded development work.

