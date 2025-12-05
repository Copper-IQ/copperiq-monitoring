# Dashboard Fixes - WebSocket Metrics & Let's Encrypt

## Problem Summary

After deploying WebSocket metrics collector code to acceptance, dashboard panels were showing "No data" despite metrics being properly exposed.

### Root Causes Identified

1. **Web pods exposing WebSocket metrics**: `MetricsService` factory was instantiating `WebSocketMetricsCollector` in both web and websocket pods, causing metrics to be scraped from wrong pods
2. **Missing pod filter in queries**: Dashboard queries weren't filtering by `pod=~"websocket-.*"`, so they aggregated metrics from both web and websocket pods
3. **Rate/increase on zero values**: Queries using `rate()` and `increase()` returned empty results when metrics were at 0
4. **Broken Let's Encrypt query**: Complex `count_over_time` query was incorrectly structured

## Solutions Implemented

### Code Changes (content-platform-temp)

#### 1. Fixed MetricsService Factory
**File**: `lib/services/metrics/factory.ts`
- Added conditional WebSocketMetricsCollector instantiation based on `POD_NAME` env var
- Only creates collector if pod name contains "websocket"
- Web pods no longer expose WebSocket metrics

#### 2. Added POD_NAME Environment Variable
**Files**: 
- `helm/templates/web-deployment.yaml`
- `helm/templates/websocket-deployment.yaml`

Added to both deployments:
```yaml
env:
  - name: POD_NAME
    valueFrom:
      fieldRef:
        fieldPath: metadata.name
```

### Dashboard Changes (copperiq-monitoring)

#### 3. Fixed Dashboard Queries
**File**: `helm/dashboards/applications/content-platform.json`
**Script**: `fix-dashboard-queries.js`

Fixed 9 panels:
1. **Active Connections** (ID 43): Added pod filter
2. **Connection Rate** (ID 44): Added pod filter + `or vector(0)`
3. **Disconnection Rate** (ID 45): Added pod filter + `or vector(0)`
4. **Active Rooms** (ID 46): Added pod filter
5. **Redis Message Rate** (ID 47): Added pod filter + `or vector(0)`
6. **Broadcast Rate** (ID 48): Added pod filter + `or vector(0)`
7. **Auth Failures** (ID 49): Added pod filter + `or vector(0)`
8. **Subscription Errors** (ID 50): Added pod filter + `or vector(0)`
9. **Let's Encrypt Quota** (ID 70): Simplified query to fix syntax

#### Query Changes Example

**Before**:
```promql
rate(websocket_connections_established_total{namespace="$namespace"}[5m])
```

**After**:
```promql
rate(websocket_connections_established_total{namespace="$namespace", pod=~"websocket-.*"}[5m]) or vector(0)
```

#### Let's Encrypt Query Fix

**Before** (broken):
```promql
count(count_over_time(certmanager_certificate_ready_status{condition="True", namespace="$namespace"}[7d]) and changes(certmanager_certificate_ready_status{condition="True", namespace="$namespace"}[7d]) > 0)
```

**After**:
```promql
count(changes(certmanager_certificate_ready_status{condition="True", namespace="$namespace"}[7d]) > 0)
```

## Deployment Instructions

### 1. Deploy Code Changes (content-platform-temp)
```bash
cd C:\Users\ChrisBlokland\projects\copperiq\content-platform-temp

# Review changes
git status

# Commit
git add lib/services/metrics/factory.ts
git add helm/templates/web-deployment.yaml
git add helm/templates/websocket-deployment.yaml
git commit -m "fix: only instantiate WebSocketMetricsCollector in websocket pods

- Add POD_NAME env var to web and websocket deployments
- Conditionally create WebSocketMetricsCollector only in websocket pods
- Prevents web pods from exposing empty websocket metrics
- Fixes dashboard queries showing aggregated zero values from multiple pods"

# Push to trigger deployment
git push origin main
```

### 2. Deploy Dashboard Changes (copperiq-monitoring)
```bash
cd C:\Users\ChrisBlokland\projects\copperiq\copperiq-monitoring

# Review changes
git status

# Commit
git add helm/dashboards/applications/content-platform.json
git add fix-dashboard-queries.js
git add DASHBOARD_FIXES.md
git commit -m "fix: websocket and letsencrypt dashboard queries

- Add pod=~\"websocket-.*\" filter to all WebSocket queries
- Add 'or vector(0)' to rate/increase queries to handle zero values
- Fix Let's Encrypt query syntax (remove broken count_over_time)
- Fixes 'No data' issues on WebSocket panels
- Includes fix script for reproducibility"

# Push to trigger ArgoCD sync
git push origin main
```

