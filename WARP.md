# Grafana Unified Alerting - Developer Guidelines

## Overview

This document captures critical learnings from implementing Grafana Unified Alerting for CopperIQ's shared infrastructure. Read this before modifying alerts to avoid common pitfalls.

---

## Architecture Decisions

### Why Grafana Unified Alerting (Not Prometheus Alertmanager)

**Problem**: We need to alert on metrics from multiple sources:
- Prometheus (AKS cluster metrics, application metrics)
- Azure Monitor (PostgreSQL, MySQL, AKS control plane)

**Solution**: Grafana Unified Alerting can evaluate rules across multiple datasources.

**Key Difference**:
```yaml
# ❌ OLD: PrometheusRule (Prometheus Operator)
# Can ONLY query Prometheus metrics
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: azure-postgresql-alerts
spec:
  groups:
    - name: postgresql
      rules:
        - alert: HighCPU
          expr: azure_postgres_cpu > 80  # ❌ Prometheus can't query Azure Monitor!

# ✅ NEW: Grafana Alert Rule
# Can query ANY datasource configured in Grafana
apiVersion: 1
groups:
  - name: postgresql
    rules:
      - uid: azurepostgresqlhighcpu
        datasourceUid: azure-monitor  # ✅ Works!
        model:
          expr: azure_postgres_cpu > 80
```

**Architecture Change**:
- **Old**: PrometheusRule → Prometheus → Prometheus Alertmanager → Slack
- **New**: Grafana Alerts → Grafana Alertmanager → Slack

---

## Alert Rule Structure

### The 3-Stage Pipeline

Every Grafana alert rule has 3 stages (A, B, C):

```yaml
data:
  # Stage A: Query the datasource
  - refId: A
    datasourceUid: prometheus
    model:
      expr: node_filesystem_avail_bytes / node_filesystem_size_bytes
  
  # Stage B: Reduce time series to single value
  - refId: B
    datasourceUid: __expr__
    model:
      type: reduce
      expression: A
      reducer: last  # or min, max, mean, sum
  
  # Stage C: Evaluate threshold condition
  - refId: C
    datasourceUid: __expr__
    model:
      type: math
      expression: $B < 0.15  # Condition that triggers alert
```

**Critical**: Stage B is REQUIRED for proper template formatting (see below).

---

## Template Formatting (CRITICAL)

### The Problem with `$value`

When an alert fires, Grafana provides template variables:
- `$value` - String representation of all query results (can be verbose)
- `$values` - Structured map of results by RefID
- `$labels` - Labels from the query

**The Issue**: For multi-series queries, `$value` returns an ARRAY:
```
$value = "[ var='B' labels={node=node1} value=0.75 ], [ var='B' labels={node=node2} value=0.80 ]"
```

Passing this to `humanize` functions causes parse errors:
```
Error: strconv.ParseFloat: parsing "[ var='B' ... ]": invalid syntax
```

### ✅ CORRECT Template Syntax

Access the **reduced value from stage B** using `$values.B.Value`:

```yaml
annotations:
  summary: Node {{ $labels.node }} disk > 75% full
  description: |
    Node {{ $labels.node }} has {{ if $values.B }}{{ humanizePercentage $values.B.Value }}{{ end }} free.
```

**Why this works**:
- Stage B reduces time series to single value per series
- `$values.B.Value` accesses that specific numeric value
- `{{ if $values.B }}` handles no-data cases gracefully
- `humanizePercentage` expects a single float, not an array

### Available Humanize Functions

```go
// Percentage: 0.8 → "80%"
{{ if $values.B }}{{ humanizePercentage $values.B.Value }}{{ end }}

// Duration: 1.5 → "1.5s"
{{ if $values.B }}{{ humanizeDuration $values.B.Value }}{{ end }}

// Plain number: 1234 → "1.234k"
{{ if $values.B }}{{ humanize $values.B.Value }}{{ end }}

// Timestamp: Convert to timezone and format
{{ .StartsAt | tz "Europe/Amsterdam" | date "15:04:05 MST" }}
```

**Reference**: https://grafana.com/docs/grafana/latest/alerting/alerting-rules/templates/

### ❌ Common Mistakes to Avoid

