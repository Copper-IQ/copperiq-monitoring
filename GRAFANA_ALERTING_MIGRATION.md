# Grafana Unified Alerting Migration Guide

## Executive Summary

**Decision**: Migrate from Prometheus-managed alerting to Grafana Unified Alerting.

**Reason**: Need to alert on Azure Monitor metrics (PostgreSQL, MySQL, AKS control plane) in addition to Prometheus metrics. Prometheus can only evaluate PromQL queries against its own data store.

**Status**: ✅ Architecture migrated, 3/57 alerts converted (demo complete, remaining alerts follow same pattern)

---

## What Changed

### Old Architecture (Prometheus-Managed)
```
PrometheusRule CRDs → Prometheus Operator → Prometheus evaluates → Prometheus Alertmanager → Slack
```

**Limitations**:
- ❌ Only queries Prometheus datasource
- ❌ Cannot alert on Azure Monitor metrics
- ❌ Separate Alertmanager config in kube-prometheus-stack
- ❌ PrometheusRule CRDs tightly coupled to Prometheus

### New Architecture (Grafana Unified Alerting)
```
Grafana Alert Rules (provisioned) → Grafana evaluates → Grafana Alertmanager → Slack
```

**Benefits**:
- ✅ Queries ANY datasource (Prometheus, Azure Monitor, Loki, etc.)
- ✅ Single Alertmanager for all alerts
- ✅ Centralized alert management in Grafana UI
- ✅ Advanced features: recording rules, silences, inhibition rules

---

## Changes Made

### 1. ObservabilityStack.cs

**Added Prometheus datasource configuration**:
```csharp
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus-kube-prometheus-prometheus.observability:9090
    isDefault: true
    jsonData:
      timeInterval: 30s
      manageAlerts: true  // KEY: Enables Grafana to manage alerts
```

**Enabled Grafana Unified Alerting**:
```csharp
sidecar:
  alerts:
    enabled: true
    label: grafana_alert
    folder: /etc/grafana/provisioning/alerting
    searchNamespace: ALL

grafana.ini:
  unified_alerting:
    enabled: true  // Enable Grafana Unified Alerting
  alerting:
    enabled: false  // Disable legacy Grafana alerting
```

**Removed**: Prometheus Alertmanager receivers config (moved to Grafana contact points)

### 2. copperiq-monitoring Repo

**Created**:
- `grafana-alerts/` directory (replacing `alerts/` PrometheusRule CRDs)
- `grafana-alerts/folders.yaml` - 3 alert folders (infrastructure, applications, databases)
- `grafana-alerts/contact-points.yaml` - Slack webhook configuration
- `grafana-alerts/notification-policies.yaml` - Alert routing rules
- `grafana-alerts/node-disk-space.yaml` - Example converted alert (3 alerts)
- `grafana-alerts/README.md` - Comprehensive migration guide
- `convert-alerts.py` - Python script to automate remaining conversions

**Updated**:
- `helm/templates/grafana-alerts.yaml` - New ConfigMap for alert provisioning (replaces `prometheusrules.yaml`)

**Deleted**:
- `helm/templates/prometheusrules.yaml` - No longer needed (Grafana manages alerts now)

### 3. Alert Conversion Pattern

**PrometheusRule format**:
```yaml
- alert: NodeDiskSpaceWarning
  expr: |
    (node_filesystem_avail_bytes{mountpoint="/"} / 
     node_filesystem_size_bytes{mountpoint="/"}) < 0.25
  for: 5m
```

**Grafana format** (3-stage query):
```yaml
- uid: node-disk-warning
  title: NodeDiskSpaceWarning
  condition: C  # References stage C
  for: 5m
  data:
    - refId: A  # Query Prometheus
      datasourceUid: prometheus
      model:
        expr: (node_filesystem_avail_bytes{mountpoint="/"} / 
               node_filesystem_size_bytes{mountpoint="/"})
    
    - refId: B  # Reduce time series to single value
      datasourceUid: __expr__
      model:
        type: reduce
        expression: A
        reducer: last
    
    - refId: C  # Evaluate threshold
      datasourceUid: __expr__
      model:
        type: math
        expression: $B < 0.25  # ALERT WHEN TRUE
```

---

## Migration Status

| Component | Status | Notes |
|-----------|--------|-------|
| ObservabilityStack.cs | ✅ Complete | Datasource + alerting config added |
| Helm chart | ✅ Complete | grafana-alerts.yaml template created |
| Alert folders | ✅ Complete | 3 folders defined |
| Contact points | ✅ Complete | Slack webhooks (need real URLs) |
| Notification policies | ✅ Complete | Routing by severity |
| Alert conversion | 🟡 In Progress | 3/57 alerts (demo complete) |

**Remaining work**: Convert 54 alerts using established pattern (see `grafana-alerts/README.md`)

---

## Deployment Steps

### Prerequisites

1. **Slack webhooks** - Replace placeholders:
   ```bash
   # In grafana-alerts/contact-points.yaml
   SLACK_WEBHOOK_URL_ALERTS → https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   SLACK_WEBHOOK_URL_MONITORING → https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

2. **Azure service principal** - Replace placeholders in ObservabilityStack.cs:
   ```csharp
   AZURE_SUBSCRIPTION_ID → <your-subscription-id>
   AZURE_CLIENT_ID → <service-principal-client-id>
   AZURE_CLIENT_SECRET → <service-principal-secret>
   ```

3. **Clean git state** - Commit all changes before deployment

### Step 1: Convert Remaining Alerts

**Option A: Manual conversion** (use node-disk-space.yaml as template)
```bash
cd copperiq-monitoring/grafana-alerts
cp node-disk-space.yaml aks-cluster.yaml
# Edit aks-cluster.yaml following the pattern
```

**Option B: Automated conversion** (requires Python/Node)
```bash
cd copperiq-monitoring
python convert-alerts.py  # Converts all 10 files
```

### Step 2: Deploy to GitHub

```bash
cd copperiq-monitoring
git add grafana-alerts/ helm/templates/grafana-alerts.yaml
git rm helm/templates/prometheusrules.yaml
git commit -m "feat: migrate to Grafana Unified Alerting"
git push origin main
```

### Step 3: Deploy Infrastructure Changes

```bash
cd shared-hosting-infra
# Review changes
git diff Components/ObservabilityStack.cs

