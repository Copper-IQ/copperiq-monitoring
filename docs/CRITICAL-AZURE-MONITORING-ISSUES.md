# CRITICAL: Azure Monitoring Configuration Issues

**Date**: 2025-11-23  
**Status**: 🔴 CRITICAL - Alerts and dashboards for Azure resources are NOT WORKING

## Problem Summary

The monitoring stack has **non-functional alerts and dashboards** for Azure resources (PostgreSQL, MySQL, AKS API server) because they reference Prometheus metrics that don't exist.

## Root Cause

### What We Have:
- Grafana alerts configured to query Prometheus datasource
- Metric names like:
  - `azure_postgresql_flexible_server_cpu_percent`
  - `azure_mysql_flexible_server_cpu_percent`
  - `azure_mysql_flexible_server_memory_percent`
  - etc.

### The Problem:
- **These metrics don't exist** in our Prometheus instance
- There is **no Azure Monitor exporter** deployed to create these metrics
- Prometheus running in k8s has no way to scrape Azure-managed PaaS services
- Azure Database for PostgreSQL/MySQL metrics are NOT exposed via Prometheus-compatible endpoints

### Why Alerts Appear "Working":
- Grafana shows alerts as "OK" with `noDataState: OK`
- This **hides** the fact that there's no data because "no data" = "not alerting"
- Alerts will **NEVER fire** because the underlying metrics don't exist

## Impact

### Currently Broken:
1. ✅ **PostgreSQL alerts** (9 alerts):
   - High CPU
   - Critical CPU  
   - High memory
   - Storage warnings
   - Connection limits
   - Failed connections
   - Replication lag
   - Backup failures

2. ✅ **MySQL alerts** (6 alerts):
   - High CPU
   - High memory
   - Storage warnings
   - High connections
   - Aborted connections
   - Replication lag

3. ⚠️ **AKS API server alerts** (2 alerts):
   - High latency
   - Error rate
   - These metrics (`apiserver_request_*`) exist BUT require API server metrics to be enabled

### Working Correctly:
- AKS node metrics (CPU, memory) - sourced from node-exporter ✅
- Pod metrics - sourced from kube-state-metrics ✅
- Application metrics (n8n, content-platform, RabbitMQ) ✅

## Azure Monitor Metrics Documentation

### PostgreSQL Flexible Server Metrics

From Azure Monitor docs, actual available metrics:

| Metric Name | Display Name | Unit | Aggregation |
|------------|--------------|------|-------------|
| `cpu_percent` | CPU percent | Percent | Average |
| `memory_percent` | Memory percent | Percent | Average |
| `storage_percent` | Storage percent | Percent | Average |
| `storage_used` | Storage used | Bytes | Average |
| `storage_free` | Storage free | Bytes | Average |
| `active_connections` | Active Connections | Count | Average |
| `connections_failed` | Failed Connections | Count | Total |
| `connections_succeeded` | Successful Connections | Count | Total |
| `maximum_used_transactionIDs` | Maximum Used Transaction IDs | Count | Average |
| `network_bytes_ingress` | Network In | Bytes | Total |
| `network_bytes_egress` | Network Out | Bytes | Total |
| `backup_storage_used` | Backup Storage Used | Bytes | Average |
| `replication_lag` | Replication Lag | Seconds | Maximum |

**Resource Provider**: `Microsoft.DBforPostgreSQL/flexibleServers`

###MySQL Flexible Server Metrics

| Metric Name | Display Name | Unit | Aggregation |
|------------|--------------|------|-------------|
| `cpu_percent` | CPU percent | Percent | Average |
| `memory_percent` | Memory percent | Percent | Average |
| `storage_percent` | Storage percent | Percent | Average |
| `storage_limit` | Storage limit | Bytes | Maximum |
| `storage_used` | Storage used | Bytes | Average |
| `active_connections` | Active Connections | Count | Average |
| `connections_failed` | Total failed connections | Count | Total |
| `aborted_connections` | Aborted Connections | Count | Total |
| `network_bytes_ingress` | Network In | Bytes | Total |
| `network_bytes_egress` | Network Out | Bytes | Total |
| `replication_lag` | Replication lag in seconds | Seconds | Maximum |
| `io_consumption_percent` | IO percent | Percent | Average |

**Resource Provider**: `Microsoft.DBforMySQL/flexibleServers`

### AKS Cluster Metrics

From Container Insights (requires monitoring addon):

| Metric Name | Display Name | Source |
|------------|--------------|--------|
| `node_cpu_usage_percentage` | Node CPU usage % | Container Insights |
| `node_memory_rss_bytes` | Node memory RSS bytes | Container Insights |
| `node_disk_usage_bytes` | Node disk usage bytes | Container Insights |
| `node_network_in_bytes` | Node network in bytes | Container Insights |
| `kube_pod_status_ready` | Pod ready status | kube-state-metrics |
| `kube_pod_container_status_restarts_total` | Container restarts | kube-state-metrics |

**API Server Metrics** (from Kubernetes control plane):
- Available via `apiserver_request_*` metrics IF API server metrics are scraped
- Requires Prometheus ServiceMonitor for kube-apiserver (typically not accessible in AKS managed control plane)
- Alternative: Use Azure Monitor Insights for AKS API server diagnostics

