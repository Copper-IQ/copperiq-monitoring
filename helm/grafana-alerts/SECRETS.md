# Secrets Management for Grafana Alerts

## Overview

The Grafana alert provisioning files contain placeholder variables for secrets that must be replaced at deployment time. **DO NOT commit actual webhook URLs or tokens to Git.**

---

## Required Secrets

### 1. Slack Webhook URL

**Placeholder**: `${SLACK_WEBHOOK_URL}`  
**File**: `contact-points.yaml`  
**Format**: `https://hooks.slack.com/services/T.../B.../XXX...`

---

## Deployment Methods

### Option 1: Pulumi Secret Replacement (Recommended)

Configure Pulumi to inject secrets into the Helm chart values:

```csharp
// In shared-hosting-infra/Components/ObservabilityStack.cs
var helmChart = new Chart("copperiq-monitoring", new ChartArgs
{
    Chart = "copperiq-monitoring",
    Namespace = "observability",
    Values = new InputMap<object>
    {
        ["alerts"] = new InputMap<object>
        {
            ["enabled"] = true,
            ["slackWebhookUrl"] = config.RequireSecret("slackWebhookUrl")
        }
    }
});
```

Then in Helm templates, use the value:

```yaml
# helm/templates/grafana-alerts.yaml
data:
  contact-points.yaml: |
    {{ $content := .Files.Get "grafana-alerts/contact-points.yaml" }}
    {{ $content | replace "${SLACK_WEBHOOK_URL}" .Values.alerts.slackWebhookUrl }}
```

### Option 2: ArgoCD with Sealed Secrets

1. Create a SealedSecret with the webhook URL:

```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: grafana-alert-secrets
  namespace: observability
spec:
  encryptedData:
    slack-webhook-url: <encrypted-value>
```

2. Mount the secret in Grafana pod:

```yaml
envFrom:
  - secretRef:
      name: grafana-alert-secrets
```

3. Update contact-points.yaml to reference the env var

### Option 3: Manual Replacement (Development Only)

For local testing, manually replace the placeholder:

```bash
# Set the secret
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T.../B.../XXX..."

# Replace in file (temporary, do not commit)
sed -i "s|\${SLACK_WEBHOOK_URL}|${SLACK_WEBHOOK_URL}|g" grafana-alerts/contact-points.yaml
```

**IMPORTANT**: Revert this change before committing!

---

## Current Secret Values (For Reference Only)

These are stored securely outside of Git:

- **Slack Webhook URL**: Stored in team password manager / Azure Key Vault
  - Channel: `#infra-alerts`
  - Format: `https://hooks.slack.com/services/T.../B.../XXX...`

---

## Security Best Practices

1. ✅ **DO**: Use secret management systems (Pulumi secrets, Sealed Secrets, Key Vault)
2. ✅ **DO**: Use environment variables or secret mounts
3. ✅ **DO**: Rotate secrets regularly
4. ❌ **DON'T**: Commit actual webhook URLs to Git
5. ❌ **DON'T**: Share secrets in Slack/email
6. ❌ **DON'T**: Use placeholders in production without replacement

---

## GitHub Secret Scanning

GitHub will block pushes containing:
- Slack webhook URLs (`https://hooks.slack.com/services/...`)
- Slack bot tokens (`xoxb-...`, `xoxp-...`)
- Other recognized secret patterns

If your push is blocked:
1. Remove the secret from the file
2. Use a placeholder variable instead
3. Rewrite Git history to remove the secret from all commits:

```bash
# WARNING: Rewrites history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch grafana-alerts/contact-points.yaml" \
  --prune-empty --tag-name-filter cat -- --all
```

Or use simpler approach - just update the file and force push:

```bash
# Update file with placeholder
git add grafana-alerts/contact-points.yaml
git commit --amend --no-edit
git push origin master --force
```

---

## Testing Alerts Locally

For local testing without secrets:

1. Use a test Slack workspace
2. Create a temporary webhook for testing
3. Replace placeholder manually (don't commit)
4. Test alert notifications
5. Revert changes before committing
