# Deployment Guide

## Overview

This guide shows how to deploy copperiq-monitoring with Pulumi managing the Slack webhook secret.

---

## Architecture

```
Pulumi → Creates ConfigMap with webhook → Grafana sidecar discovers (grafana_alert=1 label) → Provisions alerts
```

---

## Steps

### 1. Set Slack Webhook as Pulumi Secret

```bash
cd shared-hosting-infra
pulumi config set --secret slackWebhookUrl "<YOUR_SLACK_WEBHOOK_URL>" -s accept_prod
```

This stores the webhook encrypted in Pulumi state.

### 2. Add ConfigMap Creation to ObservabilityStack.cs

Add this code after the `kube-prometheus-stack` Helm release in `Components/ObservabilityStack.cs`:

```csharp
// Grafana Alert Secrets ConfigMap (contains Slack webhook)
var config = new Pulumi.Config();
var slackWebhookUrl = config.RequireSecret("slackWebhookUrl");

// Read contact-points template
var contactPointsYaml = System.IO.File.ReadAllText(
    System.IO.Path.Combine(
        System.IO.Directory.GetCurrentDirectory(),
        "..", "..", "copperiq-monitoring", "grafana-alerts", "contact-points.yaml"
    )
);

// Create ConfigMap with webhook injected
var grafanaAlertSecretsConfigMap = new Pulumi.Kubernetes.Core.V1.ConfigMap("grafana-alert-secrets", new()
{
    Metadata = new Pulumi.Kubernetes.Types.Inputs.Meta.V1.ObjectMetaArgs
    {
        Name = "grafana-contact-points",
        Namespace = "observability",
        Labels = new InputMap<string>
        {
            { "grafana_alert", "1" },
            { "app.kubernetes.io/name", "copperiq-monitoring" },
            { "app.kubernetes.io/component", "alert-secrets" }
        }
    },
    Data = new InputMap<string>
    {
        {
            "contact-points.yaml",
            slackWebhookUrl.Apply(url => contactPointsYaml.Replace("${SLACK_WEBHOOK_URL}", url))
        }
    }
}, new CustomResourceOptions
{
    Parent = this,
    Provider = aksCluster.Provider
});
```

### 3. Deploy Infrastructure

```bash
cd shared-hosting-infra
pulumi up -s accept-prod
```

This will:
- Update Grafana configuration (enable Unified Alerting)
- Create ConfigMap with Slack webhook injected
- Grafana sidecar will detect and provision contact points

### 4. Deploy copperiq-monitoring via ArgoCD

```bash
cd copperiq-monitoring
kubectl apply -f argocd-application.yaml --context accept-prod
```

Or add to app-of-apps repository.

This will:
- Create ConfigMaps for alert rules, folders, and notification policies
- Grafana sidecar detects all ConfigMaps with `grafana_alert=1` label
- Provisions all 56 alerts + contact points + routing policies

---

## Verification

```bash
# 1. Check Pulumi-managed ConfigMap exists
kubectl get configmap -n observability grafana-contact-points

# 2. Check ArgoCD-managed ConfigMaps exist
kubectl get configmap -n observability -l grafana_alert=1

# 3. Check Grafana logs for provisioning
kubectl logs -n observability deployment/prometheus-grafana -c grafana --tail=100 | grep -i provision

# 4. View alerts in Grafana UI
# https://monitoring.copperiq.com → Alerting → Alert Rules

# 5. Test Slack notification
# Grafana UI → Alerting → Contact Points → slack-infra-alerts → Test
```

---

## Troubleshooting

### ConfigMap not created by Pulumi

Check Pulumi config:
```bash
pulumi config get slackWebhookUrl -s accept-prod
# Should show: [secret]
```

Check file path is correct:
```bash
cd shared-hosting-infra
ls ../copperiq-monitoring/grafana-alerts/contact-points.yaml
```

### Grafana not picking up ConfigMap

Check label exists:
```bash
kubectl get configmap grafana-contact-points -n observability -o jsonpath='{.metadata.labels}'
# Should include: "grafana_alert":"1"
```

Check Grafana sidecar logs:
```bash
kubectl logs -n observability deployment/prometheus-grafana -c grafana-sc-alerts
```

### Webhook URL not replaced

Check ConfigMap data:
```bash
kubectl get configmap grafana-contact-points -n observability -o jsonpath='{.data.contact-points\.yaml}' | grep url
# Should show actual webhook, NOT ${SLACK_WEBHOOK_URL}
```

---

## Security Notes

- ✅ Webhook stored encrypted in Pulumi state
- ✅ Webhook injected at deployment time (not in Git)
- ✅ ConfigMap data visible in cluster (etcd encrypted at rest)
- 🔐 For extra security: Use Sealed Secrets or External Secrets Operator

---

## Alternative: Sealed Secrets (More Secure)

If you want to avoid storing webhook in ConfigMap:

1. Create SealedSecret with webhook
2. Mount Secret as volume in Grafana pod
3. Use environment variable substitution

See `grafana-alerts/SECRETS.md` for details.
