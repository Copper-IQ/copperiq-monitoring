# n8n Monitoring - Implementation Summary

## 🎉 Complete! All Components Deployed

### What We Built

A comprehensive monitoring solution for n8n workflow processing across dev and prod environments.

---

## 1. ✅ Metrics Collection

### ServiceMonitors & PodMonitors Deployed

**n8n Web Application**
- ServiceMonitor: `n8n-web` (n8n-dev, n8n-prod)
- Endpoint: `/metrics:5678`
- Scrapes: Bull queue metrics, workflow count, process health

**n8n Workers**
- PodMonitor: `n8n-worker` (n8n-dev, n8n-prod)
- Endpoint: `/metrics:5678` (direct pod scraping)
- Scrapes: Memory, CPU, event loop lag per worker

**RabbitMQ**
- ServiceMonitor: `rabbitmq` (n8n-dev, n8n-prod)
- Endpoint: `/metrics:9419`
- Scrapes: Queue depth, consumers, utilization, throughput

**Status**: ✅ All metrics being scraped by Prometheus every 30s

---

## 2. ✅ Dashboard Deployed

### Dashboard: `n8n - Workflow Processing`

**Location**: Applications folder in Grafana  
**UID**: `n8n-workflow-processing`  
**Refresh**: 30s auto-refresh

### Features

#### Namespace Variable
- Dropdown to switch between `n8n-dev` and `n8n-prod`
- All panels respond to environment selection
- Single dashboard for both environments

#### Overview Panels (5 panels)

1. **Active Workflows**
   - Gauge showing total active workflows
   - Thresholds: Green < 5 < Yellow < 20 < Red

2. **Queue Jobs Waiting**
   - Current Bull queue backlog
   - Thresholds: Green < 10 < Yellow < 50 < Red
   - **Key bottleneck indicator**

3. **Queue Jobs Active**
   - Jobs currently being processed
   - Thresholds: Green < 5 < Yellow < 10 < Red
   - Shows worker utilization

4. **Worker Count**
   - Number of active worker pods
   - Thresholds: Red < 1 < Yellow < 2 < Green
   - Ensures adequate capacity

5. **RabbitMQ Queue Depth**
   - Total messages across all queues
   - Thresholds: Green < 100 < Yellow < 500 < Red
   - **Key bottleneck indicator**

---

## 3. ✅ Bottleneck Detection

### How to Identify Bottlenecks

The dashboard shows:

#### Scenario 1: Queue Backlog Growing
**Symptoms**:
- "Queue Jobs Waiting" increasing ↗️
- "Queue Jobs Active" stable or low

**Diagnosis**: Workers can't keep up with job arrival rate

**Actions**:
- Check worker health (are they slow?)
- Scale workers horizontally
- Investigate slow workflows

#### Scenario 2: RabbitMQ Backlog
**Symptoms**:
- "RabbitMQ Queue Depth" increasing ↗️
- "Queue Jobs Waiting" stable

**Diagnosis**: Messages not being consumed from RabbitMQ

**Actions**:
- Check consumer count (should be > 0)
- Verify n8n web app is consuming
- Check RabbitMQ consumer utilization

#### Scenario 3: Worker Exhaustion
**Symptoms**:
- "Worker Count" < expected
- "Queue Jobs Waiting" growing
- "Queue Jobs Active" at maximum

**Diagnosis**: Not enough workers or workers crashed

**Actions**:
- Check worker pod status
- Review worker logs for crashes
- Scale workers

#### Scenario 4: All Green but Slow
**Symptoms**:
- All metrics look healthy
- But users report slow workflows

**Diagnosis**: Individual workflow performance issue

**Actions**:
- Check workflow execution logs
- Review specific workflow steps
- Look for external API slowness

---

## 4. 📊 Available Metrics

### From n8n Web Application

```promql
# Queue Metrics (Bull Queue)
n8n_scaling_mode_queue_jobs_waiting      # Jobs waiting to be processed
n8n_scaling_mode_queue_jobs_active       # Jobs currently processing
n8n_scaling_mode_queue_jobs_completed    # Total completed (counter)
n8n_scaling_mode_queue_jobs_failed       # Total failed (counter)

# Workflow Metrics
n8n_active_workflow_count                # Active workflows

# Process Metrics
n8n_process_resident_memory_bytes        # Memory usage
n8n_process_cpu_seconds_total            # CPU time
n8n_nodejs_eventloop_lag_p99_seconds     # Event loop lag
```

### From n8n Workers

```promql
# Same metrics as web app, per worker pod
n8n_process_resident_memory_bytes{pod=~".*worker.*"}
n8n_nodejs_eventloop_lag_p99_seconds{pod=~".*worker.*"}
```

### From RabbitMQ

```promql
# Queue Depth
rabbitmq_queue_messages                  # Total queue depth
rabbitmq_queue_messages_ready            # Messages ready for delivery
rabbitmq_queue_messages_unacked          # Messages delivered but not acked

# Consumer Health
rabbitmq_queue_consumers                 # Number of consumers
rabbitmq_queue_consumer_utilisation      # Consumer saturation (0-1)

# Resource Usage
rabbitmq_process_resident_memory_bytes   # RabbitMQ memory
rabbitmq_alarms_*                        # Active alarms
```

