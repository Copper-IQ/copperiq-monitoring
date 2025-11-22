#!/usr/bin/env python3
"""
Convert PrometheusRule CRDs to Grafana Unified Alerting format.

This script reads PrometheusRule YAML files from alerts/ and converts them
to Grafana alert provisioning format in grafana-alerts/.

Usage:
    python convert-alerts.py
"""

import yaml
import re
from pathlib import Path
from typing import Dict, List, Any

# Mapping of components to Grafana folders
FOLDER_MAPPING = {
    'aks': 'infrastructure',
    'node': 'infrastructure',
    'cluster': 'infrastructure',
    'postgresql': 'databases',
    'mysql': 'databases',
    'rabbitmq': 'applications',
    'n8n': 'applications',
    'argocd': 'applications',
    'cert-manager': 'applications',
    'external-dns': 'applications',
    'content-platform': 'applications',
}

def determine_folder(alert_rule: Dict[str, Any]) -> str:
    """Determine which Grafana folder this alert belongs to."""
    labels = alert_rule.get('labels', {})
    component = labels.get('component', '').lower()
    category = labels.get('category', '').lower()
    
    # Direct component mapping
    for key, folder in FOLDER_MAPPING.items():
        if key in component:
            return folder
    
    # Fallback to category
    if category == 'infrastructure':
        return 'infrastructure'
    elif category == 'database':
        return 'databases'
    elif category == 'application':
        return 'applications'
    
    # Default
    return 'applications'

def generate_uid(alert_name: str) -> str:
    """Generate a UID from alert name (max 40 chars, only alphanumeric, -, _)."""
    # Convert to lowercase, replace spaces with hyphens
    uid = re.sub(r'[^a-z0-9_-]', '-', alert_name.lower())
    # Remove duplicate hyphens
    uid = re.sub(r'-+', '-', uid)
    # Trim to 40 chars
    return uid[:40].rstrip('-')

def convert_promql_to_grafana_query(expr: str, rule_name: str) -> List[Dict[str, Any]]:
    """
    Convert a PromQL expression to Grafana query structure.
    
    Grafana needs:
    - Query (refId: A) - Prometheus query
    - Reduce (refId: B) - Reduces time series to single value
    - Threshold (refId: C) - Math expression for condition
    """
    
    # Extract comparison operator and threshold from expression
    # Common patterns: expr > N, expr < N, expr == N
    comparison_match = re.search(r'([<>=!]+)\s*(\d+\.?\d*)\s*$', expr)
    
    if comparison_match:
        # Expression has inline comparison - split it
        operator = comparison_match.group(1)
        threshold = comparison_match.group(2)
        base_expr = expr[:comparison_match.start()].strip()
        
        # Map operator for math expression
        math_expr = f"$B {operator} {threshold}"
    else:
        # No inline comparison - use > 0 as default
        base_expr = expr.strip()
        math_expr = "$B > 0"
    
    return [
        {
            'refId': 'A',
            'relativeTimeRange': {
                'from': 600,  # 10 minutes
                'to': 0
            },
            'datasourceUid': 'prometheus',  # Will be templated in Helm
            'model': {
                'expr': base_expr,
                'refId': 'A',
                'datasource': {
                    'type': 'prometheus',
                    'uid': 'prometheus'
                },
                'intervalMs': 1000,
                'maxDataPoints': 43200
            }
        },
        {
            'refId': 'B',
            'relativeTimeRange': {
                'from': 0,
                'to': 0
            },
            'datasourceUid': '__expr__',
            'model': {
                'type': 'reduce',
                'expression': 'A',
                'reducer': 'last',
                'refId': 'B',
                'datasource': {
                    'type': '__expr__',
                    'uid': '__expr__'
                }
            }
        },
        {
            'refId': 'C',
            'relativeTimeRange': {
                'from': 0,
                'to': 0
            },
            'datasourceUid': '__expr__',
            'model': {
                'type': 'math',
                'expression': math_expr,
                'refId': 'C',
                'datasource': {
                    'type': '__expr__',
                    'uid': '__expr__'
                }
            }
        }
    ]

def convert_rule(rule: Dict[str, Any], group_name: str) -> Dict[str, Any]:
    """Convert a single PrometheusRule to Grafana alert rule."""
    alert_name = rule['alert']
    uid = generate_uid(alert_name)
    
    # Parse PromQL expression
    expr = rule['expr'].strip()
    if expr.startswith('|\n'):
        # Multi-line expression
        expr = ' '.join(line.strip() for line in expr.split('\n') if line.strip() and not line.strip().startswith('|'))
    
    # Convert to Grafana query structure
    data = convert_promql_to_grafana_query(expr, alert_name)
    
    # Parse 'for' duration
    for_duration = rule.get('for', '0s')
    
    # Convert annotations and labels
    annotations = rule.get('annotations', {})
    labels = rule.get('labels', {})
    
    # Determine folder
    folder = determine_folder(rule)
    
    return {
        'uid': uid,
        'title': alert_name,
        'condition': 'C',  # Always the math expression
        'for': for_duration,
        'noDataState': 'OK',
        'execErrState': 'Alerting',
        'annotations': annotations,
        'labels': labels,
        'data': data
    }

def convert_prometheus_rule(input_file: Path, output_dir: Path):
    """Convert a PrometheusRule YAML to Grafana alert format."""
    with open(input_file) as f:
        prom_rule = yaml.safe_load(f)
    
    spec = prom_rule['spec']
    groups = spec['groups']
    
    # Convert each group
    grafana_groups = []
    for group in groups:
        group_name = group['name']
        interval = group.get('interval', '30s')
        rules = group.get('rules', [])
        
        # Determine folder from first rule
        folder = 'applications'  # default
        if rules:
            folder = determine_folder(rules[0])
        
        grafana_rules = []
        for rule in rules:
            if 'alert' in rule:  # Skip recording rules
                grafana_rules.append(convert_rule(rule, group_name))
        
        grafana_groups.append({
            'orgId': 1,
            'name': group_name,
            'folder': folder,
            'interval': interval,
            'rules': grafana_rules
        })
    
    # Write output file
    output_file = output_dir / input_file.name
    output_data = {
        'apiVersion': 1,
        'groups': grafana_groups
    }
    
    with open(output_file, 'w') as f:
        f.write(f"# Grafana Unified Alerting Rules: {input_file.stem}\n")
        f.write(f"# Converted from PrometheusRule: {prom_rule['metadata']['name']}\n")
        yaml.dump(output_data, f, default_flow_style=False, sort_keys=False, width=120)
    
    print(f"✓ Converted {input_file.name} -> {output_file.name} ({len(grafana_rules)} alerts)")
    return len(grafana_rules)

def main():
    """Main conversion function."""
    alerts_dir = Path('alerts')
    output_dir = Path('grafana-alerts')
    output_dir.mkdir(exist_ok=True)
    
    # Get all PrometheusRule files
    prom_files = list(alerts_dir.glob('*.yaml'))
    
    print(f"\nConverting {len(prom_files)} PrometheusRule files...\n")
    
    total_alerts = 0
    for prom_file in sorted(prom_files):
        try:
            count = convert_prometheus_rule(prom_file, output_dir)
            total_alerts += count
        except Exception as e:
            print(f"✗ Error converting {prom_file.name}: {e}")
    
    print(f"\n✓ Successfully converted {total_alerts} alerts across {len(prom_files)} files")
    print(f"Output directory: {output_dir.absolute()}")

if __name__ == '__main__':
    main()