## Solution Options

### Option A: Use Azure Monitor Datasource (RECOMMENDED)

**Pros:**
- Official, supported method
- No additional components
- Direct queries to Azure Monitor API
- Real-time data
- Can query logs AND metrics

**Cons:**
- Requires converting dashboards and alerts to Azure Monitor query format
- Different query language (KQL for logs, Metrics API for metrics)
- May have Azure API rate limits

**Implementation:**
1. Update all Azure resource dashboards to use Azure Monitor datasource (UID: `P1EB995EACC6832D3`)
2. Use Azure Monitor Metrics API queries:
   ```
   Resource: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.DBforPostgreSQL/flexibleServers/{name}
   Metric: cpu_percent
   Aggregation: Average
   ```
3. Update Grafana alerts to use Azure Monitor datasource
4. Test all panels show real data

### Option B: Deploy Azure Monitor Prometheus Exporter

**Pros:**
- Keep existing Prometheus-style queries
- Unified metrics in Prometheus
- Can use existing alert definitions (minor tweaks)

**Cons:**
- Additional component to deploy and maintain
- Adds latency (scrape interval)
- Azure API quotas/rate limits
- Requires Azure credentials management

**Implementation:**
1. Deploy `azure-exporter` (https://github.com/RobustPerception/azure_metrics_exporter) OR
2. Deploy `prometheus-azure-exporter` as DaemonSet/Deployment
3. Configure with Azure service principal
4. Add ServiceMonitor to scrape exporter
5. Update metric names in alerts to match exporter output

## Recommended Action Plan

### Immediate (Today):
1. ✅ Document the issue (this file)
2. Switch to **Option A** (Azure Monitor datasource)
3. Fix PostgreSQL dashboard first (highest priority)
4. Fix MySQL dashboard
5. Fix AKS API server metrics (or remove alerts if metrics unavailable)
6. Update all alerts to use Azure Monitor datasource
7. Test and verify all dashboards show real data

### Follow-up:
1. Add runbooks for Azure resource alerts
2. Document Azure Monitor query patterns for future dashboards
3. Consider enabling AKS diagnostic settings for API server logs
4. Set up Azure Monitor action groups for direct alerting (bypass Grafana)

## Query Examples

### PostgreSQL CPU (Azure Monitor Datasource)

**Dashboard Panel Query**:
```json
{
  "datasource": {
    "type": "grafana-azure-monitor-datasource",
    "uid": "P1EB995EACC6832D3"
  },
  "queryType": "Azure Monitor",
  "azureMonitor": {
    "resourceGroup": "${resource_group}",
    "metricName": "cpu_percent",
    "aggregation": "Average",
    "timeGrain": "PT1M",
    "dimensionFilters": []
  }
}
```

### Alert Query (Grafana Unified Alerting with Azure Monitor):
```yaml
- refId: A
  datasourceUid: P1EB995EACC6832D3
  model:
    queryType: "Azure Monitor"
    azureMonitor:
      resourceGroup: "copperiq-shared-resources"
      resourceName: "copperiq-postgresql-shared"
      metricName: "cpu_percent"
      aggregation: "Average"
```

## Testing Checklist

Before marking as resolved:

- [ ] PostgreSQL dashboard shows CPU, memory, storage, connections
- [ ] MySQL dashboard shows CPU, memory, storage, connections  
- [ ] AKS cluster dashboard shows node metrics AND control plane metrics (or control plane metrics removed if unavailable)
- [ ] PostgreSQL high CPU alert fires when CPU > 80% (test with load)
- [ ] MySQL storage alert fires when storage > 80%
- [ ] All alerts have `datasourceUid: P1EB995EACC6832D3` (Azure Monitor)
- [ ] No "No Data" states in Grafana when Azure resources exist
- [ ] Runbooks updated with Azure Monitor query examples

## Related Files

- `helm/grafana-alerts/azure-postgresql.yaml` - PostgreSQL alerts (BROKEN)
- `helm/grafana-alerts/azure-mysql.yaml` - MySQL alerts (BROKEN)
- `helm/grafana-alerts/aks-cluster.yaml` - AKS alerts (PARTIALLY BROKEN)
- `helm/dashboards/azure-postgresql.json` - PostgreSQL dashboard (NEEDS FIX)
- `helm/dashboards/azure-mysql.json` - MySQL dashboard (NEEDS FIX)
- `helm/dashboards/aks-cluster.json` - AKS dashboard (NEEDS FIX)
- `../shared-hosting-infra/Components/ObservabilityStack.cs` - Azure Monitor datasource configuration (lines 295-353)

## Useful References

- [Azure Monitor supported metrics](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/metrics-supported)
- [Grafana Azure Monitor datasource docs](https://grafana.com/docs/grafana/latest/datasources/azuremonitor/)
- [Azure Monitor Metrics API](https://learn.microsoft.com/en-us/rest/api/monitor/metrics/list)
- [PostgreSQL Flexible Server metrics](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-monitoring)
- [MySQL Flexible Server metrics](https://learn.microsoft.com/en-us/azure/mysql/flexible-server/concepts-monitoring)