---

## 5. 🎯 Key Queries for Troubleshooting

### Check if metrics are available
```promql
# n8n web app metrics
up{job="n8n-web"}

# n8n worker metrics
up{job="n8n-worker"}

# RabbitMQ metrics
up{job="rabbitmq"}
```

### Current queue backlog
```promql
n8n_scaling_mode_queue_jobs_waiting{namespace="n8n-prod"}
```

### Job completion rate (last 5 minutes)
```promql
rate(n8n_scaling_mode_queue_jobs_completed{namespace="n8n-prod"}[5m])
```

### Worker memory usage
```promql
n8n_process_resident_memory_bytes{namespace="n8n-prod",pod=~".*worker.*"}
```

### RabbitMQ consumer count
```promql
rabbitmq_queue_consumers{namespace="n8n-prod"}
```

---

## 6. 📁 Files Changed

### copperiq-monitoring Repository

**ServiceMonitors**:
- `servicemonitors/n8n-web.yaml` - n8n web ServiceMonitor
- `servicemonitors/n8n-worker.yaml` - n8n worker PodMonitor
- `servicemonitors/n8n-rabbitmq.yaml` - RabbitMQ ServiceMonitor

**Dashboard**:
- `helm/dashboards/n8n-workflow-processing.json` - Main dashboard

**Scripts**:
- `build-n8n-dashboard.ps1` - Dashboard building script
- `complete-n8n-dashboard.py` - Python version (for reference)

**Documentation**:
- `N8N_METRICS_DISCOVERY.md` - Metrics discovery analysis
- `N8N_MONITORING_SUMMARY.md` - This file

---

## 7. 🚀 Next Steps (Optional Enhancements)

The current dashboard provides the essentials for bottleneck detection. Future enhancements could include:

### Additional Dashboard Panels

1. **Queue Health Timeseries**
   - Jobs Waiting over time (trend line)
   - Jobs Active over time
   - Shows queue backlog growth patterns

2. **Throughput Analysis**
   - Jobs completed/sec with `rate()` functions
   - Jobs failed/sec
   - Success rate percentage

3. **Worker Health Details**
   - Memory per worker (individual lines)
   - Event loop lag per worker
   - CPU usage per worker
   - Identify slow workers

4. **RabbitMQ Queue Breakdown**
   - Messages ready per queue (stacked area)
   - Consumer count per queue
   - Consumer utilization per queue
   - Identify which queues are bottlenecked

5. **Bottleneck Heatmap**
   - Visual heatmap of worker saturation
   - Queue vs consumer correlation
   - Slowest components highlighted

### Alert Rules

Create Grafana alerts for:
- Queue backlog > threshold for > 5 minutes
- Worker count < 2
- RabbitMQ consumer count = 0
- Event loop lag > 500ms

### Redis Exporter

Currently using n8n's Bull queue metrics. For deeper Redis/Valkey insights:
- Deploy `oliver006/redis_exporter` as sidecar
- Get Redis-specific metrics (memory, key count, evictions)
- Monitor Bull queue internals

---

## 8. ✅ Verification Checklist

- [x] ServiceMonitors created and deployed
- [x] PodMonitors created and deployed
- [x] Metrics being scraped by Prometheus
- [x] Dashboard created with namespace variable
- [x] Overview panels showing current state
- [x] Dashboard in Applications folder
- [x] 30s auto-refresh configured
- [x] All changes committed to Git
- [x] Documentation complete

---

## 9. 📞 Using the Dashboard

### Access

1. Open Grafana
2. Navigate to **Applications** folder
3. Open **n8n - Workflow Processing** dashboard
4. Select environment (n8n-dev or n8n-prod) from dropdown

### Interpreting the Metrics

**Green values** = Healthy, no action needed  
**Yellow values** = Warning, monitor closely  
**Red values** = Critical, investigate immediately

### Common Issues

**"No Data" in panels**:
- Wait 30-60s for Prometheus to scrape
- Check ServiceMonitor is deployed: `kubectl get servicemonitor -n n8n-dev`
- Verify metrics endpoint: `kubectl exec -n n8n-dev <pod> -- wget -q -O- http://localhost:5678/metrics`

**Dashboard not updating**:
- Check refresh interval (top right, should be 30s)
- Verify namespace variable is set correctly
- Check Prometheus is scraping targets

**Metrics show zero**:
- Normal if no workflows are running
- Run a test workflow to generate metrics
- Check n8n is in scaling mode (workers enabled)

---

## 10. 🎓 Monitoring Best Practices

### Daily Monitoring

Check dashboard daily for:
- Queue backlog trends (should be near zero)
- Worker count stability
- RabbitMQ queue depth (should be low)

### During Deployments

Monitor:
- Worker count during rollout
- Queue backlog (should not grow excessively)
- Job failure rate

### Performance Tuning

Use dashboard to:
- Determine optimal worker count
- Identify slow workflow patterns
- Size RabbitMQ consumers appropriately

---

**Status**: ✅ **COMPLETE - n8n Monitoring Fully Operational**  
**Environment**: Azure AKS (n8n-dev, n8n-prod)  
**Date**: 2025-11-24
