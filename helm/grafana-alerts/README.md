# Grafana Unified Alerting - Migration Guide

## Overview

This directory contains alert rules in **Grafana Unified Alerting** format, converted from the original PrometheusRule CRDs in `../alerts/`.

## Why Grafana Unified Alerting?

We switched from Prometheus-managed alerting to Grafana Unified Alerting because:

1. **Multi-datasource alerts**: Can alert on Azure Monitor metrics (PostgreSQL, MySQL, AKS) AND Prometheus
2. **Unified routing**: Single Alertmanager for all alerts
3. **Centralized management**: All alerts managed through Grafana UI
4. **Advanced features**: Recording rules, silences, alert groups

## Architecture

**Old (Prometheus-managed)**:
```
PrometheusRule CRDs → Prometheus Operator → Prometheus evaluates → Prometheus Alertmanager → Slack
```

**New (Grafana Unified Alerting)**:
```
Grafana Alert Rules (provisioned) → Grafana evaluates → Grafana Alertmanager → Slack
```

## File Structure

```
grafana-alerts/
├── README.md                    # This file
├── folders.yaml                 # Alert folder definitions
├── node-disk-space.yaml         # Infrastructure: Disk alerts
├── aks-cluster.yaml             # Infrastructure: Cluster alerts
├── content-platform-queues.yaml # Applications: Queue backlog alerts
├── rabbitmq.yaml                # Applications: RabbitMQ alerts
├── n8n.yaml                     # Applications: n8n alerts
├── argocd.yaml                  # Applications: ArgoCD alerts
├── cert-manager.yaml            # Applications: Cert-Manager alerts
├── external-dns.yaml            # Applications: External-DNS alerts
├── azure-postgresql.yaml        # Databases: PostgreSQL alerts
└── azure-mysql.yaml             # Databases: MySQL alerts
```

## Conversion Pattern

### PrometheusRule Format
```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
spec:
  groups:
    - name: example-group
      interval: 30s
      rules:
        - alert: ExampleAlert
          expr: metric > 0.9
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Problem detected"
```

### Grafana Format
```yaml
apiVersion: 1
groups:
  - orgId: 1
    name: example-group
    folder: infrastructure  # NEW: folder organization
    interval: 30s
    rules:
      - uid: example-alert  # NEW: unique identifier
        title: ExampleAlert
        condition: C  # NEW: references threshold query
        for: 5m
        noDataState: OK
        execErrState: Alerting
        labels:
          severity: warning
        annotations:
          summary: "Problem detected"
        data:  # NEW: multi-stage query structure
          - refId: A  # Prometheus query
            datasourceUid: prometheus
            model:
              expr: metric
          - refId: B  # Reduce to single value
            datasourceUid: __expr__
            model:
              type: reduce
              expression: A
              reducer: last
          - refId: C  # Threshold math
            datasourceUid: __expr__
            model:
              type: math
              expression: $B > 0.9
```

### Key Differences

| PrometheusRule | Grafana Unified Alerting |
|----------------|--------------------------|
| `expr: metric > 0.9` | Split into 3 queries: A (metric), B (reduce), C (threshold) |
| Alert name only | `uid` + `title` |
| No folder | `folder` organizes alerts |
| Implicit datasource | Explicit `datasourceUid` |
| `for: 5m` | Same: `for: 5m` |
| `noDataState`, `execErrState` | Explicit error handling |

## Alert Folders

Three folders for organization:

- **infrastructure**: AKS cluster, nodes, disk, networking
- **applications**: n8n, RabbitMQ, ArgoCD, Cert-Manager, External-DNS
- **databases**: Azure PostgreSQL, Azure MySQL

## Datasources

Alerts query two datasources:

1. **Prometheus** (`prometheus`): K8s metrics from Prometheus
   - Configured in ObservabilityStack.cs with `manageAlerts: true`
   - URL: `http://prometheus-kube-prometheus-prometheus.observability:9090`

2. **Azure Monitor** (`azuremonitor`): Azure managed service metrics
   - Configured with service principal credentials
   - Used for PostgreSQL, MySQL, AKS control plane metrics

## Query Structure

Grafana alerts use a **3-stage query pipeline**:

### Stage A: Query Datasource
```yaml
- refId: A
  datasourceUid: prometheus  # or azuremonitor
  model:
    expr: node_filesystem_avail_bytes / node_filesystem_size_bytes
```

Fetches time series data from Prometheus or Azure Monitor.

### Stage B: Reduce to Single Value
```yaml
- refId: B
  datasourceUid: __expr__  # Expression datasource
  model:
    type: reduce
    expression: A
    reducer: last  # or min, max, mean, sum
```

Reduces time series to single value (last, min, max, average).

### Stage C: Threshold Condition
```yaml
- refId: C
  datasourceUid: __expr__
  model:
    type: math
    expression: $B < 0.25  # Threshold condition
```

