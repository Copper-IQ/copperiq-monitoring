#!/usr/bin/env python3
"""
Complete n8n Workflow Processing Dashboard
Adds Queue Health, Throughput, Worker Health, RabbitMQ, and Bottleneck Analysis panels
"""

import json

dashboard_path = "helm/dashboards/n8n-workflow-processing.json"

# Load existing dashboard
with open(dashboard_path, 'r') as f:
    dashboard = json.load(f)

# Get current panel count and max Y position
current_panels = dashboard.get('panels', [])
panel_id = len(current_panels) + 1
current_y = max([p['gridPos']['y'] + p['gridPos']['h'] for p in current_panels]) if current_panels else 0

# Queue Health Row (y=4)
queue_health_panels = [
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Jobs waiting in Bull queue over time",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "palette-classic"},
                "custom": {
                    "axisCenteredZero": False,
                    "axisColorMode": "text",
                    "axisLabel": "",
                    "axisPlacement": "auto",
                    "barAlignment": 0,
                    "drawStyle": "line",
                    "fillOpacity": 10,
                    "gradientMode": "none",
                    "hideFrom": {"tooltip": False, "viz": False, "legend": False},
                    "lineInterpolation": "linear",
                    "lineWidth": 1,
                    "pointSize": 5,
                    "scaleDistribution": {"type": "linear"},
                    "showPoints": "never",
                    "spanNulls": False,
                    "stacking": {"mode": "none", "group": "A"},
                    "thresholdsStyle": {"mode": "off"}
                },
                "mappings": [],
                "thresholds": {
                    "mode": "absolute",
                    "steps": [
                        {"color": "green", "value": None},
                        {"color": "red", "value": 80}
                    ]
                },
                "unit": "short"
            }
        },
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": current_y},
        "id": panel_id,
        "options": {
            "legend": {
                "calcs": ["last", "max"],
                "displayMode": "table",
                "placement": "bottom"
            },
            "tooltip": {"mode": "single", "sort": "none"}
        },
        "targets": [
            {
                "expr": "n8n_scaling_mode_queue_jobs_waiting{namespace=\"$namespace\"}",
                "legendFormat": "Jobs Waiting",
                "refId": "A"
            }
        ],
        "title": "Bull Queue - Jobs Waiting",
        "type": "timeseries"
    },
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Jobs currently being processed by workers",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "palette-classic"},
                "custom": {
                    "axisCenteredZero": False,
                    "axisColorMode": "text",
                    "axisLabel": "",
                    "axisPlacement": "auto",
                    "barAlignment": 0,
                    "drawStyle": "line",
                    "fillOpacity": 10,
                    "gradientMode": "none",
                    "hideFrom": {"tooltip": False, "viz": False, "legend": False},
                    "lineInterpolation": "linear",
                    "lineWidth": 1,
                    "pointSize": 5,
                    "scaleDistribution": {"type": "linear"},
                    "showPoints": "never",
                    "spanNulls": False,
                    "stacking": {"mode": "none", "group": "A"},
                    "thresholdsStyle": {"mode": "off"}
                },
                "mappings": [],
                "thresholds": {
                    "mode": "absolute",
                    "steps": [
                        {"color": "green", "value": None}
                    ]
                },
                "unit": "short"
            }
        },
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": current_y},
        "id": panel_id + 1,
        "options": {
            "legend": {
                "calcs": ["last", "max"],
                "displayMode": "table",
                "placement": "bottom"
            },
            "tooltip": {"mode": "single", "sort": "none"}
        },
        "targets": [
            {
                "expr": "n8n_scaling_mode_queue_jobs_active{namespace=\"$namespace\"}",
                "legendFormat": "Jobs Active",
                "refId": "A"
            }
        ],
        "title": "Bull Queue - Jobs Active",
        "type": "timeseries"
    }
]

panel_id += 2
current_y += 8

