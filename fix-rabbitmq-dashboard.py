#!/usr/bin/env python3
"""
Fix RabbitMQ dashboard to use namespace template variable instead of hardcoded namespaces.
"""
import json
import re
import sys

def fix_rabbitmq_dashboard(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        dashboard = json.load(f)
    
    # Add namespace template variable
    namespace_var = {
        "current": {
            "selected": True,
            "text": ["All"],
            "value": ["$__all"]
        },
        "hide": 0,
        "includeAll": True,
        "label": "Namespace",
        "multi": True,
        "name": "namespace",
        "options": [],
        "query": {
            "query": "label_values(rabbitmq_queue_messages, namespace)",
            "refId": "StandardVariableQuery"
        },
        "refresh": 1,
        "regex": "",
        "skipUrlSync": False,
        "sort": 1,
        "type": "query"
    }
    
    # Add namespace variable to templating list
    if 'templating' not in dashboard:
        dashboard['templating'] = {'list': []}
    
    # Check if namespace variable already exists
    has_namespace = any(v.get('name') == 'namespace' for v in dashboard['templating']['list'])
    if not has_namespace:
        dashboard['templating']['list'].append(namespace_var)
    
    # Function to update query expressions
    def update_expr(expr):
        if not expr or not isinstance(expr, str):
            return expr
        
        # Replace hardcoded namespace filters with variable
        # Pattern: namespace="n8n-dev" or namespace="n8n-prod"
        expr = re.sub(r'namespace="[^"]*"', 'namespace=~"$namespace"', expr)
        expr = re.sub(r"namespace='[^']*'", 'namespace=~"$namespace"', expr)
        
        # Also handle namespace filters in curly braces
        expr = re.sub(r'\{([^}]*?)namespace="[^"]*"([^}]*?)\}', r'{\1namespace=~"$namespace"\2}', expr)
        
        return expr
    
    # Update all panel queries
    if 'panels' in dashboard:
        for panel in dashboard['panels']:
            if 'targets' in panel:
                for target in panel['targets']:
                    if 'expr' in target:
                        target['expr'] = update_expr(target['expr'])
            
            # Handle row panels with nested panels
            if panel.get('type') == 'row' and 'panels' in panel:
                for subpanel in panel['panels']:
                    if 'targets' in subpanel:
                        for target in subpanel['targets']:
                            if 'expr' in target:
                                target['expr'] = update_expr(target['expr'])
    
    # Write updated dashboard
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(dashboard, f, indent=2)
    
    print(f"✅ Updated RabbitMQ dashboard")
    print(f"   - Added namespace template variable")
    print(f"   - Replaced hardcoded namespace filters with $namespace variable")

if __name__ == '__main__':
    input_file = 'helm/dashboards/rabbitmq.json'
    output_file = 'helm/dashboards/rabbitmq.json'
    
    fix_rabbitmq_dashboard(input_file, output_file)
