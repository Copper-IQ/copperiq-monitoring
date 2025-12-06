#!/usr/bin/env node
/**
 * Fix Redis panel queries to use correct metric names that actually exist.
 * 
 * Based on verification of redis_exporter metrics:
 * - redis_memory_used_bytes ✅
 * - redis_connected_clients ✅  
 * - redis_commands_processed_total ✅
 * - redis_pubsub_channels ✅
 * - redis_commands_total{cmd="publish"} ✅ (for message rate)
 * 
 * Missing metrics that don't exist:
 * - redis_pubsub_num_messages_total ❌
 */

const fs = require('fs');
const path = require('path');

// Load dashboard
const dashboardPath = path.join(__dirname, 'helm', 'dashboards', 'applications', 'content-platform.json');
const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));

let fixedCount = 0;

// Fix each Redis panel
for (const panel of dashboard.panels) {
  if (!panel.targets || !panel.title) continue;
  
  for (const target of panel.targets) {
    if (!target.expr) continue;
    
    const originalExpr = target.expr;
    let newExpr = originalExpr;
    
    // Fix: PubSub Message Rate panel (ID 47)
    // Old: rate(redis_pubsub_num_messages_total{...}[5m])
    // New: rate(redis_commands_total{namespace="$namespace",cmd="publish"}[5m])
    if (originalExpr.includes('redis_pubsub_num_messages_total')) {
      newExpr = 'rate(redis_commands_total{namespace="$namespace",cmd="publish"}[5m]) or vector(0)';
      console.log(`✅ Fixed panel ${panel.id} (${panel.title})`);
      console.log(`   OLD: ${originalExpr}`);
      console.log(`   NEW: ${newExpr}`);
      fixedCount++;
    }
    
    // Ensure all Redis queries have namespace filter and fallback
    if (newExpr.startsWith('redis_') && !newExpr.includes('or vector(0)') && 
        (newExpr.includes('rate(') || newExpr.includes('sum('))) {
      // Add fallback for rate/sum queries that might return empty
      if (!newExpr.includes('or vector(0)')) {
        newExpr = newExpr + ' or vector(0)';
        console.log(`✅ Added fallback to panel ${panel.id} (${panel.title})`);
        fixedCount++;
      }
    }
    
    target.expr = newExpr;
  }
}

console.log(`\n✅ Fixed ${fixedCount} Redis queries`);

// Save dashboard
fs.writeFileSync(dashboardPath, JSON.stringify(dashboard));
console.log('✅ Dashboard saved');