# Deploy via Pulumi
pulumi up -s accept-prod
```

**Expected changes**:
- Update kube-prometheus-stack Helm release (Grafana config changes)
- Grafana pod will restart with new configuration

### Step 4: Add copperiq-monitoring to ArgoCD

```bash
cd app-of-apps
# Add copperiq-monitoring application to ArgoCD config
# (follow existing pattern for other apps)
argocd app sync copperiq-monitoring
```

**Expected**:
- ConfigMap `copperiq-monitoring-grafana-alerts` created in `observability` namespace
- Grafana sidecar detects ConfigMap and provisions alerts
- Check Grafana UI → Alerting → Alert Rules

### Step 5: Verify Alert Provisioning

```bash
# Check Grafana logs
kubectl logs -n observability deployment/prometheus-grafana -c grafana | grep -i "alert\|provision"

# Expected output:
# "Provisioning alerting from configuration"
# "Provisioned 3 alert rules in folder 'infrastructure'"
```

**In Grafana UI**:
1. Navigate to **Alerting → Alert Rules**
2. Should see folders: infrastructure, applications, databases
3. Check alert state: Normal (green)
4. Click alert → "Edit" → "Preview" to test query

### Step 6: Test Alert Firing

**Option A: Simulate disk pressure** (safe, reversible):
```bash
# Create test pod with disk fill
kubectl run disk-test --image=busybox --restart=Never -- \
  sh -c "dd if=/dev/zero of=/tmp/fill bs=1M count=5000 && sleep 3600"

# Wait 5 minutes for alert to fire
# Check Grafana UI and #alerts channel

# Cleanup
kubectl delete pod disk-test
```

**Option B: Lower threshold temporarily** (edit alert in Grafana UI):
1. Alerting → Alert Rules → NodeDiskSpaceWarning → Edit
2. Change threshold: `$B < 0.25` → `$B < 0.95`
3. Save
4. Wait ~1 minute - alert should fire
5. Revert threshold

### Step 7: Validate Slack Notifications

- Critical/warning alerts → #alerts channel
- Info alerts → #monitoring channel
- Verify message formatting (summary, description, namespace)

---

## Rollback Plan

If Grafana Unified Alerting causes issues:

### 1. Revert ObservabilityStack.cs
```bash
cd shared-hosting-infra
git revert <commit-hash>
pulumi up -s accept-prod
```

### 2. Re-enable PrometheusRules
```bash
cd copperiq-monitoring
git revert <commit-hash>  # Restores helm/templates/prometheusrules.yaml
git push
```

### 3. Disable Grafana alerting
```csharp
// In ObservabilityStack.cs
grafana.ini:
  unified_alerting:
    enabled: false
  alerting:
    enabled: false  // Keep legacy alerting disabled

datasources:
  - name: Prometheus
    jsonData:
      manageAlerts: false  // Let Prometheus manage alerts
```

**Result**: Back to Prometheus-managed alerting (PrometheusRule CRDs).

---

## Troubleshooting

### Alert Not Firing

**Symptom**: Alert shows "Normal" but should be "Alerting"

**Diagnosis**:
1. Edit alert in Grafana UI
2. Check "Query and Conditions" tab
3. Click "Preview" - does query return data?

**Common causes**:
- PromQL syntax error (missing metric)
- Threshold too high/low
- `for` duration not elapsed yet

### Alert Provisioning Failed

**Symptom**: Alerts not visible in Grafana UI

**Check**:
```bash
# Grafana logs
kubectl logs -n observability deployment/prometheus-grafana -c grafana --tail=200

# ConfigMap exists?
kubectl get configmap -n observability copperiq-monitoring-grafana-alerts

# Sidecar logs
kubectl logs -n observability deployment/prometheus-grafana -c grafana-sc-alerts
```

**Common causes**:
- YAML syntax error in alert file
- Missing folder definition in `folders.yaml`
- ConfigMap label `grafana_alert: "1"` missing

### No Slack Notifications

**Check**:
1. Grafana UI → Alerting → Contact Points
2. Test contact point: Click "Test" button
3. Verify webhook URL is correct

**Common causes**:
- Webhook URL placeholder not replaced
- Slack incoming webhooks disabled
- Network policy blocking egress

---

## Next Steps

1. ✅ Complete alert conversion (54 remaining)
2. ✅ Replace Slack webhook placeholders
3. ✅ Replace Azure Monitor placeholders
4. ✅ Deploy to accept-prod
5. ✅ Test alert firing + Slack notifications
6. ⏭️ Create runbooks for critical alerts
7. ⏭️ Tune alert thresholds after 24h observation

---

## References

- [Grafana Unified Alerting Docs](https://grafana.com/docs/grafana/latest/alerting/unified-alerting/)
- [Alert Provisioning Format](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/)
- [Migration from Prometheus](https://grafana.com/blog/2021/03/10/how-to-migrate-from-prometheus-to-grafana-alerting/)
- `grafana-alerts/README.md` - Detailed conversion guide
