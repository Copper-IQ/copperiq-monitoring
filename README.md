# CopperIQ Monitoring

> GitOps repository for Grafana dashboards and Prometheus alert rules

**Single source of truth** for all monitoring configuration in CopperIQ's shared hosting infrastructure.

## Philosophy

> "Infrastructure is only as strong as its weakest component"

- All thresholds trigger notifications
- No silent failures
- Clear, actionable alerts
- Every component monitored

## Repository Structure

```
copperiq-monitoring/
├── helm/                        # Helm chart for deployment
│   ├── Chart.yaml              # Chart metadata
│   ├── values.yaml             # Configurable values
│   └── templates/              # Kubernetes resource templates
│       ├── configmap-dashboards.yaml
│       └── prometheusrules.yaml
├── dashboards/                  # Grafana dashboard JSONs
│   ├── infrastructure-overview.json
│   ├── aks-cluster.json
│   ├── content-platform.json
│   ├── rabbitmq.json
│   ├── azure-postgresql.json
│   ├── azure-mysql.json
│   ├── argocd.json
│   ├── cert-manager.json
│   ├── external-dns.json
│   └── n8n.json
├── alerts/                      # PrometheusRule YAMLs
│   ├── node-disk-space.yaml
│   ├── content-platform-queues.yaml
│   ├── argocd.yaml
│   ├── cert-manager.yaml
│   ├── external-dns.yaml
│   ├── n8n.yaml
│   ├── rabbitmq.yaml
│   ├── azure-postgresql.yaml
│   ├── azure-mysql.yaml
│   └── aks-cluster.yaml
└── docs/
    ├── runbooks/                # Alert response procedures
    │   ├── template.md
    │   ├── node-disk-space-critical.md
    │   ├── content-platform-queue-backlog.md
    │   └── pod-down.md
    └── baseline-metrics.md      # Pre-deployment baseline

```

## Deployment

This repository is deployed via **ArgoCD** (GitOps) to the `observability` namespace in the shared hosting cluster.

### Prerequisites

- Kubernetes cluster with Prometheus Operator installed
- Grafana with dashboard provisioning enabled
- ArgoCD managing the cluster

### Installation

Automatically deployed when added to `app-of-apps`:

```yaml
# app-of-apps/values-accept.yaml
apps:
  - name: copperiq-monitoring
    namespace: observability
    repo: https://github.com/Copper-IQ/copperiq-monitoring.git
    targetRevision: main
    path: ./helm
```

### Manual Installation (for testing)

```bash
helm upgrade --install copperiq-monitoring ./helm \
  --namespace observability \
  --create-namespace
```

## Dashboards

10 custom dashboards focused on actionable metrics:

1. **Infrastructure Overview** - Health summary of all components
2. **AKS Cluster** - Node resources, disk space (75%/85% thresholds), pod health
3. **Content Platform** - App metrics + n8n queue monitoring (business growth indicator)
4. **RabbitMQ** - Dev/prod comparison, queue depth, consumer health
5. **Azure PostgreSQL** - Database metrics for n8n, langfuse, content-platform
6. **Azure MySQL** - Risers App database monitoring
7. **ArgoCD** - GitOps health, sync status, reconciliation
8. **Cert-Manager** - Certificate expiry, renewal status
9. **External-DNS** - DNS sync operations, Azure API health
10. **n8n** - Worker health, Valkey cache, Browserless/Pandoc status

All dashboards provisioned automatically via ConfigMaps with label `grafana_dashboard: "1"`.

## Alert Rules

90+ PrometheusRules covering:

### Infrastructure Alerts
- **Node disk space**: Warning >75%, Critical >85% (unpruned images)
- **Node resources**: CPU/Memory/Ephemeral storage
- **Pod health**: Restarts, pending pods, failed pods

### Application Alerts
- **Content Platform queues**: 
  - Dev: Warning >200 messages
  - Prod: Warning >500, Critical >1000
  - Queue age: Warning >10min, Critical >30min
- **n8n**: Main pod, workers, Valkey availability
- **RabbitMQ**: Memory, queue depth, consumer health

### Platform Service Alerts
- **ArgoCD**: Sync failures, app out-of-sync
- **Cert-Manager**: Certificate expiry (<7 days warning, <48h critical)
- **External-DNS**: DNS sync errors

### Azure Resource Alerts
- **PostgreSQL/MySQL**: CPU, memory, storage, connections
- **AKS**: Control plane health, API server latency

### Observability Self-Monitoring
- **Prometheus disk space**: Warning >75%, Critical >85%
- **Prometheus health**: WAL corruption, scrape failures, query latency
- **Grafana disk space**: Warning >75%, Critical >90%
- **AlertManager**: Pod availability, configuration reload failures

## Current Scale Context

**As of 2025-01:**
- 1 worker/consumer per environment
- <10 active clients generating content
- Job duration: 2-8 minutes (single queue)
- Expected capacity: ~7-30 jobs/hour per worker

Queue thresholds calibrated for this scale and will be adjusted as the platform grows.

## Notification Channels

Alerts routed to **Slack**:
- **#alerts**: Critical and Warning severity
- **#monitoring**: Info severity (low-priority trends)

Configured in AlertManager (see `shared-hosting-infra` repository).

## Monitoring Architecture

### Data Sources
1. **Prometheus** (in-cluster): K8s resources, applications, RabbitMQ
2. **Azure Monitor** (datasource): PostgreSQL, MySQL, AKS control plane
3. **Application Metrics** (future): n8n, content-platform custom metrics

### Retention
- **Prometheus**: 90 days
- **Storage**: 50Gi PVC

## Development

### Adding a New Dashboard

1. Export dashboard JSON from Grafana UI
2. Add to `dashboards/` folder
3. Commit and push - ArgoCD will sync automatically
4. Dashboard appears in Grafana under "CopperIQ" folder

### Adding a New Alert

1. Create YAML in `alerts/` folder
2. Follow PrometheusRule CRD format
3. Include clear annotations with context
4. Commit and push - Prometheus Operator applies automatically

### Testing Alerts

```bash
# Scale down a deployment to trigger pod availability alert
kubectl scale deployment/my-app --replicas=0 -n my-namespace

# Check alert fires in Prometheus
kubectl port-forward -n observability svc/prometheus-operated 9090:9090

# Check AlertManager receives it
kubectl port-forward -n observability svc/prometheus-alertmanager 9093:9093

# Verify Slack notification
```

## Related Repositories

- **shared-hosting-infra**: Pulumi IaC deploying Prometheus/Grafana
- **app-of-apps**: ArgoCD app-of-apps pattern for all applications

## References

- [Monitoring Plan](./docs/MONITORING_PLAN.md) (if copied from shared-hosting-infra)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)
- [PrometheusRule CRD Reference](https://prometheus-operator.dev/docs/operator/api/#monitoring.coreos.com/v1.PrometheusRule)
- [Grafana Unified Alerting](https://grafana.com/docs/grafana/latest/alerting/unified-alerting/)

## License

Proprietary - CopperIQ B.V.
