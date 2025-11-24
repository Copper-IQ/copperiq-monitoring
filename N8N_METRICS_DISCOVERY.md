# n8n Metrics Discovery

## Overview

Investigation of available Prometheus metrics for n8n monitoring dashboard.

## Components

### Dev Environment (n8n-dev namespace)
- `n8n-dev` - Web application (1 pod)
- `n8n-dev-worker` - Workers (2 pods)
- `n8n-dev-valkey-primary` - Redis/Valkey for Bull queues (1 pod)
- `rabbitmq-0` - RabbitMQ message broker (1 pod)
- `browserless` - Browser automation service (1 pod)

### Prod Environment (n8n-prod namespace)
- `n8n` - Web application (1 pod)
- `n8n-webhook` - Webhook handler (1 pod)
- `n8n-worker` - Workers (2 pods)
- `n8n-valkey-primary` - Redis/Valkey for Bull queues (1 pod)
- `rabbitmq-0` - RabbitMQ message broker (1 pod)
- `browserless` - Browser automation service (2 pods)

---

## 1. n8n Web Application Metrics

### Endpoint
- **Path**: `/metrics`
- **Port**: 5678 (internal)
- **Format**: Prometheus

### Available Metrics

#### Process Metrics
- `n8n_process_cpu_user_seconds_total` - User CPU time
- `n8n_process_cpu_system_seconds_total` - System CPU time
- `n8n_process_cpu_seconds_total` - Total CPU time
- `n8n_process_resident_memory_bytes` - Memory usage
- `n8n_process_virtual_memory_bytes` - Virtual memory
- `n8n_process_heap_bytes` - Heap size
- `n8n_process_open_fds` - Open file descriptors
- `n8n_process_start_time_seconds` - Process start time

#### Node.js Runtime Metrics
- `n8n_nodejs_eventloop_lag_seconds` - Event loop lag
- `n8n_nodejs_eventloop_lag_p50_seconds` - P50 percentile
- `n8n_nodejs_eventloop_lag_p90_seconds` - P90 percentile
- `n8n_nodejs_eventloop_lag_p99_seconds` - P99 percentile
- `n8n_nodejs_heap_size_total_bytes` - Total heap size
- `n8n_nodejs_heap_size_used_bytes` - Used heap size
- `n8n_nodejs_active_handles_total` - Active handles
- `n8n_nodejs_active_requests_total` - Active requests
- `n8n_nodejs_gc_duration_seconds` - GC duration by type

#### n8n-Specific Metrics
- `n8n_active_workflow_count` - Total active workflows
- `n8n_scaling_mode_queue_jobs_waiting` - **Jobs waiting in queue**
- `n8n_scaling_mode_queue_jobs_active` - **Jobs currently processing**
- `n8n_scaling_mode_queue_jobs_completed` - **Total completed jobs (counter)**
- `n8n_scaling_mode_queue_jobs_failed` - **Total failed jobs (counter)**
- `n8n_version_info` - Version information

### Key Metrics for Dashboard
✅ **Queue Health**:
- `n8n_scaling_mode_queue_jobs_waiting` - Current backlog
- `n8n_scaling_mode_queue_jobs_active` - Jobs being processed

✅ **Throughput**:
- `rate(n8n_scaling_mode_queue_jobs_completed[5m])` - Completion rate
- `rate(n8n_scaling_mode_queue_jobs_failed[5m])` - Failure rate

✅ **Application Health**:
- `n8n_nodejs_eventloop_lag_p99_seconds` - Event loop performance
- `n8n_process_resident_memory_bytes` - Memory usage
- `n8n_active_workflow_count` - Active workflows

---

## 2. n8n Worker Metrics

### Endpoint
- **Path**: `/metrics`
- **Port**: 5678 (internal)

### Available Metrics
Workers expose the same metrics as the web application:
- All process metrics (CPU, memory, FDs)
- Node.js runtime metrics (event loop, heap, GC)
- `n8n_active_workflow_count`

**Note**: Workers share the same Bull queue metrics from the main web app. The queue metrics represent the overall queue state across all workers.

### Key Metrics for Dashboard
✅ **Worker Health** (per pod):
- `n8n_process_resident_memory_bytes` - Memory per worker
- `n8n_nodejs_eventloop_lag_p99_seconds` - Event loop lag per worker
- `n8n_process_cpu_seconds_total` - CPU usage per worker

---

## 3. RabbitMQ Metrics