# Throughput Row (y=12)
throughput_panels = [
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Job completion and failure rates",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "palette-classic"},
                "custom": {
                    "axisCenteredZero": False,
                    "axisColorMode": "text",
                    "axisLabel": "",
                    "axisPlacement": "auto",
                    "barAlignment": 0,
                    "drawStyle": "line",
                    "fillOpacity": 10,
                    "gradientMode": "none",
                    "hideFrom": {"tooltip": False, "viz": False, "legend": False},
                    "lineInterpolation": "linear",
                    "lineWidth": 1,
                    "pointSize": 5,
                    "scaleDistribution": {"type": "linear"},
                    "showPoints": "never",
                    "spanNulls": False,
                    "stacking": {"mode": "none", "group": "A"},
                    "thresholdsStyle": {"mode": "off"}
                },
                "mappings": [],
                "thresholds": {
                    "mode": "absolute",
                    "steps": [{"color": "green", "value": None}]
                },
                "unit": "ops"
            }
        },
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": current_y},
        "id": panel_id,
        "options": {
            "legend": {
                "calcs": ["mean", "last"],
                "displayMode": "table",
                "placement": "bottom"
            },
            "tooltip": {"mode": "multi", "sort": "none"}
        },
        "targets": [
            {
                "expr": "rate(n8n_scaling_mode_queue_jobs_completed{namespace=\"$namespace\"}[5m])",
                "legendFormat": "Completed/sec",
                "refId": "A"
            },
            {
                "expr": "rate(n8n_scaling_mode_queue_jobs_failed{namespace=\"$namespace\"}[5m])",
                "legendFormat": "Failed/sec",
                "refId": "B"
            }
        ],
        "title": "Job Throughput",
        "type": "timeseries"
    },
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Success rate percentage",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "thresholds"},
                "mappings": [],
                "max": 100,
                "min": 0,
                "thresholds": {
                    "mode": "absolute",
                    "steps": [
                        {"color": "red", "value": None},
                        {"color": "yellow", "value": 90},
                        {"color": "green", "value": 95}
                    ]
                },
                "unit": "percent"
            }
        },
        "gridPos": {"h": 8, "w": 6, "x": 12, "y": current_y},
        "id": panel_id + 1,
        "options": {
            "orientation": "auto",
            "reduceOptions": {
                "values": False,
                "calcs": ["lastNotNull"],
                "fields": ""
            },
            "showThresholdLabels": False,
            "showThresholdMarkers": True
        },
        "pluginVersion": "10.0.0",
        "targets": [
            {
                "expr": "(rate(n8n_scaling_mode_queue_jobs_completed{namespace=\"$namespace\"}[5m]) / (rate(n8n_scaling_mode_queue_jobs_completed{namespace=\"$namespace\"}[5m]) + rate(n8n_scaling_mode_queue_jobs_failed{namespace=\"$namespace\"}[5m]))) * 100",
                "refId": "A"
            }
        ],
        "title": "Success Rate",
        "type": "gauge"
    },
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Total jobs completed since start",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "thresholds"},
                "mappings": [],
                "thresholds": {
                    "mode": "absolute",
                    "steps": [{"color": "green", "value": None}]
                },
                "unit": "short"
            }
        },
        "gridPos": {"h": 4, "w": 6, "x": 18, "y": current_y},
        "id": panel_id + 2,
        "options": {
            "colorMode": "value",
            "graphMode": "area",
            "justifyMode": "center",
            "orientation": "auto",
            "reduceOptions": {
                "values": False,
                "calcs": ["lastNotNull"],
                "fields": ""
            },
            "textMode": "value_and_name"
        },
        "pluginVersion": "10.0.0",
        "targets": [
            {
                "expr": "n8n_scaling_mode_queue_jobs_completed{namespace=\"$namespace\"}",
                "refId": "A"
            }
        ],
        "title": "Total Completed",
        "type": "stat"
    },
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Total jobs failed since start",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "thresholds"},
                "mappings": [],
                "thresholds": {
                    "mode": "absolute",
                    "steps": [
                        {"color": "green", "value": None},
                        {"color": "red", "value": 1}
                    ]
                },
                "unit": "short"
            }
        },
        "gridPos": {"h": 4, "w": 6, "x": 18, "y": current_y + 4},
        "id": panel_id + 3,
        "options": {
            "colorMode": "value",
            "graphMode": "area",
            "justifyMode": "center",
            "orientation": "auto",
            "reduceOptions": {
                "values": False,
                "calcs": ["lastNotNull"],
                "fields": ""
            },
            "textMode": "value_and_name"
        },
        "pluginVersion": "10.0.0",
        "targets": [
            {
                "expr": "n8n_scaling_mode_queue_jobs_failed{namespace=\"$namespace\"}",
                "refId": "A"
            }
        ],
        "title": "Total Failed",
        "type": "stat"
    }
]

panel_id += 4
current_y += 8

