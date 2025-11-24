#!/usr/bin/env node
/**
 * Fix RabbitMQ dashboard to use namespace template variable instead of hardcoded namespaces.
 */
import { readFileSync, writeFileSync } from 'fs';

function fixRabbitMQDashboard(inputFile, outputFile) {
    const dashboard = JSON.parse(readFileSync(inputFile, 'utf-8'));
    
    // Add namespace template variable
    const namespaceVar = {
        current: {
            selected: true,
            text: ["All"],
            value: ["$__all"]
        },
        hide: 0,
        includeAll: true,
        label: "Namespace",
        multi: true,
        name: "namespace",
        options: [],
        query: {
            query: "label_values(rabbitmq_queue_messages, namespace)",
            refId: "StandardVariableQuery"
        },
        refresh: 1,
        regex: "",
        skipUrlSync: false,
        sort: 1,
        type: "query"
    };
    
    // Add namespace variable to templating list
    if (!dashboard.templating) {
        dashboard.templating = { list: [] };
    }
    
    // Check if namespace variable already exists
    const hasNamespace = dashboard.templating.list.some(v => v.name === 'namespace');
    if (!hasNamespace) {
        dashboard.templating.list.push(namespaceVar);
    }
    
    // Function to update query expressions
    function updateExpr(expr) {
        if (!expr || typeof expr !== 'string') {
            return expr;
        }
        
        // Replace hardcoded namespace filters with variable
        // Pattern: namespace="n8n-dev" or namespace="n8n-prod"
        expr = expr.replace(/namespace="[^"]*"/g, 'namespace=~"$namespace"');
        expr = expr.replace(/namespace='[^']*'/g, 'namespace=~"$namespace"');
        
        return expr;
    }
    
    // Update all panel queries
    if (dashboard.panels) {
        for (const panel of dashboard.panels) {
            if (panel.targets) {
                for (const target of panel.targets) {
                    if (target.expr) {
                        target.expr = updateExpr(target.expr);
                    }
                }
            }
            
            // Handle row panels with nested panels
            if (panel.type === 'row' && panel.panels) {
                for (const subpanel of panel.panels) {
                    if (subpanel.targets) {
                        for (const target of subpanel.targets) {
                            if (target.expr) {
                                target.expr = updateExpr(target.expr);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Write updated dashboard
    writeFileSync(outputFile, JSON.stringify(dashboard, null, 2), 'utf-8');
    
    console.log('✅ Updated RabbitMQ dashboard');
    console.log('   - Added namespace template variable');
    console.log('   - Replaced hardcoded namespace filters with $namespace variable');
}

const inputFile = 'helm/dashboards/rabbitmq.json';
const outputFile = 'helm/dashboards/rabbitmq.json';

fixRabbitMQDashboard(inputFile, outputFile);
