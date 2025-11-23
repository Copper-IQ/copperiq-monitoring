# NodeDiskSpaceCritical Runbook

## Alert Description

**Alert Name:** NodeDiskSpaceCritical  
**Severity:** Critical  
**Threshold:** Node disk usage > 90%  
**Evaluation:** Every 1 minute

This alert fires when a Kubernetes node's disk space usage exceeds 90%, indicating imminent disk exhaustion that could cause pod evictions, application failures, and cluster instability.

## Impact

- **High:** Pod evictions may begin, causing service disruptions
- **Cluster Stability:** Node may become unschedulable
- **Data Loss Risk:** Pods unable to write logs or data
- **Cascading Failures:** Can trigger other alerts (pods crashing, applications failing)

## Immediate Actions (Within 5 Minutes)

### 1. Identify the Affected Node

```bash
# Check alert details for node name
kubectl get nodes -o custom-columns=NAME:.metadata.name,DISK:.status.allocatable.ephemeral-storage,USED:.status.capacity.ephemeral-storage

# Get detailed node disk usage
kubectl describe node <node-name> | grep -A 5 "Allocated resources"
```

### 2. Check Disk Usage Breakdown

```powershell
# SSH into the node (if using AKS)
az aks command invoke --resource-group <rg> --name <cluster> --command "df -h"

# Or use crictl on the node
kubectl debug node/<node-name> -it --image=mcr.microsoft.com/dotnet/runtime-deps:6.0
# Then inside the debug pod:
chroot /host
df -h
du -sh /var/lib/* | sort -h
```

### 3. Quick Wins - Clear Obvious Space Hogs

```bash
# Check for large log files
find /var/log -type f -size +100M -exec ls -lh {} \;

# Check Docker/containerd image cache
crictl images | wc -l  # Count images
crictl rmi --prune     # Remove unused images

# Check for unused container layers
crictl ps -a | grep Exited | wc -l
crictl rm $(crictl ps -a -q --state=Exited)  # Remove exited containers
```

## Root Cause Investigation

### Common Causes

1. **Container Image Buildup** (Most Common)
   - Multiple image versions not cleaned up
   - Large base images accumulating
   
2. **Application Logs**
   - Pods writing excessive logs to ephemeral storage
   - Missing log rotation configuration
   
3. **Failed Pod Artifacts**
   - Evicted pods leaving behind data
   - Incomplete pod cleanup
   
4. **Persistent Volume Issues**
   - PV mounted to node but not cleaned up
   - Temporary volume expansion attempts

### Detailed Investigation Commands

```bash
# Find top 20 largest directories
du -hx /var/lib/docker 2>/dev/null | sort -rh | head -20
du -hx /var/lib/containerd 2>/dev/null | sort -rh | head -20
du -hx /var/log 2>/dev/null | sort -rh | head -20

# Check for specific container consuming space
crictl ps -a --no-trunc
for container in $(crictl ps -aq); do
  echo "Container: $container"
  crictl inspect $container | jq '.info.runtimeSpec.linux.resources.blockIO'
done

# Check pod disk usage
kubectl get pods --all-namespaces -o wide | grep <node-name>
kubectl top pod --all-namespaces --use-protocol-buffers
```

## Resolution Procedures

### Option 1: Clean Up Container Images (Safest)

```bash
# Remove unused images
crictl rmi --prune

# Or more aggressively remove all unused images
crictl images -q | xargs -I {} crictl rmi {} 2>/dev/null || true
```

### Option 2: Rotate/Clear Application Logs

```bash
# Find pods with large logs
kubectl get pods --all-namespaces -o wide --field-selector spec.nodeName=<node-name>

# For specific pod with log issues
kubectl logs <pod-name> -n <namespace> --tail=100  # Check if excessive logging
kubectl delete pod <pod-name> -n <namespace>  # Restart to clear logs
```

### Option 3: Evict and Drain Node (If Above Fails)

```bash
# Cordon the node to prevent new pods
kubectl cordon <node-name>

# Evict all pods gracefully
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Clean up manually on the node
# ... perform cleanup ...

# Uncordon when space is recovered
kubectl uncordon <node-name>
```

### Option 4: Scale Up Node Pool (Last Resort)

```bash
# Add a new node to the pool
az aks nodepool scale --resource-group <rg> --cluster-name <cluster> --name <nodepool> --node-count <current+1>

# After new node is ready, drain the full node
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data --force

# Remove the problematic node
az aks nodepool scale --resource-group <rg> --cluster-name <cluster> --name <nodepool> --node-count <current>
```

## Prevention

### Automated Cleanup Configuration

Ensure the cluster has these features enabled:

1. **Image Garbage Collection**
   ```yaml
   # Check kubelet configuration
   kubectl get --raw /api/v1/nodes/<node-name>/proxy/configz | jq '.kubeletconfig.imageGCHighThresholdPercent'
   # Should be 85 (triggers cleanup at 85% disk usage)
   ```

2. **Pod Eviction Thresholds**
   ```yaml
   # Check eviction settings
   kubectl get --raw /api/v1/nodes/<node-name>/proxy/configz | jq '.kubeletconfig.evictionHard'
   # Should include "nodefs.available": "10%"
   ```

3. **Image Cleanup CronJob** (Already deployed at `kube-system/image-cleanup`)
   ```bash
   kubectl get cronjob -n kube-system image-cleanup
   # Should run weekly on Sunday at 2 AM
   ```

### Application-Level Fixes

1. Configure log rotation in application Helm charts
2. Use stdout/stderr for logging (not files in containers)
3. Set resource limits on pods to prevent runaway disk usage
4. Use smaller base images (alpine, distroless)

## Escalation

### When to Escalate

- Disk usage > 95% and cleanup isn't working within 10 minutes
- Multiple nodes affected simultaneously
- Production workloads are being evicted
- Cannot SSH/access the affected node

### Escalation Path

1. **L1 → L2:** If cleanup doesn't free >10% within 15 minutes
2. **L2 → Platform Team Lead:** If node drain is required during business hours
3. **Platform Team Lead → CTO:** If production data loss occurs

### Contact Information

- **Slack:** #infra-alerts (for real-time updates)
- **On-Call:** Check PagerDuty rotation
- **Platform Team Lead:** [Add contact]

## Post-Incident

### Follow-Up Actions

1. **Root Cause Analysis**
   - Document what filled the disk
   - Identify if application change caused it
   - Check if similar pattern on other nodes

2. **Update Alert Thresholds**
   - If false positives, adjust warning threshold
   - Consider adding predictive alerts (growth rate)

3. **Infrastructure Changes**
   - Evaluate need for larger node disk sizes
   - Review image retention policies
   - Audit application logging practices

### Documentation

- Update this runbook with lessons learned
- Create post-mortem in docs/incidents/
- Share findings in platform team meeting

## Related Alerts

- **NodeDiskSpaceWarning** (80% usage) - Earlier warning
- **AKSPodsStuckPending** - May fire if node is unschedulable
- **AKSPodRestartingFrequently** - May fire if pods evicted

## Additional Resources

- [Kubernetes Disk Pressure](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/)
- [AKS Node Maintenance](https://learn.microsoft.com/en-us/azure/aks/node-updates-maintenance)
- [Crictl Documentation](https://github.com/kubernetes-sigs/cri-tools/blob/master/docs/crictl.md)