# Worker Health Row (y=20)
worker_health_panels = [
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Memory usage per worker pod",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "palette-classic"},
                "custom": {
                    "axisCenteredZero": False,
                    "axisColorMode": "text",
                    "axisLabel": "",
                    "axisPlacement": "auto",
                    "barAlignment": 0,
                    "drawStyle": "line",
                    "fillOpacity": 10,
                    "gradientMode": "none",
                    "hideFrom": {"tooltip": False, "viz": False, "legend": False},
                    "lineInterpolation": "linear",
                    "lineWidth": 1,
                    "pointSize": 5,
                    "scaleDistribution": {"type": "linear"},
                    "showPoints": "never",
                    "spanNulls": False,
                    "stacking": {"mode": "none", "group": "A"},
                    "thresholdsStyle": {"mode": "off"}
                },
                "mappings": [],
                "thresholds": {
                    "mode": "absolute",
                    "steps": [{"color": "green", "value": None}]
                },
                "unit": "bytes"
            }
        },
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": current_y},
        "id": panel_id,
        "options": {
            "legend": {
                "calcs": ["mean", "last"],
                "displayMode": "table",
                "placement": "bottom"
            },
            "tooltip": {"mode": "multi", "sort": "none"}
        },
        "targets": [
            {
                "expr": "n8n_process_resident_memory_bytes{namespace=\"$namespace\",pod=~\".*worker.*\"}",
                "legendFormat": "{{pod}}",
                "refId": "A"
            }
        ],
        "title": "Worker Memory Usage",
        "type": "timeseries"
    },
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Event loop lag P99 per worker - high values indicate worker saturation",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "palette-classic"},
                "custom": {
                    "axisCenteredZero": False,
                    "axisColorMode": "text",
                    "axisLabel": "",
                    "axisPlacement": "auto",
                    "barAlignment": 0,
                    "drawStyle": "line",
                    "fillOpacity": 10,
                    "gradientMode": "none",
                    "hideFrom": {"tooltip": False, "viz": False, "legend": False},
                    "lineInterpolation": "linear",
                    "lineWidth": 1,
                    "pointSize": 5,
                    "scaleDistribution": {"type": "linear"},
                    "showPoints": "never",
                    "spanNulls": False,
                    "stacking": {"mode": "none", "group": "A"},
                    "thresholdsStyle": {"mode": "line"}
                },
                "mappings": [],
                "thresholds": {
                    "mode": "absolute",
                    "steps": [
                        {"color": "green", "value": None},
                        {"color": "yellow", "value": 0.1},
                        {"color": "red", "value": 0.5}
                    ]
                },
                "unit": "s"
            }
        },
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": current_y},
        "id": panel_id + 1,
        "options": {
            "legend": {
                "calcs": ["mean", "last", "max"],
                "displayMode": "table",
                "placement": "bottom"
            },
            "tooltip": {"mode": "multi", "sort": "none"}
        },
        "targets": [
            {
                "expr": "n8n_nodejs_eventloop_lag_p99_seconds{namespace=\"$namespace\",pod=~\".*worker.*\"}",
                "legendFormat": "{{pod}}",
                "refId": "A"
            }
        ],
        "title": "Worker Event Loop Lag (P99)",
        "type": "timeseries"
    }
]

panel_id += 2
current_y += 8