### Endpoint
- **Path**: `/metrics`
- **Port**: 9419 (exposed)
- **Service**: `rabbitmq` (port 9419)

### Available Metrics

#### Alarms
- `rabbitmq_alarms_file_descriptor_limit` - FD limit alarm
- `rabbitmq_alarms_free_disk_space_watermark` - Disk space alarm
- `rabbitmq_alarms_memory_used_watermark` - Memory alarm

#### Connections & Channels
- `rabbitmq_connections_opened_total` - Total connections opened
- `rabbitmq_connections_closed_total` - Total connections closed
- `rabbitmq_channels_opened_total` - Total channels opened
- `rabbitmq_channels_closed_total` - Total channels closed

#### Queue Metrics (with labels: queue, vhost)
- `rabbitmq_queue_messages_ready` - **Messages ready for delivery**
- `rabbitmq_queue_messages_unacked` - **Messages delivered but not acked**
- `rabbitmq_queue_messages` - **Total queue depth (ready + unacked)**
- `rabbitmq_queue_consumers` - **Number of consumers**
- `rabbitmq_queue_consumer_utilisation` - Consumer utilization (0-1)
- `rabbitmq_queue_messages_bytes` - Total bytes in queue
- `rabbitmq_queue_messages_ready_bytes` - Bytes ready for delivery
- `rabbitmq_queue_messages_ram` - Messages in RAM
- `rabbitmq_queue_messages_persistent` - Persistent messages

#### Queues Lifecycle
- `rabbitmq_queues_declared_total` - Queues declared
- `rabbitmq_queues_created_total` - Queues created
- `rabbitmq_queues_deleted_total` - Queues deleted

#### Resource Usage
- `rabbitmq_process_resident_memory_bytes` - Memory usage
- `rabbitmq_process_open_fds` - Open file descriptors
- `rabbitmq_process_open_tcp_sockets` - Open TCP sockets
- `rabbitmq_disk_space_available_bytes` - Available disk space
- `rabbitmq_erlang_processes_used` - Erlang processes
- `rabbitmq_erlang_gc_runs_total` - GC runs
- `rabbitmq_erlang_gc_reclaimed_bytes_total` - Bytes reclaimed by GC

### Key Metrics for Dashboard
✅ **Queue Depth & Backlog**:
- `rabbitmq_queue_messages_ready` - Messages waiting to be consumed
- `rabbitmq_queue_messages` - Total queue depth

✅ **Consumer Health**:
- `rabbitmq_queue_consumers` - Active consumers per queue
- `rabbitmq_queue_consumer_utilisation` - Consumer saturation

✅ **Throughput** (derive with rate()):
- Message ingress rate: `rate(rabbitmq_queue_messages_published_total[5m])`
- Message consumption rate: `rate(rabbitmq_queue_messages_acknowledged_total[5m])`

✅ **Health**:
- `rabbitmq_alarms_*` - Any active alarms
- `rabbitmq_process_resident_memory_bytes` - Memory pressure

---

## 4. Redis/Valkey (Bull Queue Backend)

### Current State
❌ **No metrics exporter deployed**
- Only port 6379 exposed (Redis protocol)
- No Prometheus exporter sidecar
- No metrics endpoint available

### Options

#### Option 1: Deploy Redis Exporter (Recommended)
Add redis-exporter as a sidecar container to valkey deployment:
- Image: `oliver006/redis_exporter:latest`
- Port: 9121
- Metrics: Full Redis statistics

**Metrics Available with Exporter**:
- `redis_connected_clients` - Connected clients
- `redis_blocked_clients` - Blocked clients
- `redis_used_memory_bytes` - Memory usage
- `redis_commands_processed_total` - Total commands
- `redis_keyspace_hits_total` - Cache hits
- `redis_keyspace_misses_total` - Cache misses
- `redis_evicted_keys_total` - Evicted keys
- Bull queue-specific keys via key patterns

#### Option 2: Query Redis via CLI (Not Recommended)
Use `kubectl exec` and `redis-cli INFO` - not suitable for dashboards

#### Option 3: n8n Bull Queue Metrics (Current)
Use n8n's existing Bull queue metrics from web app:
- `n8n_scaling_mode_queue_jobs_waiting`
- `n8n_scaling_mode_queue_jobs_active`
- `n8n_scaling_mode_queue_jobs_completed`
- `n8n_scaling_mode_queue_jobs_failed`

