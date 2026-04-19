# API Key Migration Guide

This guide walks you through migrating from plaintext API key storage to secure environment variable indirection.

## Why Migrate?

**Security Issue**: Previously, API keys were stored as plaintext strings in `data/user/settings/model_catalog.json`:

```json
{
  "profiles": {
    "openai-gpt4": {
      "api_key": "sk-abc123..."  // ❌ Plaintext - readable from filesystem
    }
  }
}
```

**Security Fix**: With the new system, API keys use environment variable references:

```json
{
  "profiles": {
    "openai-gpt4": {
      "api_key": "env:OPENAI_API_KEY"  // ✅ Indirection - keys in .env only
    }
  }
}
```

**Benefits**:
- API keys no longer readable from `model_catalog.json`
- Keys stored in `.env` file with `chmod 600` permissions
- Easier key rotation (change `.env`, not JSON)
- Multi-user isolation (per-user env vars if needed)
- Compatible with family setup where child processes shouldn't access parent's keys

## Prerequisites

Before you begin:

1. **Backup your catalog**: `cp data/user/settings/model_catalog.json data/user/settings/model_catalog.json.backup`
2. **Ensure WiseTutor is running**: Backend must be running on `http://localhost:8001`
3. **Have your API keys ready**: You'll need to copy them from the catalog to `.env`

## Migration Steps

### Step 1: Run the Migration Endpoint

The migration endpoint analyzes your current catalog and generates a secure temporary file:

```bash
curl -X POST http://localhost:8001/api/v1/settings/catalog/migrate-keys | jq .
```

**Response example**:

```json
{
  "migrated_catalog": {
    "services": {
      "llm": {
        "profiles": [
          {
            "id": "openai-gpt4",
            "api_key": "env:LLM_API_KEY_PROFILE_OPENAI_GPT4",
            ...
          }
        ]
      }
    }
  },
  "env_file_path": "/tmp/wisetutor_xyz.env.migration",
  "count": 1,
  "message": "Migration file written to: /tmp/wisetutor_xyz.env.migration\nNEXT STEPS:\n1. Review the file contents: cat /tmp/wisetutor_xyz.env.migration\n2. Copy env vars to your .env file\n3. DELETE the temp file: rm /tmp/wisetutor_xyz.env.migration\n4. Save the migrated catalog to model_catalog.json\n5. Restart the backend to load new env vars",
  "user_id": "default"
}
```

**SECURITY NOTE**: The API does NOT return plaintext keys in the response. Instead, keys are written to a secure temporary file with 0600 permissions (owner read/write only).

::: warning Important
The migration endpoint does **not** automatically update your catalog. It only generates a preview and writes keys to a secure temp file. You must manually apply the changes for safety.
:::

### Step 2: Review the Migration File

Review the generated env vars in the temp file:

```bash
# Replace with your actual temp file path from step 1
cat /tmp/wisetutor_xyz.env.migration
```

You should see:

```
# WiseTutor API Key Migration
# Generated: 2026-04-17T15:30:00
# SECURITY: This file contains sensitive API keys.
# ACTION REQUIRED:
#   1. Review the keys below
#   2. Copy them to your .env file
#   3. DELETE THIS FILE immediately after

LLM_API_KEY_PROFILE_OPENAI_GPT4=sk-abc123...
LLM_API_KEY_PROFILE_ANTHROPIC_CLAUDE=sk-ant-xyz789...
EMBEDDING_API_KEY_PROFILE_OPENAI_EMBEDDINGS=sk-abc123...
```

**Security Check**:

```bash
# Verify temp file has 0600 permissions (owner read/write only)
ls -la /tmp/wisetutor_*.env.migration
# Should show: -rw------- (600 permissions)
```

### Step 3: Update Your `.env` File

Copy the environment variables from the temp file to your `.env` file:

```bash
# Navigate to project root
cd /path/to/WiseTutor

# Edit .env file
nano .env
```

Add the variables from the temp file:

```bash
# API Key Storage (migrated from model_catalog.json)
LLM_API_KEY_PROFILE_OPENAI_GPT4=sk-abc123...
LLM_API_KEY_PROFILE_ANTHROPIC_CLAUDE=sk-ant-xyz789...
EMBEDDING_API_KEY_PROFILE_OPENAI_EMBEDDINGS=sk-abc123...
```

**Or copy them automatically** (review first!):

```bash
# IMPORTANT: Review the temp file first!
cat /tmp/wisetutor_xyz.env.migration >> .env
```

**Security Check**:

```bash
# Verify .env is not world-readable
ls -la .env
# Should show: -rw------- (600 permissions)

# If not, fix permissions:
chmod 600 .env
```

### Step 4: Delete the Temporary File

**CRITICAL**: Delete the temp file immediately after copying:

```bash
rm /tmp/wisetutor_xyz.env.migration

# Verify it's gone
ls /tmp/wisetutor_*.env.migration
# Should return: No such file or directory
```

Leaving the temp file on disk defeats the security improvement!

### Step 5: Update `model_catalog.json`

Replace your current catalog with the `migrated_catalog` from the migration response:

```bash
# Backup first (if you haven't already)
cp data/user/settings/model_catalog.json data/user/settings/model_catalog.json.backup

# Edit the catalog
nano data/user/settings/model_catalog.json
```

Replace the entire contents with the `migrated_catalog` JSON from the migration response.

**Verify the changes**:

```bash
# Check that api_key fields now use env: syntax
grep "api_key" data/user/settings/model_catalog.json
# Should show: "api_key": "env:LLM_API_KEY_PROFILE_..."
```