# RabbitMQ Row (y=28)
rabbitmq_panels = [
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Messages ready to be consumed per queue",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "palette-classic"},
                "custom": {
                    "axisCenteredZero": False,
                    "axisColorMode": "text",
                    "axisLabel": "",
                    "axisPlacement": "auto",
                    "barAlignment": 0,
                    "drawStyle": "line",
                    "fillOpacity": 10,
                    "gradientMode": "none",
                    "hideFrom": {"tooltip": False, "viz": False, "legend": False},
                    "lineInterpolation": "linear",
                    "lineWidth": 1,
                    "pointSize": 5,
                    "scaleDistribution": {"type": "linear"},
                    "showPoints": "never",
                    "spanNulls": False,
                    "stacking": {"mode": "normal", "group": "A"},
                    "thresholdsStyle": {"mode": "off"}
                },
                "mappings": [],
                "thresholds": {
                    "mode": "absolute",
                    "steps": [{"color": "green", "value": None}]
                },
                "unit": "short"
            }
        },
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": current_y},
        "id": panel_id,
        "options": {
            "legend": {
                "calcs": ["mean", "last", "max"],
                "displayMode": "table",
                "placement": "bottom"
            },
            "tooltip": {"mode": "multi", "sort": "none"}
        },
        "targets": [
            {
                "expr": "rabbitmq_queue_messages_ready{namespace=\"$namespace\"}",
                "legendFormat": "{{queue}}",
                "refId": "A"
            }
        ],
        "title": "RabbitMQ - Messages Ready",
        "type": "timeseries"
    },
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Number of active consumers per queue",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "palette-classic"},
                "custom": {
                    "axisCenteredZero": False,
                    "axisColorMode": "text",
                    "axisLabel": "",
                    "axisPlacement": "auto",
                    "barAlignment": 0,
                    "drawStyle": "line",
                    "fillOpacity": 10,
                    "gradientMode": "none",
                    "hideFrom": {"tooltip": False, "viz": False, "legend": False},
                    "lineInterpolation": "stepAfter",
                    "lineWidth": 1,
                    "pointSize": 5,
                    "scaleDistribution": {"type": "linear"},
                    "showPoints": "never",
                    "spanNulls": False,
                    "stacking": {"mode": "none", "group": "A"},
                    "thresholdsStyle": {"mode": "off"}
                },
                "mappings": [],
                "thresholds": {
                    "mode": "absolute",
                    "steps": [
                        {"color": "green", "value": None},
                        {"color": "red", "value": 0}
                    ]
                },
                "unit": "short"
            }
        },
        "gridPos": {"h": 8, "w": 6, "x": 12, "y": current_y},
        "id": panel_id + 1,
        "options": {
            "legend": {
                "calcs": ["last"],
                "displayMode": "table",
                "placement": "bottom"
            },
            "tooltip": {"mode": "multi", "sort": "none"}
        },
        "targets": [
            {
                "expr": "rabbitmq_queue_consumers{namespace=\"$namespace\"}",
                "legendFormat": "{{queue}}",
                "refId": "A"
            }
        ],
        "title": "RabbitMQ - Consumers",
        "type": "timeseries"
    },
    {
        "datasource": {"type": "prometheus", "uid": "prometheus"},
        "description": "Consumer utilization (0-1) - closer to 1 means consumers are saturated",
        "fieldConfig": {
            "defaults": {
                "color": {"mode": "palette-classic"},
                "custom": {
                    "axisCenteredZero": False,
                    "axisColorMode": "text",
                    "axisLabel": "",
                    "axisPlacement": "auto",
                    "barAlignment": 0,
                    "drawStyle": "line",
                    "fillOpacity": 10,
                    "gradientMode": "none",
                    "hideFrom": {"tooltip": False, "viz": False, "legend": False},
                    "lineInterpolation": "linear",
                    "lineWidth": 1,
                    "pointSize": 5,
                    "scaleDistribution": {"type": "linear"},
                    "showPoints": "never",
                    "spanNulls": False,
                    "stacking": {"mode": "none", "group": "A"},
                    "thresholdsStyle": {"mode": "line"}
                },
                "mappings": [],
                "max": 1,
                "min": 0,
                "thresholds": {
                    "mode": "absolute",
                    "steps": [
                        {"color": "green", "value": None},
                        {"color": "yellow", "value": 0.8},
                        {"color": "red", "value": 0.95}
                    ]
                },
                "unit": "percentunit"
            }
        },
        "gridPos": {"h": 8, "w": 6, "x": 18, "y": current_y},
        "id": panel_id + 2,
        "options": {
            "legend": {
                "calcs": ["mean", "last"],
                "displayMode": "table",
                "placement": "bottom"
            },
            "tooltip": {"mode": "multi", "sort": "none"}
        },
        "targets": [
            {
                "expr": "rabbitmq_queue_consumer_utilisation{namespace=\"$namespace\"}",
                "legendFormat": "{{queue}}",
                "refId": "A"
            }
        ],
        "title": "RabbitMQ - Consumer Utilization",
        "type": "timeseries"
    }
]

# Add all new panels
dashboard['panels'].extend(queue_health_panels)
dashboard['panels'].extend(throughput_panels)
dashboard['panels'].extend(worker_health_panels)
dashboard['panels'].extend(rabbitmq_panels)

# Save dashboard
with open(dashboard_path, 'w') as f:
    json.dump(dashboard, f, indent=2)

print("✅ All panel rows added to dashboard:")
print(f"   - Queue Health Row (2 panels)")
print(f"   - Throughput Row (4 panels)")
print(f"   - Worker Health Row (2 panels)")
print(f"   - RabbitMQ Row (3 panels)")
print(f"\nTotal panels: {len(dashboard['panels'])}")
print(f"Dashboard saved to: {dashboard_path}")
