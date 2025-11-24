# Dashboard Organization & ArgoCD Sync Fix

## Overview

Fixed two issues:
1. **Organized Grafana dashboards into folders** matching alert structure
2. **Fixed domain-controller ArgoCD OutOfSync issue** by correcting Helm chart

## 1. Dashboard Organization

### Changes Made

All dashboards now organized into folders matching the alert structure:

#### Infrastructure Folder (uid: `infrastructure`)
- `aks-cluster.json` - AKS Cluster monitoring
- `infrastructure-overview.json` - Infrastructure Overview dashboard

#### Applications Folder (uid: `applications`)
- `argocd.json` - ArgoCD GitOps monitoring
- `cert-manager.json` - Certificate management
- `content-platform.json` - Content Platform monitoring
- `rabbitmq.json` - RabbitMQ message queue

#### Databases Folder (uid: `databases`)
- `azure-mysql.json` - Azure MySQL (Risers App)
- `azure-postgresql.json` - Azure PostgreSQL

### Implementation

Added `folderUid` property to each dashboard JSON:
```json
{
  "title": "AKS Cluster",
  "folderUid": "infrastructure",
  ...
}
```

Grafana automatically places dashboards in correct folders based on this property.

### Folder Structure

```
Grafana Dashboards/
├── CopperIQ/  (root - legacy, now empty)
│
├── Infrastructure/
│   ├── AKS Cluster
│   └── Infrastructure Overview
│
├── Applications/
│   ├── ArgoCD
│   ├── Cert-Manager
│   ├── Content Platform
│   └── RabbitMQ
│
└── Databases/
    ├── Azure MySQL (Risers App)
    └── Azure PostgreSQL
```

This matches the alert folder structure:
- `helm/grafana-alerts/folders.yaml` defines: `infrastructure`, `applications`, `databases`
- Alerts are organized in these folders
- Dashboards now match this organization

## 2. ArgoCD Domain-Controller OutOfSync Fix

### Problem

The `content-platform-domain-controller-accept` and `content-platform-domain-controller-prod` apps were perpetually showing `OutOfSync` status in ArgoCD, even though they were healthy and functional.

### Root Cause

The Helm chart was incorrectly merging **pod-level** and **container-level** `securityContext` fields:

```yaml
# INCORRECT - All fields at pod level
spec:
  securityContext:
    runAsNonRoot: true      # ✅ Pod-level
    runAsUser: 65532        # ✅ Pod-level
    fsGroup: 65532          # ✅ Pod-level
    allowPrivilegeEscalation: false  # ❌ Container-level!
    capabilities:                    # ❌ Container-level!
      drop: [ALL]
    readOnlyRootFilesystem: true    # ❌ Container-level!
```

Kubernetes API server would normalize this by moving container-level fields to the container securityContext, causing ArgoCD to detect drift between desired state (all fields at pod level) and live state (split correctly).

### Solution

Split `values.yaml` into two separate contexts:

```yaml
# Pod-level security context
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 65532
  fsGroup: 65532

# Container-level security context
containerSecurityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: true
```

Updated `deployment.yaml` to reference both:

```yaml
spec:
  template:
    spec:
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
        - name: controller
          securityContext:
            {{- toYaml .Values.containerSecurityContext | nindent 12 }}
```

### Kubernetes Security Context Levels

| Level | Fields |
|-------|--------|
| **Pod-level** `.spec.template.spec.securityContext` | `runAsUser`, `runAsGroup`, `runAsNonRoot`, `fsGroup`, `fsGroupChangePolicy`, `seccompProfile`, `seLinuxOptions`, `supplementalGroups`, `sysctls`, `windowsOptions` |
| **Container-level** `.spec.template.spec.containers[].securityContext` | `allowPrivilegeEscalation`, `capabilities`, `privileged`, `procMount`, `readOnlyRootFilesystem`, `runAsUser`, `runAsGroup`, `runAsNonRoot`, `seLinuxOptions`, `seccompProfile`, `windowsOptions` |

Note: Some fields (like `runAsUser`, `runAsNonRoot`) can be set at both levels. Container-level values override pod-level values.

### Changes Made

**Repository:** `content-platform-domain-controller`
- Modified `helm/values.yaml` - Split `securityContext` → `podSecurityContext` + `containerSecurityContext`
- Modified `helm/templates/deployment.yaml` - Reference both contexts correctly

**Repository:** `app-of-apps`
- Removed `ignoreDifferences` workaround for `securityContext` (no longer needed)

**Repository:** `copperiq-monitoring`
- Restored `ArgoCDAppNotSynced` alert to monitor all apps (removed domain-controller exclusion)

### Verification

```bash
kubectl get applications -n argocd | grep domain-controller
```

Result:
```
content-platform-domain-controller-accept   Synced    Healthy
content-platform-domain-controller-prod     Synced    Healthy
```

✅ Both apps now show as **Synced** and **Healthy**!

## Benefits

### Dashboard Organization
- **Improved UX**: Dashboards grouped by category like alerts
- **Easier navigation**: Clear folder hierarchy
- **Consistency**: Matching alert and dashboard organization
- **Scalability**: Easy to add new dashboards to correct folders

### ArgoCD Fix
- **Eliminated false positives**: No more OutOfSync alerts for healthy apps
- **Correct monitoring**: ArgoCD now properly tracks all apps including domain-controller
- **Proper Kubernetes API usage**: Follows best practices for securityContext
- **No workarounds**: Clean solution without ignoreDifferences hacks

## Related Files

### Dashboard Organization
- `copperiq-monitoring/organize-dashboards.ps1` - Script to add folderUid to dashboards
- `copperiq-monitoring/helm/dashboards/*.json` - All dashboard files updated
- `copperiq-monitoring/helm/grafana-alerts/folders.yaml` - Folder definitions

### ArgoCD Fix
- `content-platform-domain-controller/helm/values.yaml` - Split securityContext
- `content-platform-domain-controller/helm/templates/deployment.yaml` - Reference both contexts
- `app-of-apps/templates/apps.yaml` - Removed ignoreDifferences workaround
- `copperiq-monitoring/helm/grafana-alerts/argocd.yaml` - Restored full monitoring

## Commits

### Dashboard Organization
- `copperiq-monitoring`: `013ce74` - feat: Organize dashboards into folders matching alert structure

### ArgoCD Fix
- `content-platform-domain-controller`: `2dc79ca` - fix: Split securityContext into pod and container levels
- `app-of-apps`: `49cafad` - refactor: Remove securityContext ignoreDifferences workaround
- `copperiq-monitoring`: `f0853ee` - refactor: Re-enable domain-controller monitoring in ArgoCD alert
