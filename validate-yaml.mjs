#!/usr/bin/env node
/**
 * Validate YAML files in grafana-alerts/
 * Checks for syntax errors and basic structure
 */

import { readFileSync, readdirSync } from 'fs';
import { load } from 'js-yaml';
import { join, basename } from 'path';

function validateFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const parsed = load(content);
    
    // Basic structure validation
    if (parsed.apiVersion !== 1) {
      return { valid: false, error: 'apiVersion must be 1' };
    }
    
    // Check for required fields based on file type
    const fileName = basename(filePath);
    
    if (fileName === 'folders.yaml' && !parsed.folders) {
      return { valid: false, error: 'folders.yaml must have "folders" array' };
    }
    
    if (fileName === 'contact-points.yaml' && !parsed.contactPoints) {
      return { valid: false, error: 'contact-points.yaml must have "contactPoints" array' };
    }
    
    if (fileName === 'notification-policies.yaml' && !parsed.policies) {
      return { valid: false, error: 'notification-policies.yaml must have "policies" array' };
    }
    
    // Alert files should have groups
    if (fileName !== 'folders.yaml' && fileName !== 'contact-points.yaml' && fileName !== 'notification-policies.yaml') {
      if (!parsed.groups || !Array.isArray(parsed.groups)) {
        return { valid: false, error: 'Alert files must have "groups" array' };
      }
      
      // Check each group has required fields
      for (const group of parsed.groups) {
        if (!group.name) {
          return { valid: false, error: `Group missing "name" field` };
        }
        if (!group.folder) {
          return { valid: false, error: `Group "${group.name}" missing "folder" field` };
        }
        if (!group.rules || !Array.isArray(group.rules)) {
          return { valid: false, error: `Group "${group.name}" missing "rules" array` };
        }
        
        // Check each rule
        for (const rule of group.rules) {
          if (!rule.uid) {
            return { valid: false, error: `Rule "${rule.title || 'unknown'}" missing "uid"` };
          }
          if (!rule.title) {
            return { valid: false, error: `Rule missing "title"` };
          }
          if (!rule.condition) {
            return { valid: false, error: `Rule "${rule.title}" missing "condition"` };
          }
          if (!rule.data || !Array.isArray(rule.data)) {
            return { valid: false, error: `Rule "${rule.title}" missing "data" array` };
          }
        }
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

async function main() {
  const alertsDir = 'grafana-alerts';
  const files = readdirSync(alertsDir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => join(alertsDir, f));
  
  console.log(`\nValidating ${files.length} YAML files in grafana-alerts/...\n`);
  
  let allValid = true;
  let validCount = 0;
  
  for (const file of files) {
    const fileName = basename(file);
    const result = validateFile(file);
    
    if (result.valid) {
      console.log(`✓ ${fileName}`);
      validCount++;
    } else {
      console.log(`✗ ${fileName}: ${result.error}`);
      allValid = false;
    }
  }
  
  console.log(`\n${validCount}/${files.length} files valid`);
  
  if (allValid) {
    console.log('\n✓ All YAML files are valid!\n');
    process.exit(0);
  } else {
    console.log('\n✗ Some files have errors. Please fix them before deployment.\n');
    process.exit(1);
  }
}

main();