```yaml
# ❌ WRONG: Using $value directly with humanize
description: "CPU usage: {{ $value | humanizePercentage }}"
# Error: Cannot parse array

# ❌ WRONG: Using undefined functions
description: "CPU usage: {{ printf \"%.1f%%\" (mul $value 100) }}"
# Error: function "mul" not defined

# ❌ WRONG: No conditional check
description: "CPU usage: {{ humanizePercentage $values.B.Value }}"
# Error: Cannot call .Value on nil when no data

# ✅ CORRECT: Conditional + specific value access
description: "CPU usage: {{ if $values.B }}{{ humanizePercentage $values.B.Value }}{{ end }}"
```

---

## Secret Management

### Slack Webhook Injection

**Problem**: GitHub secret scanning blocks Slack webhooks in Git commits.

**Solution**: Two-layer approach:

1. **Pulumi-Managed ConfigMap** (contact-points.yaml with webhook)
   ```csharp
   // In ObservabilityStack.cs
   var slackWebhookUrl = config.RequireSecret("slackWebhookUrl");
   var contactPointsYaml = File.ReadAllText("../copperiq-monitoring/grafana-alerts/contact-points.yaml");
   
   new ConfigMap("grafana-contact-points", new ConfigMapArgs {
       Data = { 
           { "contact-points.yaml", slackWebhookUrl.Apply(url => 
               contactPointsYaml.Replace("${SLACK_WEBHOOK_URL}", url)) 
           }
       },
       Labels = { { "grafana_alert", "1" } }  // ← Grafana sidecar discovers this
   });
   ```

2. **ArgoCD-Managed ConfigMaps** (alert rules, folders, policies)
   - Deployed via Helm chart
   - `ignoreDifferences` configured for `grafana-contact-points` only
   - Contact-points excluded from Helm chart (managed by Pulumi)

### Setting the Webhook Secret

```bash
cd shared-hosting-infra
pulumi config set --secret slackWebhookUrl "https://hooks.slack.com/..." -s accept_prod
pulumi up -s accept_prod
```

**Never commit** actual webhook URLs to Git!

---

## Deployment Flow

### How Alerts Get Provisioned

```
1. Developer commits alert YAML to Git
   └─> grafana-alerts/*.yaml (source of truth)
   └─> Copied to helm/grafana-alerts/*.yaml

2. ArgoCD detects Git change
   └─> Syncs copperiq-monitoring Helm chart
   └─> Creates ConfigMaps with grafana_alert=1 label

3. Grafana sidecar detects ConfigMaps
   └─> Watches for label: grafana_alert=1
   └─> Mounts files to /etc/grafana/provisioning/alerting/
   └─> Grafana provisions alerts automatically

4. No manual steps required!
```

### Critical Configuration

**Grafana Helm Values** (in `shared-hosting-infra/Components/ObservabilityStack.cs`):
```yaml
grafana:
  grafana.ini:
    unified_alerting:
      enabled: true      # ← Enable Unified Alerting
    alerting:
      enabled: false     # ← Disable legacy alerting
  
  sidecar:
    alerts:
      enabled: true
      label: grafana_alert      # ← Watch for this label
      labelValue: "1"
      folder: /etc/grafana/provisioning/alerting
      searchNamespace: ALL       # ← Discover in all namespaces
  
  datasources:
    datasources.yaml:
      datasources:
        - name: Prometheus
          jsonData:
            manageAlerts: true   # ← Let Grafana manage alerts (not Prometheus)
```

**ArgoCD Application** (`argocd-application.yaml`):
```yaml
spec:
  ignoreDifferences:
    - group: ""
      kind: ConfigMap
      name: grafana-contact-points  # ← Only ignore Pulumi-managed ConfigMap
      jsonPointers:
        - /data
```

**Why this matters**: Without `name:` filter, ArgoCD would ignore ALL ConfigMap data changes, preventing alert updates!

---

## File Structure

