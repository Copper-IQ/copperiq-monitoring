# Build n8n Workflow Processing Dashboard
# Constructs complete Grafana dashboard JSON with all panels

$dashboardPath = "helm/dashboards/n8n-workflow-processing.json"

# Load base dashboard
$dashboard = Get-Content $dashboardPath | ConvertFrom-Json

# Overview Row Panels
$overviewPanels = @(
    # Active Workflows
    @{
        datasource = @{ type = "prometheus"; uid = "prometheus" }
        description = "Total number of active workflows"
        fieldConfig = @{
            defaults = @{
                color = @{ mode = "thresholds" }
                mappings = @()
                thresholds = @{
                    mode = "absolute"
                    steps = @(
                        @{ color = "green"; value = $null }
                        @{ color = "yellow"; value = 5 }
                        @{ color = "red"; value = 20 }
                    )
                }
                unit = "short"
            }
        }
        gridPos = @{ h = 4; w = 4; x = 0; y = 0 }
        id = 1
        options = @{
            colorMode = "value"
            graphMode = "area"
            justifyMode = "center"
            orientation = "auto"
            reduceOptions = @{
                calcs = @("lastNotNull")
                fields = ""
                values = $false
            }
            textMode = "value_and_name"
        }
        pluginVersion = "10.0.0"
        targets = @(
            @{
                expr = "n8n_active_workflow_count{namespace=`"`$namespace`"}"
                refId = "A"
            }
        )
        title = "Active Workflows"
        type = "stat"
    },
    
    # Queue Jobs Waiting
    @{
        datasource = @{ type = "prometheus"; uid = "prometheus" }
        description = "Jobs waiting in Bull queue"
        fieldConfig = @{
            defaults = @{
                color = @{ mode = "thresholds" }
                mappings = @()
                thresholds = @{
                    mode = "absolute"
                    steps = @(
                        @{ color = "green"; value = $null }
                        @{ color = "yellow"; value = 10 }
                        @{ color = "red"; value = 50 }
                    )
                }
                unit = "short"
            }
        }
        gridPos = @{ h = 4; w = 4; x = 4; y = 0 }
        id = 2
        options = @{
            colorMode = "value"
            graphMode = "area"
            justifyMode = "center"
            orientation = "auto"
            reduceOptions = @{
                calcs = @("lastNotNull")
                fields = ""
                values = $false
            }
            textMode = "value_and_name"
        }
        pluginVersion = "10.0.0"
        targets = @(
            @{
                expr = "n8n_scaling_mode_queue_jobs_waiting{namespace=`"`$namespace`"}"
                refId = "A"
            }
        )
        title = "Queue Jobs Waiting"
        type = "stat"
    },
    
    # Queue Jobs Active
    @{
        datasource = @{ type = "prometheus"; uid = "prometheus" }
        description = "Jobs currently being processed"
        fieldConfig = @{
            defaults = @{
                color = @{ mode = "thresholds" }
                mappings = @()
                thresholds = @{
                    mode = "absolute"
                    steps = @(
                        @{ color = "green"; value = $null }
                        @{ color = "yellow"; value = 5 }
                        @{ color = "red"; value = 10 }
                    )
                }
                unit = "short"
            }
        }
        gridPos = @{ h = 4; w = 4; x = 8; y = 0 }
        id = 3
        options = @{
            colorMode = "value"
            graphMode = "area"
            justifyMode = "center"
            orientation = "auto"
            reduceOptions = @{
                calcs = @("lastNotNull")
                fields = ""
                values = $false
            }
            textMode = "value_and_name"
        }
        pluginVersion = "10.0.0"
        targets = @(
            @{
                expr = "n8n_scaling_mode_queue_jobs_active{namespace=`"`$namespace`"}"
                refId = "A"
            }
        )
        title = "Queue Jobs Active"
        type = "stat"
    },
    
    # Worker Count
    @{
        datasource = @{ type = "prometheus"; uid = "prometheus" }
        description = "Number of n8n worker pods"
        fieldConfig = @{
            defaults = @{
                color = @{ mode = "thresholds" }
                mappings = @()
                thresholds = @{
                    mode = "absolute"
                    steps = @(
                        @{ color = "red"; value = $null }
                        @{ color = "yellow"; value = 1 }
                        @{ color = "green"; value = 2 }
                    )
                }
                unit = "short"
            }
        }
        gridPos = @{ h = 4; w = 4; x = 12; y = 0 }
        id = 4
        options = @{
            colorMode = "value"
            graphMode = "none"
            justifyMode = "center"
            orientation = "auto"
            reduceOptions = @{
                calcs = @("lastNotNull")
                fields = ""
                values = $false
            }
            textMode = "value_and_name"
        }
        pluginVersion = "10.0.0"
        targets = @(
            @{
                expr = "count(n8n_process_start_time_seconds{namespace=`"`$namespace`",pod=~`".*worker.*`"})"
                refId = "A"
            }
        )
        title = "Worker Count"
        type = "stat"
    },
    
    # RabbitMQ Queue Depth
    @{
        datasource = @{ type = "prometheus"; uid = "prometheus" }
        description = "Total messages in RabbitMQ queues"
        fieldConfig = @{
            defaults = @{
                color = @{ mode = "thresholds" }
                mappings = @()
                thresholds = @{
                    mode = "absolute"
                    steps = @(
                        @{ color = "green"; value = $null }
                        @{ color = "yellow"; value = 100 }
                        @{ color = "red"; value = 500 }
                    )
                }
                unit = "short"
            }
        }
        gridPos = @{ h = 4; w = 4; x = 16; y = 0 }
        id = 5
        options = @{
            colorMode = "value"
            graphMode = "area"
            justifyMode = "center"
            orientation = "auto"
            reduceOptions = @{
                calcs = @("lastNotNull")
                fields = ""
                values = $false
            }
            textMode = "value_and_name"
        }
        pluginVersion = "10.0.0"
        targets = @(
            @{
                expr = "sum(rabbitmq_queue_messages{namespace=`"`$namespace`"})"
                refId = "A"
            }
        )
        title = "RabbitMQ Queue Depth"
        type = "stat"
    }
)

# Add panels to dashboard
$dashboard.panels = $overviewPanels

# Save updated dashboard
$dashboard | ConvertTo-Json -Depth 100 | Set-Content $dashboardPath

Write-Host "✅ Overview panels added to dashboard" -ForegroundColor Green
Write-Host "Dashboard saved to: $dashboardPath" -ForegroundColor Cyan
