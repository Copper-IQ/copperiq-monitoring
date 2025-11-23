# ContentPlatformQueueBacklog Runbook

## Alert Description

**Alert Name:** ContentPlatformQueueBacklog  
**Severity:** Warning  
**Threshold:** Queue depth > 50 messages  
**Evaluation:** Every 5 minutes  
**Normal Capacity:** 7-30 jobs/hour

This alert fires when the Content Platform's RabbitMQ queue has more than 50 pending messages, indicating that workers are not processing jobs fast enough to keep up with incoming requests.

## Impact

- **User Experience:** Content generation requests delayed
- **SLA Risk:** Processing time may exceed customer expectations
- **Business Impact:** Revenue delay if content delivery is time-sensitive
- **Cascading Risk:** Queue may continue growing if not addressed

## Immediate Actions (Within 10 Minutes)

### 1. Check Current Queue Status

```bash
# Get RabbitMQ pod name
kubectl get pods -n content-platform-prod -l app=rabbitmq

# Check queue stats via management API
kubectl exec -n content-platform-prod <rabbitmq-pod> -- rabbitmqctl list_queues name messages messages_ready messages_unacknowledged

# Or use the RabbitMQ Management UI
kubectl port-forward -n content-platform-prod svc/rabbitmq 15672:15672
# Then open http://localhost:15672 (credentials from secrets)
```

### 2. Verify Worker Health

```bash
# Check worker pod status
kubectl get pods -n content-platform-prod -l app=content-platform-worker

# Check worker logs for errors
kubectl logs -n content-platform-prod -l app=content-platform-worker --tail=100

# Check if workers are consuming messages
kubectl top pods -n content-platform-prod -l app=content-platform-worker
```

### 3. Quick Assessment

Determine which scenario applies:

- **High Load (Normal):** Many valid requests, workers healthy → Scale up workers
- **Worker Issues:** Workers crashing, errors in logs → Fix worker issue
- **Message Poison:** Same message failing repeatedly → Purge poison messages
- **External Dependency:** Downstream service slow/down → Check dependencies

## Root Cause Investigation

### Scenario 1: High Legitimate Load

**Symptoms:**
- Workers are healthy and processing
- CPU/Memory usage normal but constant
- No errors in worker logs
- Queue slowly growing despite workers running

**Investigation:**
```bash
# Check worker processing rate
kubectl logs -n content-platform-prod <worker-pod> --tail=1000 | grep -i "processed\|completed" | wc -l

# Check current worker count
kubectl get deployment -n content-platform-prod content-platform-worker -o jsonpath='{.spec.replicas}'

# Check HPA status (if enabled)
kubectl get hpa -n content-platform-prod
```

### Scenario 2: Worker Errors/Crashes

**Symptoms:**
- Workers restarting frequently
- Errors in worker logs
- CPU/Memory spikes or OOM kills

**Investigation:**
```bash
# Check pod restart counts
kubectl get pods -n content-platform-prod -l app=content-platform-worker -o custom-columns=NAME:.metadata.name,RESTARTS:.status.containerStatuses[0].restartCount

# Check for OOMKilled
kubectl get pods -n content-platform-prod -l app=content-platform-worker -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].lastState.terminated.reason}{"\n"}{end}'

# Get detailed error logs
kubectl logs -n content-platform-prod <worker-pod> --previous  # Previous crashed instance
```

### Scenario 3: Poison Messages

**Symptoms:**
- Same message failing repeatedly
- Errors in logs about specific message ID
- Queue not decreasing despite workers running

**Investigation:**
```bash
# Check RabbitMQ dead letter queue
kubectl exec -n content-platform-prod <rabbitmq-pod> -- rabbitmqctl list_queues name messages | grep -i dead

# Inspect message causing issues (via Management UI)
# Look for messages in dead letter queue or repeatedly redelivered
```

### Scenario 4: External Dependencies Slow

**Symptoms:**
- Workers waiting/timing out
- Logs show connection timeouts
- No errors but very slow processing

**Investigation:**
```bash
# Check database connectivity
kubectl exec -n content-platform-prod <worker-pod> -- nc -zv <db-host> <db-port>

# Check external API status (if applicable)
# Review worker logs for timeout patterns
kubectl logs -n content-platform-prod <worker-pod> --tail=500 | grep -i timeout
```

## Resolution Procedures

### Solution 1: Scale Up Workers (High Load)

```bash
# Manual scaling
kubectl scale deployment -n content-platform-prod content-platform-worker --replicas=<new-count>

# Recommended scaling based on queue depth:
# 50-100 messages: 3-4 workers
# 100-200 messages: 5-6 workers
# 200+ messages: 7-8 workers (investigate further)

# Monitor queue drain rate
watch kubectl exec -n content-platform-prod <rabbitmq-pod> -- rabbitmqctl list_queues name messages
```

### Solution 2: Restart Unhealthy Workers

```bash
# Restart all workers (rolling restart)
kubectl rollout restart deployment -n content-platform-prod content-platform-worker

# Watch the rollout
kubectl rollout status deployment -n content-platform-prod content-platform-worker

# Verify queue starts draining
kubectl exec -n content-platform-prod <rabbitmq-pod> -- rabbitmqctl list_queues name messages
```