```
copperiq-monitoring/
├── grafana-alerts/              # Source of truth
│   ├── folders.yaml             # Alert folders (infrastructure, applications, databases)
│   ├── contact-points.yaml      # Slack contact point (with ${SLACK_WEBHOOK_URL} placeholder)
│   ├── notification-policies.yaml # Routing rules
│   ├── node-disk-space.yaml     # Alert definitions
│   ├── aks-cluster.yaml
│   └── ...
├── helm/
│   ├── grafana-alerts/          # Copied from root (keep in sync!)
│   │   └── *.yaml
│   ├── templates/
│   │   ├── _helpers.tpl         # Required for Helm template functions
│   │   └── grafana-alerts.yaml  # Creates ConfigMap from grafana-alerts/*
│   ├── Chart.yaml
│   └── values.yaml
├── argocd-application.yaml      # ArgoCD deployment manifest
├── fix-alert-templates.ps1      # Automation script for template fixes
├── DEPLOYMENT.md                # Deployment instructions
├── DEPLOYMENT_SUMMARY.md        # What was deployed
└── WARP.md                      # This file
```

**Important**: Always keep `grafana-alerts/*.yaml` and `helm/grafana-alerts/*.yaml` in sync!

---

## Adding New Alerts

### Step-by-Step

1. **Create alert YAML** in `grafana-alerts/`:
   ```yaml
   # grafana-alerts/my-new-alert.yaml
   apiVersion: 1
   groups:
     - orgId: 1
       name: my-new-alert
       folder: applications  # or infrastructure, databases
       interval: 30s
       rules:
         - uid: mynewaler
           title: MyNewAlert
           condition: C
           for: 5m
           annotations:
             summary: Something is wrong
             description: |
               Details: {{ if $values.B }}{{ humanize $values.B.Value }}{{ end }}
           labels:
             severity: warning
             component: myapp
           data:
             - refId: A
               datasourceUid: prometheus
               model:
                 expr: my_metric > 100
             - refId: B
               datasourceUid: __expr__
               model:
                 type: reduce
                 expression: A
                 reducer: last
             - refId: C
               datasourceUid: __expr__
               model:
                 type: math
                 expression: $B > 100
   ```

2. **Test template syntax**:
   ```bash
   cd copperiq-monitoring
   helm template test ./helm
   # Should render without errors
   ```

3. **Copy to Helm chart**:
   ```bash
   Copy-Item grafana-alerts/my-new-alert.yaml helm/grafana-alerts/
   ```

4. **Update Helm template** (`helm/templates/grafana-alerts.yaml`):
   ```yaml
   data:
     # ... existing files ...
     my-new-alert.yaml: |
   {{ .Files.Get "grafana-alerts/my-new-alert.yaml" | indent 4 }}
   ```

5. **Commit and push**:
   ```bash
   git add grafana-alerts/my-new-alert.yaml helm/
   git commit -m "Add MyNewAlert for monitoring xyz"
   git push
   ```

6. **Wait for ArgoCD sync** (auto-syncs every 3 minutes)
   ```bash
   kubectl get application copperiq-monitoring -n argocd -o jsonpath='{.status.sync.status}'
   ```

7. **Verify in Grafana UI**:
   - Navigate to: https://monitoring.accept.copperiq.com
   - Go to: Alerting → Alert Rules
   - Find your alert in the appropriate folder

---

## Troubleshooting

### Template Expansion Errors

**Symptom**: Grafana logs show `error parsing template` or `error calling humanize`

```bash
kubectl logs -n observability prometheus-grafana-0 -c grafana --tail=100 | grep error
```

**Common Causes**:
1. Using `$value` instead of `$values.B.Value`
2. Missing conditional `{{ if $values.B }}`
3. Using undefined functions like `mul` or `mulf`

**Fix**: Run `fix-alert-templates.ps1` or manually update templates.

### Alerts Not Showing in Grafana

**Check 1**: ConfigMap exists with correct label
```bash
kubectl get configmap -n observability -l grafana_alert=1
```

**Check 2**: Sidecar logs for provisioning
```bash
kubectl logs -n observability prometheus-grafana-0 -c grafana-sc-alerts
```

**Check 3**: ArgoCD sync status
```bash
kubectl get application copperiq-monitoring -n argocd -o jsonpath='{.status.sync.status}'
```

### Slack Notifications Not Working

**Check 1**: Contact point configured
```bash
kubectl get configmap grafana-contact-points -n observability -o yaml
# Verify webhook URL is present (not ${SLACK_WEBHOOK_URL})
```

**Check 2**: Test in Grafana UI
- Alerting → Contact Points → slack-infra-alerts → Test

**Check 3**: Notification policy routing
- Alerting → Notification Policies
- Verify severity/component labels match your alerts

---

## Best Practices

