# Alert Runbooks Index

This directory contains operational runbooks for responding to alerts in the CopperIQ monitoring system.

## Quick Reference

| Alert Name | Severity | Runbook | Est. Resolution Time | Auto-Resolve? |
|------------|----------|---------|---------------------|---------------|
| **Infrastructure Alerts** |
| NodeDiskSpaceCritical | 🔴 Critical | [node-disk-space-critical.md](./node-disk-space-critical.md) | 10-30 min | No |
| NodeDiskSpaceWarning | 🟡 Warning | See critical runbook | 30-60 min | No |
| AKSPodRestartingFrequently | 🟡 Warning | TBD | 15-45 min | Sometimes |
| AKSPodsStuckPending | 🟠 Warning | TBD | 10-20 min | Sometimes |
| AKSAPIServerErrors | 🔴 Critical | TBD | 5-15 min | Yes |
| AKSNodeNotReady | 🔴 Critical | TBD | 15-45 min | Sometimes |
| **Application Alerts** |
| ContentPlatformQueueBacklog | 🟡 Warning | [content-platform-queue-backlog.md](./content-platform-queue-backlog.md) | 10-30 min | Yes |
| N8NWorkflowExecutionsFailing | 🟠 Warning | TBD | 15-30 min | No |
| RabbitMQHighMemoryUsage | 🟠 Warning | TBD | 10-20 min | Sometimes |
| ArgoCDApplicationDegraded | 🟡 Warning | TBD | 5-15 min | Yes |
| CertManagerCertificateExpiring | 🟠 Warning | TBD | 1-7 days | No |
| **Database Alerts** |
| AzurePostgreSQLHighCPU | 🟠 Warning | TBD | 15-45 min | Sometimes |
| AzurePostgreSQLStorageCritical | 🔴 Critical | TBD | 30-120 min | No |
| AzureMySQLConnectionFailures | 🔴 Critical | TBD | 10-30 min | Sometimes |

**Legend:**
- 🔴 Critical: Immediate action required, production impact
- 🟠 Warning (High): Action required soon, potential impact
- 🟡 Warning: Monitor closely, may self-resolve

## Escalation Matrix

### Response Time SLAs

| Severity | Acknowledgment | Initial Response | Resolution Target |
|----------|----------------|------------------|-------------------|
| Critical | 5 minutes | 10 minutes | 1 hour |
| Warning (High) | 15 minutes | 30 minutes | 4 hours |
| Warning | 30 minutes | 1 hour | 8 hours |
| Info | Best effort | N/A | N/A |

### Escalation Path

```
┌─────────────┐
│   Alert     │
│   Fires     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ L1: On-Call Engineer            │  ← Slack #infra-alerts
│ - Acknowledge within SLA        │
│ - Follow runbook procedures     │
│ - Update #infra-alerts          │
└──────┬──────────────────────────┘
       │ If unresolved after 30 min
       │ OR needs expertise
       ▼
┌─────────────────────────────────┐
│ L2: Platform Team Lead          │  ← @platform-team-lead
│ - Technical deep dive           │
│ - Coordinate multiple resources │
│ - Customer communication        │
└──────┬──────────────────────────┘
       │ If production SLA breach
       │ OR major customer impact
       ▼
┌─────────────────────────────────┐
│ L3: CTO / Executive Team        │  ← @cto
│ - Business impact decisions     │
│ - External communications       │
│ - Post-mortem requirements      │
└─────────────────────────────────┘
```

### Escalation Triggers

**Escalate to L2 when:**
- Resolution not achievable within runbook time estimates
- Alert severity increases or cascading alerts fire
- Root cause requires development team involvement
- Multiple customers reporting issues

**Escalate to L3 when:**
- Customer-facing SLA breach occurring or imminent
- Data loss or corruption detected
- Security incident suspected
- Media/public visibility likely

## On-Call Rotation

### Current On-Call Schedule

Check PagerDuty for current on-call assignments:
```bash
# View current on-call
pd schedule show --schedule-id <SCHEDULE_ID>
```

### Contact Methods

| Role | Primary | Secondary | Response Time |
|------|---------|-----------|---------------|
| On-Call Engineer | PagerDuty | Slack DM | 5 min |
| Platform Team Lead | Phone | Slack | 15 min |
| CTO | Phone | Email | 30 min |

**Slack Channels:**
- `#infra-alerts` - All infrastructure alerts (integrated with Grafana)
- `#content-platform-alerts` - Application-specific alerts
- `#on-call` - On-call coordination and handoffs

## Using Runbooks

### Before Starting

1. **Acknowledge the alert** in Grafana or PagerDuty
2. **Post in #infra-alerts**: "Investigating [Alert Name]"
3. **Gather context**: 
   - When did it start?
   - Is this recurring?
   - What changed recently?

### During Incident Response

1. **Follow the runbook** for the specific alert
2. **Document actions** in Slack thread
3. **Update stakeholders** every 15-30 minutes
4. **Escalate proactively** if stuck

### After Resolution