Evaluates threshold - alert fires when true.

The `condition: C` field tells Grafana which query stage to use as the alert condition.

## Provisioning

These files are provisioned via Helm chart:

```yaml
# helm/templates/grafana-alerts.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-alert-provisioning
data:
  folders.yaml: |
    {{ .Files.Get "grafana-alerts/folders.yaml" | indent 4 }}
  node-disk-space.yaml: |
    {{ .Files.Get "grafana-alerts/node-disk-space.yaml" | indent 4 }}
  # ... other files
```

Mounted to Grafana at `/etc/grafana/provisioning/alerting/`.

## Notification Routing

Alerts route to Slack channels based on severity:

- **#alerts**: `severity: critical` or `severity: warning`
- **#monitoring**: Informational alerts

Configured via Grafana contact points and notification policies (in ObservabilityStack.cs).

## Testing Alerts

### 1. Verify Provisioning
```bash
# Check Grafana logs for provisioning errors
kubectl logs -n observability deployment/prometheus-grafana | grep -i "alert\|provision"
```

### 2. View in Grafana UI
1. Navigate to **Alerting → Alert Rules**
2. Filter by folder: infrastructure, applications, databases
3. Check alert state: Normal, Pending, Alerting

### 3. Test Alert Firing
```bash
# Simulate high disk usage (DO NOT RUN IN PROD)
kubectl run disk-fill --image=busybox --restart=Never -- \
  sh -c "dd if=/dev/zero of=/tmp/fill bs=1M count=10000"
```

### 4. Verify Slack Notifications
Check #alerts or #monitoring channels for test alerts.

## Troubleshooting

### Alert Not Firing

1. **Check query results**:
   - Go to Grafana → Alerting → Alert Rules → [Your Alert]
   - Click "Edit" → Scroll to "Query and Conditions"
   - Click "Preview" to see query results

2. **Check datasource**:
   ```bash
   # For Prometheus
   kubectl port-forward -n observability svc/prometheus-kube-prometheus-prometheus 9090:9090
   # Open http://localhost:9090 and test PromQL query
   ```

3. **Check Grafana evaluation**:
   - Grafana evaluates alerts every `interval` (default 30s)
   - Alert must be true for `for` duration before firing
   - Check **Alerting → Alert Rules → [Alert] → State History**

### Alert Provisioning Failed

1. **Check YAML syntax**:
   ```bash
   # Validate YAML
   yamllint grafana-alerts/*.yaml
   ```

2. **Check Grafana logs**:
   ```bash
   kubectl logs -n observability deployment/prometheus-grafana --tail=200 | grep -i error
   ```

3. **Check folder exists**:
   - Folders must be defined in `folders.yaml` before alerts reference them

### No Slack Notifications

1. **Check contact points**: Grafana → Alerting → Contact Points
2. **Check notification policies**: Grafana → Alerting → Notification Policies
3. **Test webhook**: `curl -X POST <SLACK_WEBHOOK_URL> -d '{"text":"Test"}'`

## Converting Additional Alerts

To convert a PrometheusRule to Grafana format:

1. **Copy template** from existing converted alert
2. **Extract PromQL** from `expr` field
3. **Split into 3 queries**:
   - A: PromQL query (remove comparison operator)
   - B: Reduce A to single value
   - C: Math expression with threshold
4. **Set condition**: `condition: C`
5. **Generate UID**: lowercase, alphanumeric + hyphens, max 40 chars
6. **Choose folder**: infrastructure, applications, or databases
7. **Test in Grafana UI** before committing

## Migration Status

| File | Status | Alerts | Notes |
|------|--------|--------|-------|
| folders.yaml | ✅ Complete | N/A | 3 folders defined |
| node-disk-space.yaml | ✅ Complete | 3 alerts | Manual conversion |
| content-platform-queues.yaml | 🔄 TODO | 6 alerts | - |
| aks-cluster.yaml | 🔄 TODO | 7 alerts | - |
| rabbitmq.yaml | 🔄 TODO | 6 alerts | - |
| n8n.yaml | 🔄 TODO | 6 alerts | - |
| argocd.yaml | 🔄 TODO | 5 alerts | - |
| cert-manager.yaml | 🔄 TODO | 5 alerts | - |
| external-dns.yaml | 🔄 TODO | 3 alerts | - |
| azure-postgresql.yaml | 🔄 TODO | 10 alerts | Azure Monitor datasource |
| azure-mysql.yaml | 🔄 TODO | 6 alerts | Azure Monitor datasource |

**Total**: 1/10 files complete, 3/57 alerts converted

## References

- [Grafana Unified Alerting Docs](https://grafana.com/docs/grafana/latest/alerting/unified-alerting/)
- [Alert Provisioning Format](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/)
- [PromQL to Grafana Query Migration](https://grafana.com/blog/2021/03/10/how-to-migrate-from-prometheus-to-grafana-alerting/)