### Solution 3: Purge Poison Messages

⚠️ **WARNING:** This deletes messages permanently. Only use if messages are confirmed malformed/poison.

```bash
# First, try to move poison messages to dead letter queue
# (This should happen automatically if dead letter exchange is configured)

# As last resort, purge specific queue
kubectl exec -n content-platform-prod <rabbitmq-pod> -- rabbitmqctl purge_queue <queue-name>

# Or via Management API:
curl -u <user>:<pass> -X DELETE http://localhost:15672/api/queues/%2F/<queue-name>/contents
```

### Solution 4: Increase Worker Resources

If workers are consistently CPU/memory bound:

```bash
# Edit deployment to increase resources
kubectl edit deployment -n content-platform-prod content-platform-worker

# Update resources section:
# resources:
#   requests:
#     cpu: "500m"      # Increase from 250m
#     memory: "512Mi"  # Increase from 256Mi
#   limits:
#     cpu: "1000m"
#     memory: "1Gi"
```

## Customer Communication

### When to Notify Customers

- Queue backlog > 200 messages for > 15 minutes
- Processing delays exceed 30 minutes
- Specific customer content requests are affected

### Communication Template

```
Subject: Content Platform - Temporary Processing Delays

Hi [Customer Name],

We're experiencing higher than usual processing times for content generation 
requests due to increased platform load.

Current Status:
- Content requests are being queued and will be processed
- Expected delay: [X] minutes
- No data loss - all requests will complete

Our team is actively scaling resources to restore normal processing times.

We'll update you when processing returns to normal.

Best regards,
CopperIQ Platform Team
```

## Prevention

### Enable Horizontal Pod Autoscaling (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: content-platform-worker-hpa
  namespace: content-platform-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: content-platform-worker
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: rabbitmq_queue_messages
      target:
        type: AverageValue
        averageValue: "25"  # Target 25 messages per worker
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 120
```

### Configure Queue Limits

```bash
# Set max queue length to prevent unbounded growth
kubectl exec -n content-platform-prod <rabbitmq-pod> -- rabbitmqctl set_policy max-length \
  "^content-platform-queue$" \
  '{"max-length":1000,"overflow":"reject-publish"}' \
  --apply-to queues
```

### Worker Optimization

1. **Increase concurrency** if workers are I/O bound
2. **Batch processing** for similar content types
3. **Cache frequently used resources** (templates, assets)
4. **Add worker health checks** to detect hung workers

### Monitoring Improvements

1. Add predictive alert for queue growth rate
2. Set up dashboard showing:
   - Queue depth over time
   - Worker count vs queue depth
   - Average processing time per job
   - Success/failure rate

## Escalation

### When to Escalate

- Queue continues growing despite scaling workers to max
- Worker crashes are caused by application bugs
- Customer-facing SLA breach imminent (> 1 hour delay)
- Multiple queues affected across different services

### Escalation Path

1. **L1 → L2:** If queue doesn't drain within 30 minutes of scaling
2. **L2 → Dev Team:** If worker errors indicate application bug
3. **Dev Team → Product Owner:** If customer SLA breach occurs
4. **Any Level → CTO:** If data loss or corruption suspected

### Contact Information

- **Slack:** #content-platform-alerts
- **Dev Team Lead:** [Add contact]
- **Product Owner:** [Add contact]
- **On-Call:** Check PagerDuty rotation

## Post-Incident

### Data to Collect

1. Peak queue depth and duration
2. Number of workers during incident
3. Processing rate (jobs/minute)
4. Any failed/lost messages
5. Customer impact (if any)

### Follow-Up Actions

1. Review HPA configuration effectiveness
2. Analyze whether alert threshold needs adjustment
3. Identify traffic pattern (organic spike vs attack)
4. Update capacity planning based on growth
5. Consider rate limiting if appropriate

### Documentation

- Update this runbook with incident-specific learnings
- Document any new worker optimization techniques discovered
- Update capacity planning spreadsheet
- Create post-mortem in docs/incidents/ if customer-impacting

## Related Alerts

- **ContentPlatformWorkerDown** - Worker pods unavailable
- **RabbitMQHighMemoryUsage** - RabbitMQ memory pressure
- **RabbitMQConnectionFailures** - Workers can't connect to queue
- **ContentPlatformAPIHighLatency** - API slow to accept requests

## Useful Commands Quick Reference

```bash
# Queue status
kubectl exec -n content-platform-prod <rabbitmq-pod> -- rabbitmqctl list_queues

# Worker count
kubectl get deployment -n content-platform-prod content-platform-worker

# Scale workers
kubectl scale deployment -n content-platform-prod content-platform-worker --replicas=5

# Watch queue drain
watch 'kubectl exec -n content-platform-prod <rabbitmq-pod> -- rabbitmqctl list_queues name messages'

# Worker logs
kubectl logs -n content-platform-prod -l app=content-platform-worker --tail=100 -f

# RabbitMQ Management UI
kubectl port-forward -n content-platform-prod svc/rabbitmq 15672:15672
```

## Additional Resources

- [RabbitMQ Management](https://www.rabbitmq.com/management.html)
- [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [Content Platform Architecture](../architecture/content-platform.md)
- [Worker Scaling Strategy](../operations/worker-scaling.md)