1. **Verify alert cleared** in Grafana
2. **Post resolution** in #infra-alerts
3. **Create incident ticket** if customer-impacting
4. **Schedule post-mortem** for Critical incidents

## Maintenance Procedures

### Planned Maintenance Windows

#### Creating a Silence

When performing planned maintenance (e.g., AKS upgrades, database scaling):

1. Navigate to Grafana UI → Alerting → Silences
2. Click "New Silence"
3. Configure:
   - **Matchers**: Select affected alerts
   - **Duration**: Maintenance window + 30 min buffer
   - **Creator**: Your name
   - **Comment**: Link to change ticket/PR

**Example Matchers:**
```yaml
# Silence all alerts for a specific node
alertname=~"Node.*"
node="aks-system-12345"

# Silence application alerts during deployment
namespace="content-platform-prod"
severity!="critical"  # Still alert on critical issues
```

4. Click "Create"
5. Post in #infra-alerts with silence ID and reason

#### Maintenance Window Template

```
🔧 Maintenance Window

Service: [Service Name]
Start: [YYYY-MM-DD HH:MM UTC]
End: [YYYY-MM-DD HH:MM UTC]
Impact: [None/Limited/Full Downtime]
Silence ID: [Grafana Silence ID]
Change Ticket: [Jira/GitHub link]

Affected Alerts:
- [Alert 1]
- [Alert 2]

Point of Contact: @username
```

## Alert Tuning

### When to Tune Alerts

- **False Positives**: Alert fires frequently without real issues
- **Missed Issues**: Problems occur without alerts firing
- **Threshold Mismatch**: Alert fires too early/late to be actionable
- **Noisy Alerts**: Same alert flaps repeatedly

### Tuning Process

1. **Collect Data** (minimum 7 days):
   - How often did alert fire?
   - Was it actionable each time?
   - What was actual metric value vs threshold?

2. **Propose Change**:
   - Update threshold in `grafana-alerts/*.yaml`
   - Update evaluation frequency if needed
   - Add/update annotations with reasoning

3. **Review**:
   - Create PR in copperiq-monitoring repo
   - Tag @platform-team for review
   - Include data supporting the change

4. **Deploy & Monitor**:
   - Merge PR (ArgoCD auto-deploys)
   - Monitor for 2 weeks
   - Document outcome

### Baseline Metrics

These represent normal operating conditions (updated quarterly):

| Metric | P50 | P95 | P99 | Alert Threshold |
|--------|-----|-----|-----|-----------------|
| Node Disk Usage | 45% | 65% | 75% | 80% (warn), 90% (crit) |
| Queue Depth | 5 | 25 | 45 | 50 (warn), 100 (crit) |
| Pod Restart Rate | 0 | 2/day | 5/day | 5/hour (warn) |
| API Response Time | 200ms | 800ms | 1.5s | 2s (warn), 5s (crit) |
| Database CPU | 20% | 50% | 70% | 80% (warn), 90% (crit) |

_Last updated: [Date]_

## Monitoring the Monitoring

### Health Checks

Verify monitoring stack health daily:

```bash
# Check Grafana is up
kubectl get pods -n observability -l app.kubernetes.io/name=grafana

# Check Prometheus is scraping
kubectl get servicemonitors --all-namespaces

# Check alert rules loaded
# Via Grafana UI: Alerting → Alert Rules (should show 56+ rules)

# Check Slack integration
# Via Grafana UI: Alerting → Contact Points → Test
```

### When Monitoring Fails

If Grafana/Prometheus is down:

1. **Use Azure Monitor** as fallback (AKS, DB metrics)
2. **Check ArgoCD UI** for application health
3. **Manual kubectl checks** for pod/node status
4. **Restore monitoring stack**:
   ```bash
   # Restart Grafana
   kubectl rollout restart statefulset -n observability prometheus-grafana
   
   # Restart Prometheus
   kubectl rollout restart statefulset -n observability prometheus-prometheus-kube-prometheus-prometheus
   ```

## Contributing to Runbooks

### Adding a New Runbook

1. Create `docs/runbooks/[alert-name].md`
2. Use existing runbooks as template
3. Include all standard sections:
   - Alert Description
   - Impact
   - Immediate Actions
   - Root Cause Investigation
   - Resolution Procedures
   - Prevention
   - Escalation
   - Post-Incident
4. Update this README.md index
5. Create PR and request review

### Runbook Template

See [runbook-template.md](./runbook-template.md) for the standard structure.

## Additional Resources

- [Grafana Unified Alerting Documentation](https://grafana.com/docs/grafana/latest/alerting/)
- [Kubernetes Troubleshooting Guide](https://kubernetes.io/docs/tasks/debug/)
- [Azure AKS Troubleshooting](https://learn.microsoft.com/en-us/azure/aks/troubleshooting)
- [Monitoring Architecture](../MONITORING_PLAN.md)
- [Alert Configuration](../../grafana-alerts/)

## Feedback

Found an issue with a runbook or have suggestions for improvement?

- Create an issue in the `copperiq-monitoring` repo
- Discuss in #platform-team Slack channel
- Update runbook directly via PR with lessons learned from incidents
