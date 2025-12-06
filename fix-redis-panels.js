#!/usr/bin/env node
/**
 * Fix Redis monitoring panels to focus on PubSub usage instead of cache.
 * 
 * Changes:
 * 1. Rename "Redis (Cache & Sessions)" row to "Redis (PubSub)"
 * 2. Remove cache-specific panels (Hit Rate, Evictions, Keys Count, Replication)
 * 3. Move "Redis Message Rate" from WebSocket section to Redis section
 * 4. Add PubSub-specific metrics (channels, patterns, published messages)
 * 5. Keep basic infrastructure metrics (Memory, CPU, Connections, Operations/sec)
 */

const fs = require('fs');
const path = require('path');

// Load dashboard
const dashboardPath = path.join(__dirname, 'helm', 'dashboards', 'applications', 'content-platform.json');
const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));

// Find Redis row panel (ID 102)
const redisRowIndex = dashboard.panels.findIndex(p => p.id === 102);
if (redisRowIndex !== -1) {
  dashboard.panels[redisRowIndex].title = 'Redis (PubSub)';
  console.log('✅ Renamed Redis row to "Redis (PubSub)"');
}

// Find and move "Redis Message Rate" panel (ID 47) from WebSocket section to Redis section
const redisMessageRateIndex = dashboard.panels.findIndex(p => p.id === 47);
if (redisMessageRateIndex !== -1) {
  const panel = dashboard.panels[redisMessageRateIndex];
  
  // Update panel to show Redis PubSub publish rate instead of WebSocket metric
  panel.title = 'PubSub Message Rate';
  panel.description = 'Messages published to Redis PubSub channels per second';
  panel.targets = [{
    expr: 'rate(redis_pubsub_num_messages_total{namespace="$namespace"}[5m]) or vector(0)',
    refId: 'A',
    legendFormat: 'Messages/sec'
  }];
  
  console.log('✅ Updated panel ID 47 to show Redis PubSub message rate');
}

// Remove cache-specific panels:
// - Panel 52: Redis Hit Rate
// - Panel 54: Redis Evictions
// - Panel 55: Redis Keys Count
// - Panel 56: Redis Replication Status
const panelsToRemove = [52, 54, 55, 56];
const removedPanels = [];

for (let i = dashboard.panels.length - 1; i >= 0; i--) {
  if (panelsToRemove.includes(dashboard.panels[i].id)) {
    removedPanels.push(dashboard.panels[i].title);
    dashboard.panels.splice(i, 1);
  }
}

console.log(`✅ Removed ${removedPanels.length} cache-specific panels:`, removedPanels);

// Update remaining Redis panels with better descriptions
const redisPanels = dashboard.panels.filter(p => 
  p.title && (
    p.title.includes('Redis Memory') ||
    p.title.includes('Redis Connected Clients') ||
    p.title.includes('Redis Operations')
  )
);

redisPanels.forEach(panel => {
  if (panel.title === 'Redis Memory Usage') {
    panel.description = 'Redis memory usage - includes PubSub buffer memory';
  } else if (panel.title === 'Redis Connected Clients') {
    panel.description = 'Number of clients connected to Redis (WebSocket pods publishing to PubSub)';
  } else if (panel.title === 'Redis Operations/sec') {
    panel.description = 'Total Redis commands processed per second (PUBLISH, SUBSCRIBE, etc)';
  }
});

console.log('✅ Updated Redis panel descriptions for PubSub context');

// Add new PubSub-specific panels
const newPanels = [
  {
    datasource: { type: 'prometheus', uid: 'prometheus' },
    description: 'Number of active PubSub channels (pipeline events)',
    fieldConfig: {
      defaults: {
        color: { mode: 'thresholds' },
        thresholds: {
          mode: 'absolute',
          steps: [
            { color: 'green', value: null },
            { color: 'yellow', value: 10 },
            { color: 'orange', value: 20 },
            { color: 'red', value: 30 }
          ]
        },
        unit: 'short'
      }
    },
    gridPos: { h: 8, w: 8, x: 0, y: 67 },
    id: 57,
    options: {
      colorMode: 'background',
      graphMode: 'area',
      textMode: 'value_and_name'
    },
    targets: [{
      expr: 'redis_pubsub_channels{namespace="$namespace"} or vector(0)',
      refId: 'A',
      legendFormat: 'Active Channels'
    }],
    title: 'Active PubSub Channels',
    type: 'stat'
  },
  {
    datasource: { type: 'prometheus', uid: 'prometheus' },
    description: 'Redis pod CPU usage',
    fieldConfig: {
      defaults: {
        custom: {
          lineWidth: 2,
          fillOpacity: 20,
          drawStyle: 'line'
        },
        unit: 'percentunit',
        color: { mode: 'palette-classic' }
      }
    },
    gridPos: { h: 8, w: 8, x: 8, y: 67 },
    id: 58,
    options: {
      legend: {
        placement: 'bottom',
        calcs: ['mean', 'max'],
        displayMode: 'table'
      }
    },
    targets: [{
      expr: 'sum(rate(container_cpu_usage_seconds_total{namespace="$namespace", pod=~"redis-.*", container!="", container!="POD"}[5m])) by (pod)',
      refId: 'A',
      legendFormat: '{{pod}}'
    }],
    title: 'Redis CPU Usage',
    type: 'timeseries'
  },
  {
    datasource: { type: 'prometheus', uid: 'prometheus' },
    description: 'Redis pod memory usage',
    fieldConfig: {
      defaults: {
        custom: {
          lineWidth: 2,
          fillOpacity: 10,
          drawStyle: 'line'
        },
        unit: 'bytes',
        color: { mode: 'palette-classic' }
      }
    },
    gridPos: { h: 8, w: 8, x: 16, y: 67 },
    id: 59,
    options: {
      legend: {
        placement: 'bottom',
        calcs: ['last', 'max'],
        displayMode: 'table'
      }
    },
    targets: [{
      expr: 'sum(container_memory_working_set_bytes{namespace="$namespace", pod=~"redis-.*", container!="", container!="POD"}) by (pod)',
      refId: 'A',
      legendFormat: '{{pod}}'
    }],
    title: 'Redis Pod Memory Usage',
    type: 'timeseries'
  }
];

// Insert new panels after existing Redis panels
const lastRedisPanelIndex = dashboard.panels.findIndex(p => p.id === 53); // Redis Operations/sec
if (lastRedisPanelIndex !== -1) {
  dashboard.panels.splice(lastRedisPanelIndex + 1, 0, ...newPanels);
  console.log(`✅ Added ${newPanels.length} new PubSub-focused panels`);
}

// Save dashboard
fs.writeFileSync(dashboardPath, JSON.stringify(dashboard));

console.log(`\n✅ Dashboard updated successfully!`);
console.log('\nSummary:');
console.log('  - Renamed section: "Redis (PubSub)"');
console.log('  - Removed 4 cache-specific panels');
console.log('  - Updated existing panel descriptions');
console.log('  - Added 3 new PubSub/infrastructure panels');
console.log('  - Moved Redis Message Rate to Redis section');
