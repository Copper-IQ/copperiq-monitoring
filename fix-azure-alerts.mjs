#!/usr/bin/env node
/**
 * Fix Azure monitoring alerts to use Azure Monitor datasource
 * 
 * This script:
 * 1. Reads alert YAML files for Azure resources (PostgreSQL, MySQL)
 * 2. Replaces Prometheus datasource (uid: prometheus) with Azure Monitor (uid: P1EB995EACC6832D3)
 * 3. Updates metric queries to use correct Azure Monitor format
 * 4. Changes noDataState from OK to Alerting (so we know if monitoring breaks)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AZURE_MONITOR_DATASOURCE_UID = 'P1EB995EACC6832D3';
const RESOURCE_GROUP = 'shared-hosting-accept-prod';

// Metric mappings: Prometheus metric name -> Azure Monitor configuration
const POSTGRESQL_METRICS = {
  'azure_postgresql_flexible_server_cpu_percent': {
    metricName: 'cpu_percent',
    aggregation: 'Average',
    metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers',
    resourceName: 'copperiq-accept-prod'
  },
  'azure_postgresql_flexible_server_memory_percent': {
    metricName: 'memory_percent',
    aggregation: 'Average',
    metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers',
    resourceName: 'copperiq-accept-prod'
  },
  'azure_postgresql_flexible_server_storage_percent': {
    metricName: 'storage_percent',
    aggregation: 'Average',
    metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers',
    resourceName: 'copperiq-accept-prod'
  },
  'azure_postgresql_flexible_server_active_connections': {
    metricName: 'active_connections',
    aggregation: 'Average',
    metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers',
    resourceName: 'copperiq-accept-prod'
  },
  'azure_postgresql_flexible_server_connections_failed_total': {
    metricName: 'connections_failed',
    aggregation: 'Total',
    metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers',
    resourceName: 'copperiq-accept-prod'
  },
  'azure_postgresql_flexible_server_replication_lag_seconds': {
    metricName: 'replication_lag',
    aggregation: 'Maximum',
    metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers',
    resourceName: 'copperiq-accept-prod'
  },
  'azure_postgresql_flexible_server_backup_storage_used_bytes': {
    metricName: 'backup_storage_used',
    aggregation: 'Average',
    metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers',
    resourceName: 'copperiq-accept-prod'
  }
};

const MYSQL_METRICS = {
  'azure_mysql_flexible_server_cpu_percent': {
    metricName: 'cpu_percent',
    aggregation: 'Average',
    metricNamespace: 'Microsoft.DBforMySQL/flexibleServers',
    resourceName: 'copperiq-accept-prod-mysql'
  },
  'azure_mysql_flexible_server_memory_percent': {
    metricName: 'memory_percent',
    aggregation: 'Average',
    metricNamespace: 'Microsoft.DBforMySQL/flexibleServers',
    resourceName: 'copperiq-accept-prod-mysql'
  },
  'azure_mysql_flexible_server_storage_percent': {
    metricName: 'storage_percent',
    aggregation: 'Average',
    metricNamespace: 'Microsoft.DBforMySQL/flexibleServers',
    resourceName: 'copperiq-accept-prod-mysql'
  },
  'azure_mysql_flexible_server_active_connections': {
    metricName: 'active_connections',
    aggregation: 'Average',
    metricNamespace: 'Microsoft.DBforMySQL/flexibleServers',
    resourceName: 'copperiq-accept-prod-mysql'
  },
  'azure_mysql_flexible_server_aborted_connections_total': {
    metricName: 'aborted_connections',
    aggregation: 'Total',
    metricNamespace: 'Microsoft.DBforMySQL/flexibleServers',
    resourceName: 'copperiq-accept-prod-mysql'
  },
  'azure_mysql_flexible_server_replication_lag_seconds': {
    metricName: 'replication_lag',
    aggregation: 'Maximum',
    metricNamespace: 'Microsoft.DBforMySQL/flexibleServers',
    resourceName: 'copperiq-accept-prod-mysql'
  }
};

/**
 * Fix a YAML alert file
 */
