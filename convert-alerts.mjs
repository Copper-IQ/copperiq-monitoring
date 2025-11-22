#!/usr/bin/env node
/**
 * Convert PrometheusRule CRDs to Grafana Unified Alerting format
 * 
 * Usage: node convert-alerts.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { load, dump } from 'js-yaml';

// Folder mapping based on component labels
const FOLDER_MAPPING = {
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
};

function determineFolder(alertRule) {
  const labels = alertRule.labels || {};
  const component = (labels.component || '').toLowerCase();
  const category = (labels.category || '').toLowerCase();
  
  // Direct component mapping
  for (const [key, folder] of Object.entries(FOLDER_MAPPING)) {
    if (component.includes(key)) {
      return folder;
    }
  }
  
  // Fallback to category
  if (category === 'infrastructure') return 'infrastructure';
  if (category === 'database') return 'databases';
  if (category === 'application') return 'applications';
  
  return 'applications';
}

function generateUid(alertName) {
  // Convert to lowercase, replace non-alphanumeric with hyphens
  let uid = alertName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  // Remove duplicate hyphens
  uid = uid.replace(/-+/g, '-');
  // Trim to 40 chars and remove trailing hyphens
  return uid.substring(0, 40).replace(/-+$/, '');
}

function convertPromQLToGrafanaQuery(expr) {
  // Remove multiline markers
  expr = expr.replace(/^\|\s*\n/g, '').trim();
  
  // Join multiline expressions
  if (expr.includes('\n')) {
    expr = expr.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('|'))
      .join(' ');
  }
  
  // Extract comparison operator and threshold
  const comparisonMatch = expr.match(/([<>=!]+)\s*(\d+\.?\d*)\s*$/);
  
  let baseExpr, mathExpr;
  if (comparisonMatch) {
    const operator = comparisonMatch[1];
    const threshold = comparisonMatch[2];
    baseExpr = expr.substring(0, comparisonMatch.index).trim();
    mathExpr = `$B ${operator} ${threshold}`;
  } else {
    baseExpr = expr;
    mathExpr = '$B > 0';
  }
  
  return [
    {
      refId: 'A',
      relativeTimeRange: {
        from: 600,
        to: 0
      },
      datasourceUid: 'prometheus',
      model: {
        expr: baseExpr,
        refId: 'A',
        datasource: {
          type: 'prometheus',
          uid: 'prometheus'
        },
        intervalMs: 1000,
        maxDataPoints: 43200
      }
    },
    {
      refId: 'B',
      relativeTimeRange: {
        from: 0,
        to: 0
      },
      datasourceUid: '__expr__',
      model: {
        type: 'reduce',
        expression: 'A',
        reducer: 'last',
        refId: 'B',
        datasource: {
          type: '__expr__',
          uid: '__expr__'
        }
      }
    },
    {
      refId: 'C',
      relativeTimeRange: {
        from: 0,
        to: 0
      },
      datasourceUid: '__expr__',
      model: {
        type: 'math',
        expression: mathExpr,
        refId: 'C',
        datasource: {
          type: '__expr__',
          uid: '__expr__'
        }
      }
    }
  ];
}

function convertRule(rule) {
  const alertName = rule.alert;
  const uid = generateUid(alertName);
  const expr = rule.expr;
  const data = convertPromQLToGrafanaQuery(expr);
  
  return {
    uid,
    title: alertName,
    condition: 'C',
    for: rule.for || '0s',
    noDataState: 'OK',
    execErrState: 'Alerting',
    annotations: rule.annotations || {},
    labels: rule.labels || {},
    data
  };
}

function convertPrometheusRule(inputFile, outputDir) {
  const content = readFileSync(inputFile, 'utf8');
  const promRule = load(content);
  
  const spec = promRule.spec;
  const groups = spec.groups;
  
  const grafanaGroups = [];
  
  for (const group of groups) {
    const groupName = group.name;
    const interval = group.interval || '30s';
    const rules = group.rules || [];
    
    // Determine folder from first rule
    let folder = 'applications';
    if (rules.length > 0) {
      folder = determineFolder(rules[0]);
    }
    
    const grafanaRules = [];
    for (const rule of rules) {
      if (rule.alert) {
        grafanaRules.push(convertRule(rule));
      }
    }
    
    grafanaGroups.push({
      orgId: 1,
      name: groupName,
      folder,
      interval,
      rules: grafanaRules
    });
  }
  
  const outputData = {
    apiVersion: 1,
    groups: grafanaGroups
  };
  
  const fileName = basename(inputFile);
  const outputFile = join(outputDir, fileName);
  
  const header = `# Grafana Unified Alerting Rules: ${fileName.replace('.yaml', '')}\n` +
                 `# Converted from PrometheusRule: ${promRule.metadata.name}\n`;
  
  const yamlContent = dump(outputData, { 
    lineWidth: 120, 
    noRefs: true,
    sortKeys: false 
  });
  
  writeFileSync(outputFile, header + yamlContent);
  
  const totalAlerts = grafanaGroups.reduce((sum, g) => sum + g.rules.length, 0);
  console.log(`✓ Converted ${fileName} -> ${totalAlerts} alerts`);
  
  return totalAlerts;
}

async function main() {
  const alertsDir = 'alerts';
  const outputDir = 'grafana-alerts';
  
  // Create output directory if it doesn't exist
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  // Get all YAML files from alerts directory
  const files = readdirSync(alertsDir)
    .filter(f => f.endsWith('.yaml') && f !== '.gitkeep')
    .map(f => join(alertsDir, f));
  
  console.log(`\nConverting ${files.length} PrometheusRule files...\n`);
  
  let totalAlerts = 0;
  for (const file of files) {
    try {
      const count = convertPrometheusRule(file, outputDir);
      totalAlerts += count;
    } catch (error) {
      console.error(`✗ Error converting ${basename(file)}: ${error.message}`);
    }
  }
  
  console.log(`\n✓ Successfully converted ${totalAlerts} alerts across ${files.length} files`);
  console.log(`Output directory: ${join(process.cwd(), outputDir)}\n`);
}

// Check if js-yaml is available, if not provide instructions
try {
  await import('js-yaml');
  main();
} catch (error) {
  console.error('Error: js-yaml module not found.');
  console.error('Install it with: npm install js-yaml');
  process.exit(1);
}