### Recommendation
**Use Option 3 for now** - n8n already exposes the most important Bull queue metrics. Deploy Redis exporter later if detailed Redis internals are needed.

---

## 5. ServiceMonitor Requirements

### Current State
❌ No ServiceMonitors exist for n8n components

### Required ServiceMonitors

#### 1. n8n-web ServiceMonitor
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: n8n-web
  namespace: {n8n-dev | n8n-prod}
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: n8n
      app.kubernetes.io/component: web
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

#### 2. n8n-worker ServiceMonitor
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: n8n-worker
  namespace: {n8n-dev | n8n-prod}
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: n8n
      app.kubernetes.io/component: worker
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

#### 3. rabbitmq ServiceMonitor
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: rabbitmq
  namespace: {n8n-dev | n8n-prod}
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: rabbitmq
  endpoints:
    - port: metrics  # port 9419
      path: /metrics
      interval: 30s
```

---

## Dashboard Structure Recommendation

### Option A: Single Comprehensive Dashboard ✅ **RECOMMENDED**
**Name**: `n8n - Workflow Processing`

**Structure**:
1. **Environment Variable** - Dropdown to switch between `n8n-dev` and `n8n-prod`
2. **Overview Row** - Key metrics at a glance
3. **Queue Health Row** - Bull queue + RabbitMQ queue status
4. **Throughput Row** - Message rates, completion rates, processing times
5. **Application Health Row** - n8n web + workers memory, CPU, event loop
6. **RabbitMQ Row** - Queue depths, consumers, throughput per queue
7. **Bottleneck Analysis Row** - Identify slow consumers, queue backlogs

**Pros**:
- Single pane of glass
- Easy comparison between components
- Correlate issues across the stack
- Better for troubleshooting bottlenecks

### Option B: Separate Dashboards per Component
**Dashboards**:
1. `n8n - Application` (web + workers)
2. `n8n - Queue Processing` (Bull queues via n8n metrics)
3. `n8n - RabbitMQ` (message broker)

**Pros**:
- Focused views per component
- Easier to maintain
- Can be accessed independently

**Cons**:
- Need to switch between dashboards
- Harder to correlate issues
- Duplicate environment variables

### Decision: **Option A** - Single Dashboard
Reason: Bottleneck analysis requires seeing the full pipeline (RabbitMQ → Bull Queue → Workers) in one view.

---

## Key Metrics Summary

| Component | Metric | Purpose |
|-----------|--------|---------|
| **n8n Web** | `n8n_scaling_mode_queue_jobs_waiting` | Queue backlog |
| **n8n Web** | `n8n_scaling_mode_queue_jobs_active` | Jobs processing |
| **n8n Web** | `rate(n8n_scaling_mode_queue_jobs_completed[5m])` | Job completion rate |
| **n8n Workers** | `n8n_process_resident_memory_bytes` | Memory per worker |
| **n8n Workers** | `n8n_nodejs_eventloop_lag_p99_seconds` | Event loop health |
| **RabbitMQ** | `rabbitmq_queue_messages_ready` | Messages waiting |
| **RabbitMQ** | `rabbitmq_queue_consumers` | Consumer count |
| **RabbitMQ** | `rabbitmq_queue_consumer_utilisation` | Consumer saturation |

---

## Next Steps

1. ✅ Create ServiceMonitors for n8n-web, n8n-worker, rabbitmq (both dev + prod)
2. ✅ Create comprehensive n8n dashboard with namespace variable
3. ✅ Add panels for queue health, throughput, application health
4. ✅ Add bottleneck analysis panels
5. ⏸️ (Optional) Deploy Redis exporter for detailed Bull queue internals
6. ✅ Deploy and verify dashboards show data

---

## Monitoring Goals

### Primary Goal: Identify Bottlenecks
**Symptoms to Detect**:
- ✅ Queue backlog growing (`n8n_scaling_mode_queue_jobs_waiting` increasing)
- ✅ Low completion rate (`rate(n8n_scaling_mode_queue_jobs_completed[5m])` low)
- ✅ Consumer saturation (`rabbitmq_queue_consumer_utilisation` near 1.0)
- ✅ Worker overload (high event loop lag, memory pressure)
- ✅ RabbitMQ backlog (`rabbitmq_queue_messages_ready` growing)

### Secondary Goals
- Monitor application health (memory, CPU, event loop)
- Track workflow execution success rate
- Monitor RabbitMQ resource usage
- Alert on queue depth thresholds