### Step 6: Restart Backend

Restart the backend to pick up the new environment variables:

```bash
# If running with Docker:
docker compose down
docker compose up -d backend

# If running locally:
# Stop the backend (Ctrl+C), then:
source .venv/bin/activate
python -m deeptutor.main
```

### Step 5: Verify Migration

Test that the system can resolve API keys correctly:

**1. Check logs for warnings**:

```bash
# Should NOT see: "Plaintext API keys are deprecated"
tail -f logs/backend.log | grep "api_key"
```

**2. Test a chat request**:

Open WiseTutor UI at `http://localhost:3782` and send a test message. If it responds correctly, your API keys are resolving properly.

**3. Verify with curl** (optional):

```bash
# Test the /verify endpoint
curl http://localhost:8001/api/v1/settings/verify
# Should return: {"status": "ok", "llm": "configured", ...}
```

## Rollback Procedure

If something goes wrong, rollback to plaintext keys:

### Option 1: Restore Backup

```bash
# Restore the backup catalog
cp data/user/settings/model_catalog.json.backup data/user/settings/model_catalog.json

# Remove env vars from .env (optional)
nano .env  # Delete the LLM_API_KEY_PROFILE_* lines

# Restart backend
docker compose restart backend
```

### Option 2: Manual Edit

Edit `model_catalog.json` and replace `"api_key": "env:VAR_NAME"` with the actual key from your `.env` file:

```json
{
  "api_key": "sk-abc123..."  // Replace env:VAR_NAME with actual key
}
```

::: info Backward Compatibility
Plaintext API keys are **deprecated** but still work. You'll see a warning in the logs, but functionality is preserved.
:::

## Multi-User Setup (Advanced)

If you're running WiseTutor for multiple users (e.g., family setup with parent and child users), you can isolate API keys per user:

### Per-User Environment Variables

```bash
# In .env
MRW_OPENAI_KEY=sk-parent-key-abc123...
BELLA_OPENAI_KEY=sk-child-key-xyz789...
```

### Per-User Catalogs

Each user has their own catalog at:
- `data/user/settings/model_catalog.json` (default user)
- `data/user/mrw/settings/model_catalog.json` (Mr W)
- `data/user/bella/settings/model_catalog.json` (Bella)

Edit each catalog to reference the correct env var:

```json
// data/user/mrw/settings/model_catalog.json
{
  "profiles": {
    "openai-gpt4": {
      "api_key": "env:MRW_OPENAI_KEY"
    }
  }
}

// data/user/bella/settings/model_catalog.json
{
  "profiles": {
    "openai-gpt4": {
      "api_key": "env:BELLA_OPENAI_KEY"
    }
  }
}
```

This ensures child processes cannot read parent API keys from the filesystem.

## Troubleshooting

### Error: "API key not found in environment"

**Symptom**: Backend logs show `KeyError: 'LLM_API_KEY_PROFILE_OPENAI_GPT4'`

**Fix**: Verify the env var is in `.env` and restart the backend:

```bash
grep "LLM_API_KEY_PROFILE_OPENAI_GPT4" .env
# If not found, add it

# Restart
docker compose restart backend
```

### Warning: "Plaintext API keys are deprecated"

**Symptom**: Logs show deprecation warning after migration

**Fix**: Double-check that all `api_key` fields in `model_catalog.json` use `env:` syntax:

```bash
grep '"api_key"' data/user/settings/model_catalog.json
# ALL lines should show: "api_key": "env:..."
```

### Migration endpoint returns 404

**Symptom**: `curl` returns `{"detail": "Not Found"}`

**Fix**: Ensure you're running the updated backend version with the migration endpoint. Pull the latest code:

```bash
git pull origin main
docker compose up -d --build backend
```

### Keys work locally but not in Docker

**Symptom**: Docker container can't resolve env vars

**Fix**: Pass env vars to Docker via `docker-compose.yml`:

```yaml
services:
  backend:
    env_file:
      - .env  # Ensure this is present
```

Or pass explicitly:

```yaml
services:
  backend:
    environment:
      - LLM_API_KEY_PROFILE_OPENAI_GPT4=${LLM_API_KEY_PROFILE_OPENAI_GPT4}
```

## Security Best Practices

After migration:

1. **Delete backup if it contains keys**: `rm data/user/settings/model_catalog.json.backup`
2. **Verify permissions**: `ls -la .env` should show `-rw------- (600)`
3. **Never commit `.env`**: Check `.gitignore` includes `.env` and `.env.*`
4. **Rotate compromised keys**: If a key was ever exposed (screenshot, log file, shared terminal), rotate it at the provider's dashboard
5. **Use separate keys per user**: Don't share API keys between family members

## Additional Resources

- **Security Baseline**: See `SECURITY_BASELINE.md` for full security documentation
- **Decisions Log**: See `DECISIONS_LOG.md` entry for 2026-04-17 for architectural rationale
- **Test Coverage**: Review `tests/services/config/test_api_key_resolution.py` for implementation details

## Support

If you encounter issues not covered in this guide:

1. Check backend logs: `tail -f logs/backend.log`
2. Review test output: `pytest tests/services/config/test_api_key_resolution.py -v`
3. Consult `SECURITY_BASELINE.md` for secrets handling rules
4. Open an issue with full error logs (redact any keys!)

---

**Migration Status**: After completing these steps, your API keys are stored securely via environment variable indirection. The plaintext keys in `model_catalog.json` have been replaced with `env:VAR_NAME` references that resolve at runtime.
