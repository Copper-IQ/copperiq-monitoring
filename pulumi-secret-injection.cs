// Add this to ObservabilityStack.cs after the kube-prometheus-stack Helm release

// Store Slack webhook URL as Pulumi secret
var config = new Pulumi.Config();
var slackWebhookUrl = config.RequireSecret("slackWebhookUrl");

// Read the contact-points template
var contactPointsTemplate = File.ReadAllText(
    Path.Combine("..", "..", "copperiq-monitoring", "grafana-alerts", "contact-points.yaml")
);

// Create ConfigMap with webhook injected
var grafanaAlertSecretsConfigMap = new Pulumi.Kubernetes.Core.V1.ConfigMap("grafana-alert-secrets", new()
{
    Metadata = new Pulumi.Kubernetes.Types.Inputs.Meta.V1.ObjectMetaArgs
    {
        Name = "grafana-alert-secrets",
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
            slackWebhookUrl.Apply(url => contactPointsTemplate.Replace("${SLACK_WEBHOOK_URL}", url))
        }
    }
}, new CustomResourceOptions
{
    Parent = this,
    DependsOn = { /* Add dependency on ArgoCD application if needed */ }
});

// OR: Use Pulumi Config for less secure (but simpler) approach
// Set via: pulumi config set slackWebhookUrl https://hooks.slack.com/services/... --secret

// The ConfigMap will be picked up by Grafana sidecar due to grafana_alert=1 label
