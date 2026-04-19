# GitHub Secrets Setup for Provider-Dependent Tests

This document explains how to configure GitHub repository secrets required by the `provider-tests.yml` workflow.

## Overview

The provider-dependent CI lane runs tests that require real LLM API calls to OpenAI and/or Anthropic. These tests are excluded from the main CI workflow and run on a separate schedule or manual trigger using API keys stored as GitHub repository secrets.

## Required Secrets

At least **one** of the following secrets must be configured:

- `OPENAI_API_KEY` — OpenAI API key for testing OpenAI provider integration
- `ANTHROPIC_API_KEY` — Anthropic API key for testing Anthropic provider integration

Both can be configured to enable testing against both providers.

## Security Guarantees

- API keys are stored securely in GitHub's encrypted secrets storage
- Keys are automatically masked in all GitHub Actions logs
- The workflow includes explicit secret redaction before uploading artifacts
- Keys are never committed to the repository or exposed in pull requests

## Setup Instructions

### 1. Obtain API Keys

**OpenAI:**
1. Visit [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key immediately (it won't be shown again)

**Anthropic:**
1. Visit [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Sign in or create an account
3. Click "Create Key"
4. Copy the key immediately (it won't be shown again)

### 2. Add Secrets to GitHub Repository

1. Navigate to your repository on GitHub
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret:

   **For OpenAI:**
   - Name: `OPENAI_API_KEY`
   - Value: `sk-...` (your OpenAI API key)
   - Click **Add secret**

   **For Anthropic:**
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-...` (your Anthropic API key)
   - Click **Add secret**

### 3. Verify Configuration

After adding secrets, you can verify the setup by:

1. Navigate to **Actions** tab in your repository
2. Select **Provider-Dependent Tests** workflow
3. Click **Run workflow** button
4. Select a provider to test (or "both" if both keys are configured)
5. Click **Run workflow**

The workflow will:
- Validate that at least one required secret is present
- Use the available provider(s) to run tests
- Report results in the workflow summary

If secrets are missing, you'll see this error:
```
ERROR: At least one of OPENAI_API_KEY or ANTHROPIC_API_KEY must be set in repository secrets
See .github/SECRETS_SETUP.md for configuration instructions
```

## What Gets Tested

The provider-dependent test lane runs:

### pytest (8 tests with `@requires_provider()`)
- `tests/integration/test_child_safety.py` (2 tests)
- `tests/integration/test_per_user_catalog.py` (2 tests)
- `tests/integration/test_multi_user_isolation.py` (2 tests)
- `tests/integration/test_capability_enforcement.py` (2 tests)

### Playwright (4 projects)
- `identity-truth` — validates runtime provider/model reporting
- `popup-layout` — tests settings verification against real providers
- `preferences-divergence` — verifies per-user provider preferences
- `per-user-catalog` — tests per-user catalog diagnostics endpoint

## When Tests Run

The workflow runs:
- **Manually:** via workflow_dispatch in GitHub Actions UI
- **Scheduled:** weekly on Sundays at 06:00 UTC (configurable in `.github/workflows/provider-tests.yml`)

## Cost Considerations

Provider-dependent tests make real API calls to LLM providers:
- Each test run consumes API credits from your configured providers
- Estimated cost per run: ~$0.10-$0.50 depending on providers and models used
- Weekly schedule limits costs while still catching regressions

To reduce costs:
- Use the smallest available models (e.g., gpt-4o-mini, claude-haiku)
- Run manually only when needed instead of weekly schedule
- Configure only one provider instead of both

## Troubleshooting

### Workflow fails with "at least one API key required"
- Verify secret names are exactly `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` (case-sensitive)
- Check that secrets are added to the repository (not organization or environment secrets)
- Ensure secrets have non-empty values

### Tests fail with authentication errors
- Verify API keys are valid and not revoked
- Check that your OpenAI/Anthropic account has sufficient credits
- Ensure keys have not expired (if applicable)

### Secrets appear in logs
- GitHub Actions automatically masks secret values in console output
- The workflow includes explicit redaction in uploaded artifacts
- If you discover a leak, rotate your keys immediately and report the issue

## Key Rotation

To rotate API keys:

1. Generate new keys from provider dashboards (see "Obtain API Keys" above)
2. Update GitHub secrets with new values:
   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Click on the secret name
   - Click **Update secret**
   - Paste new value
   - Click **Update secret**
3. Revoke old keys from provider dashboards
4. Run the workflow manually to verify new keys work

## Related Documentation

- Main CI workflow: `.github/workflows/ci.yml`
- Provider-dependent workflow: `.github/workflows/provider-tests.yml`
- Test marker definition: `tests/integration/conftest.py` (`@requires_provider()` decorator)
- Playwright projects: `web/playwright.config.ts`

## Support

If you encounter issues with secret setup or the provider-dependent test lane:
1. Check this documentation first
2. Review workflow logs in GitHub Actions for error details
3. Open an issue with relevant error messages and configuration details (redact any sensitive information)