### 3. Wait for ArgoCD Sync
Monitor ArgoCD dashboard or CLI:
```bash
# Check sync status
argocd app get copperiq-monitoring-accept
argocd app get content-platform-accept

# Force sync if needed
argocd app sync copperiq-monitoring-accept
argocd app sync content-platform-accept
```

## Verification Steps

### 1. Verify Web Pods No Longer Expose WebSocket Metrics
```bash
# Port-forward to web pod
kubectl port-forward -n content-platform-accept deployment/web 3002:3000

# Check metrics (should NOT see any websocket_* metrics)
curl http://localhost:3002/api/metrics | grep websocket
```

Expected: No output (no websocket metrics)

### 2. Verify WebSocket Pods Still Expose Metrics
```bash
# Port-forward to websocket pod
kubectl port-forward -n content-platform-accept deployment/websocket 3003:3001

# Check metrics (should see all 8 websocket_* metrics)
curl http://localhost:3003/api/metrics | grep websocket
```

Expected: 8 metrics visible (connections_total, connections_established_total, etc.)

### 3. Verify Dashboard Panels Show Data
Open Grafana dashboard: `Content Platform > content-platform-accept`

**Expected Results**:
- **Active Connections**: Shows gauge (likely 0)
- **Connection Rate**: Shows timeseries (likely 0 connections/sec)
- **Disconnection Rate**: Shows timeseries (likely 0)
- **Active Rooms**: Shows stat (likely 0)
- **Redis Message Rate**: Shows timeseries (likely 0)
- **Broadcast Rate**: Shows timeseries (likely 0)
- **Auth Failures**: Shows stat (0)
- **Subscription Errors**: Shows timeseries (0)
- **Let's Encrypt Quota**: Shows actual certificate count

**Note**: All values will be 0 initially because no WebSocket connections have been established yet. The important thing is that panels should NOT show "No data" anymore.

### 4. Test Namespace Filter
In Grafana dashboard:
1. Switch `Environment` dropdown from `content-platform-accept` to `content-platform-prod`
2. Verify that panels update to show prod metrics
3. Switch back to `content-platform-accept`

Expected: Panels should correctly filter by namespace

## Files Changed

### content-platform-temp
- `lib/services/metrics/factory.ts` (conditional WebSocketMetricsCollector)
- `helm/templates/web-deployment.yaml` (added POD_NAME env var)
- `helm/templates/websocket-deployment.yaml` (added POD_NAME env var)

### copperiq-monitoring
- `helm/dashboards/applications/content-platform.json` (fixed 9 queries)
- `fix-dashboard-queries.js` (query fix script - for reproducibility)
- `DASHBOARD_FIXES.md` (this document)

## Impact Assessment

### Breaking Changes
- None. All changes are fixes to existing functionality

### Performance Impact
- Minimal: Prometheus will scrape slightly fewer metrics (web pods no longer expose 8 empty WebSocket metrics)
- Dashboard queries are slightly more efficient (pod filter reduces cardinality)

### Risk Level
- **Low**: Changes are isolated to metrics collection and dashboard queries
- No impact on application functionality
- Easy rollback: revert commits and sync ArgoCD

## Rollback Procedure

If issues arise:

```bash
# Rollback content-platform
cd C:\Users\ChrisBlokland\projects\copperiq\content-platform-temp
git revert HEAD
git push origin main

# Rollback copperiq-monitoring
cd C:\Users\ChrisBlokland\projects\copperiq\copperiq-monitoring
git revert HEAD
git push origin main

# Force ArgoCD sync
argocd app sync content-platform-accept --force
argocd app sync copperiq-monitoring-accept --force
```

## Next Steps

After successful deployment and verification:
1. ✅ Test WebSocket functionality manually (connect to a pipeline room)
2. ✅ Verify metrics increment correctly when connections are established
3. ✅ Check alerts fire correctly when thresholds are exceeded
4. ✅ Deploy to production environment (content-platform-prod)
5. ✅ Document any remaining dashboard organization improvements needed