### ✅ DO

- Always use `$values.B.Value` in templates with humanize functions
- Wrap value access in conditionals: `{{ if $values.B }}`
- Keep `grafana-alerts/*.yaml` and `helm/grafana-alerts/*.yaml` in sync
- Test template syntax with `helm template` before committing
- Use descriptive alert UIDs (lowercase, no special chars)
- Include runbook URLs in annotations
- Set appropriate `for:` duration to avoid flapping
- Use severity labels: `critical`, `warning`, `info`

### ❌ DON'T

- Commit Slack webhooks to Git (use Pulumi secrets)
- Use `$value` directly with humanize functions
- Use undefined template functions (check Grafana docs first)
- Modify `grafana-contact-points` ConfigMap manually (Pulumi manages it)
- Set `ignoreDifferences` for all ConfigMaps (be specific!)
- Create alerts without reduce stage (Stage B)
- Skip the conditional check in templates
- Use `--no-verify` to bypass pre-commit hooks

---

## References

### Official Documentation
- **Grafana Unified Alerting**: https://grafana.com/docs/grafana/latest/alerting/
- **Alert Rule Templates**: https://grafana.com/docs/grafana/latest/alerting/alerting-rules/templates/
- **Template Functions**: https://grafana.com/docs/grafana/latest/alerting/alerting-rules/templates/reference/
- **Notification Templates**: https://grafana.com/docs/grafana/latest/alerting/configure-notifications/template-notifications/

### Internal Documentation
- `DEPLOYMENT.md` - Step-by-step deployment guide
- `DEPLOYMENT_SUMMARY.md` - Complete deployment details
- `grafana-alerts/README.md` - Alert file structure
- `grafana-alerts/SECRETS.md` - Secret management details

### Tools
- `fix-alert-templates.ps1` - Automated template syntax fixer
- `convert-alerts.mjs` - PrometheusRule → Grafana converter (historical)
- `validate-yaml.mjs` - YAML syntax validator (historical)

---

## Key Learnings

### 1. Don't Guess, Use Official Docs

**What we learned**: Initially tried custom template functions like `mul`, `mulf`, `printf` which don't exist in Grafana.

**Solution**: Used Context7 to fetch official Grafana documentation and discovered:
- `humanize`, `humanizePercentage`, `humanizeDuration` are the correct functions
- `$values.B.Value` is the proper way to access reduced values
- Conditional checks are essential for no-data scenarios

**Lesson**: When implementing unfamiliar technology, consult official docs via Context7 instead of trial-and-error.

### 2. Multi-Datasource Alerting Requires Grafana

**What we learned**: Prometheus can only alert on Prometheus metrics. Azure Monitor metrics are inaccessible.

**Solution**: Grafana Unified Alerting evaluates rules across any configured datasource.

**Lesson**: Choose alerting platforms based on datasource requirements, not familiarity.

### 3. Secret Management Must Account for Git Scanning

**What we learned**: GitHub automatically scans commits for secrets and blocks pushes containing Slack webhooks.

**Solution**: 
- Store webhook as Pulumi encrypted secret
- Inject at deployment time via ConfigMap
- Use placeholder in Git-committed files

**Lesson**: Plan secret injection strategy before committing any sensitive values.

### 4. Helm Chart File Access Requires Proper Structure

**What we learned**: `.Files.Get` in Helm templates can only access files within the chart directory.

**Solution**: Copy `grafana-alerts/` directory into `helm/grafana-alerts/` for Helm access.

**Lesson**: Keep source files outside Helm chart, but maintain synced copies inside for `.Files.Get` access.

### 5. ArgoCD ignoreDifferences Must Be Specific

**What we learned**: Broad `ignoreDifferences` on all ConfigMaps prevented alert updates from syncing.

**Solution**: Only ignore the specific Pulumi-managed ConfigMap by name.

**Lesson**: ignoreDifferences should be as narrow as possible to avoid unintended side effects.

---

## Questions?

This is a living document. If you encounter issues not covered here:

1. Check Grafana logs for specific error messages
2. Consult official Grafana documentation
3. Review recent commits for similar changes
4. Update this document with your findings

**Remember**: Every problem you solve should be documented here to help the next developer.

---

**Last Updated**: 2025-11-23  
**Maintainer**: Infrastructure Team  
**Status**: Production