async function fixAlertFile(filePath, metricMappings) {
  console.log(`\n📝 Processing: ${path.basename(filePath)}`);
  
  let content = await fs.readFile(filePath, 'utf-8');
  let changeCount = 0;
  
  // 1. Update header comment
  if (content.includes('Converted from PrometheusRule')) {
    content = content.replace(
      /# Converted from PrometheusRule:.*/,
      '# FIXED: Using Azure Monitor datasource with correct metric names'
    );
    changeCount++;
  }
  
  // 2. Change noDataState from OK to Alerting (except for replication/backup which are optional)
  const noDataAlertingRegex = /noDataState: OK(?!.*(?:replication|backup))/gms;
  const noDataMatches = content.match(noDataAlertingRegex);
  if (noDataMatches) {
    content = content.replace(noDataAlertingRegex, 'noDataState: Alerting');
    changeCount += noDataMatches.length;
  }
  
  // 3. Replace datasourceUid: prometheus with Azure Monitor
  content = content.replace(
    /datasourceUid: prometheus/g,
    `datasourceUid: ${AZURE_MONITOR_DATASOURCE_UID}`
  );
  changeCount++;
  
  // 4. Replace Prometheus queries with Azure Monitor queries
  for (const [prometheusMetric, azureConfig] of Object.entries(metricMappings)) {
    // Find expressions that use this metric
    const exprRegex = new RegExp(`expr:\\s*(?:>-\\s*)?${prometheusMetric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    
    if (content.includes(prometheusMetric)) {
      // Replace the entire model section for queries using this metric
      const modelRegex = new RegExp(
        `model:\\s*\\n\\s+expr:\\s*(?:>-\\s*)?(?:.*${prometheusMetric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*|${prometheusMetric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\n(\\s+)refId:\\s*A\\n\\s+datasource:\\s*\\n\\s+type: prometheus\\s*\\n\\s+uid: ${AZURE_MONITOR_DATASOURCE_UID}`,
        'g'
      );
      
      const replacement = `model:
              queryType: Azure Monitor
              azureMonitor:
                resourceGroup: ${RESOURCE_GROUP}
                resourceName: ${azureConfig.resourceName}
                metricNamespace: ${azureConfig.metricNamespace}
                metricName: ${azureConfig.metricName}
                aggregation: ${azureConfig.aggregation}
                timeGrain: PT1M
              refId: A`;
      
      content = content.replace(modelRegex, replacement);
      changeCount++;
    }
  }
  
  // 5. Remove old Prometheus-specific fields that might remain
  content = content.replace(/\s+intervalMs: \d+\n/g, '\n');
  content = content.replace(/\s+maxDataPoints: \d+\n/g, '\n');
  
  await fs.writeFile(filePath, content, 'utf-8');
  console.log(`✅ Fixed ${path.basename(filePath)} (${changeCount} changes)`);
  
  return changeCount;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 Azure Monitor Alert Fixer\n');
  console.log('This script fixes Azure resource alerts to use Azure Monitor datasource\n');
  
  const alertsDir = path.join(__dirname, 'helm', 'grafana-alerts');
  
  try {
    // Fix PostgreSQL alerts
    const postgresFile = path.join(alertsDir, 'azure-postgresql.yaml');
    const postgresChanges = await fixAlertFile(postgresFile, POSTGRESQL_METRICS);
    
    // Fix MySQL alerts  
    const mysqlFile = path.join(alertsDir, 'azure-mysql.yaml');
    const mysqlChanges = await fixAlertFile(mysqlFile, MYSQL_METRICS);
    
    console.log('\n✨ Summary:');
    console.log(`- PostgreSQL alerts: ${postgresChanges} changes`);
    console.log(`- MySQL alerts: ${mysqlChanges} changes`);
    console.log('\n⚠️  Next steps:');
    console.log('1. Review the changes in git diff');
    console.log('2. Test one alert in Grafana to verify Azure Monitor datasource works');
    console.log('3. Commit and deploy via ArgoCD');
    console.log('4. Monitor #infra-alerts channel to confirm alerts start working');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
