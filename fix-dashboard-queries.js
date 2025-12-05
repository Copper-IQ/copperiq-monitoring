#!/usr/bin/env node
/**
 * Fix Content Platform dashboard WebSocket panel queries.
 *
 * Changes:
 * 1. Add pod filter (pod=~"websocket-.*") to all WebSocket queries
 * 2. Fix queries to handle zero values gracefully (add "or vector(0)")
 * 3. Fix Let's Encrypt query (currently broken)
 */

const fs = require('fs');
const path = require('path');

// Load dashboard
const dashboardPath = path.join(__dirname, 'helm', 'dashboards', 'applications', 'content-platform.json');
const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));

// Query fixes mapping
const QUERY_FIXES = {
  // Connection Rate panel (ID 44)
  'rate(websocket_connections_established_total{namespace="$namespace"}[5m])': 
    'rate(websocket_connections_established_total{namespace="$namespace", pod=~"websocket-.*"}[5m]) or vector(0)',
  
  // Disconnection Rate panel (ID 45)
  'rate(websocket_connections_closed_total{namespace="$namespace"}[5m])':
    'rate(websocket_connections_closed_total{namespace="$namespace", pod=~"websocket-.*"}[5m]) or vector(0)',
  
  // Active Connections panel (ID 43)
  'websocket_connections_total{namespace="$namespace"}':
    'websocket_connections_total{namespace="$namespace", pod=~"websocket-.*"}',
  
  // Active Rooms panel (ID 46)
  'websocket_rooms_total{namespace="$namespace"}':
    'websocket_rooms_total{namespace="$namespace", pod=~"websocket-.*"}',
  
  // Redis Message Rate panel (ID 47)
  'rate(websocket_redis_messages_total{namespace="$namespace"}[5m])':
    'rate(websocket_redis_messages_total{namespace="$namespace", pod=~"websocket-.*"}[5m]) or vector(0)',
  
  // Broadcast Rate panel (ID 48)
  'rate(websocket_broadcasts_total{namespace="$namespace"}[5m])':
    'rate(websocket_broadcasts_total{namespace="$namespace", pod=~"websocket-.*"}[5m]) or vector(0)',
  
  // Auth Failures panel (ID 49)
  'increase(websocket_auth_failures_total{namespace="$namespace"}[5m])':
    'increase(websocket_auth_failures_total{namespace="$namespace", pod=~"websocket-.*"}[5m]) or vector(0)',
  
  // Subscription Errors panel (ID 50)
  'increase(websocket_subscription_errors_total{namespace="$namespace"}[5m])':
    'increase(websocket_subscription_errors_total{namespace="$namespace", pod=~"websocket-.*"}[5m]) or vector(0)',
  
  // Let's Encrypt Query Fix (ID 70) - completely wrong query
  'count(count_over_time(certmanager_certificate_ready_status{condition="True", namespace="$namespace"}[7d]) and changes(certmanager_certificate_ready_status{condition="True", namespace="$namespace"}[7d]) > 0)':
    'count(changes(certmanager_certificate_ready_status{condition="True", namespace="$namespace"}[7d]) > 0)'
};

// Fix all panels
let changesM = 0;
for (const panel of dashboard.panels || []) {
  // Skip row panels
  if (panel.type === 'row') continue;
  
  // Check targets
  if (!panel.targets) continue;
  
  for (const target of panel.targets) {
    if (!target.expr) continue;
    
    const originalExpr = target.expr;
    
    // Try to match and fix known queries
    for (const [oldQuery, newQuery] of Object.entries(QUERY_FIXES)) {
      if (originalExpr.includes(oldQuery)) {
        target.expr = originalExpr.replace(oldQuery, newQuery);
        console.log(`Panel ${panel.id || '?'} (${panel.title || 'Untitled'}): Fixed query`);
        console.log(`  OLD: ${originalExpr}`);
        console.log(`  NEW: ${target.expr}`);
        changesM++;
        break;
      }
    }
  }
}

console.log(`\n✅ Fixed ${changesM} queries`);

// Save fixed dashboard (minified - same format as original)
fs.writeFileSync(dashboardPath, JSON.stringify(dashboard));

console.log(`✅ Saved to ${dashboardPath}`);
