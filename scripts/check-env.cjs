#!/usr/bin/env node

/**
 * Environment Variable Checker
 * Run this script to verify your .env.local configuration
 *
 * Usage: node check-env.js
 */

const fs = require('fs');
const path = require('path');

console.log('=== Environment Configuration Checker ===\n');

// Check if .env.local exists
const envLocalPath = path.join(__dirname, '.env.local');
const envPath = path.join(__dirname, '.env');

console.log('1. Checking .env files...');
const envLocalExists = fs.existsSync(envLocalPath);
const envExists = fs.existsSync(envPath);

if (envLocalExists) {
  console.log('   ✅ .env.local exists');
} else {
  console.log('   ❌ .env.local NOT FOUND');
}

if (envExists) {
  console.log('   ✅ .env exists');
} else {
  console.log('   ⚠️  .env not found (optional)');
}

if (!envLocalExists && !envExists) {
  console.log('\n❌ ERROR: No .env file found!');
  console.log('   Please create .env.local file with required configuration.');
  process.exit(1);
}

// Read and parse .env.local
console.log('\n2. Reading .env.local content...');
const envContent = fs.readFileSync(envLocalPath, 'utf8');
const lines = envContent.split('\n');

const config = {};
lines.forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      config[key.trim()] = valueParts.join('=').trim();
    }
  }
});

// Check required variables
console.log('\n3. Checking required environment variables...');

const requiredVars = [
  'VITE_AGENT_API_BASE_URL',
  'VITE_AGENT_APP_KEY',
  'VITE_AGENT_API_TOKEN'
];

let allValid = true;

requiredVars.forEach(varName => {
  if (config[varName]) {
    const value = config[varName];
    const displayValue = varName.includes('TOKEN')
      ? `***${value.slice(-10)}`
      : value;
    console.log(`   ✅ ${varName}: ${displayValue}`);
  } else {
    console.log(`   ❌ ${varName}: NOT SET`);
    allValid = false;
  }
});

// Validate values
console.log('\n4. Validating configuration values...');

if (config.VITE_AGENT_API_BASE_URL) {
  const baseUrl = config.VITE_AGENT_API_BASE_URL;

  if (baseUrl.includes('localhost')) {
    console.log('   ⚠️  WARNING: Base URL points to localhost');
    console.log(`      Current: ${baseUrl}`);
    console.log('      Expected: https://dip.aishu.cn:443/api/agent-app/v1');
  } else if (baseUrl.includes('dip.aishu.cn')) {
    console.log('   ✅ Base URL points to production API');
  } else {
    console.log(`   ⚠️  Unexpected base URL: ${baseUrl}`);
  }

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    console.log('   ❌ Base URL must start with http:// or https://');
    allValid = false;
  }
}

if (config.VITE_AGENT_APP_KEY) {
  const appKey = config.VITE_AGENT_APP_KEY;
  if (appKey.length < 10) {
    console.log('   ⚠️  App Key seems too short');
  } else {
    console.log('   ✅ App Key format looks valid');
  }
}

if (config.VITE_AGENT_API_TOKEN) {
  const token = config.VITE_AGENT_API_TOKEN;
  if (token.length < 50) {
    console.log('   ⚠️  Token seems too short, might be invalid');
  } else {
    console.log('   ✅ Token format looks valid');
  }
}

// Check for common issues
console.log('\n5. Checking for common issues...');

let hasIssues = false;

lines.forEach((line, index) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    // Check for quotes around values (not needed in .env files)
    if (trimmed.includes('="') || trimmed.includes("='")) {
      console.log(`   ⚠️  Line ${index + 1}: Found quotes around value`);
      console.log(`      ${trimmed}`);
      console.log('      Tip: Remove quotes, use: KEY=value (not KEY="value")');
      hasIssues = true;
    }

    // Check for spaces around =
    if (trimmed.includes(' = ')) {
      console.log(`   ⚠️  Line ${index + 1}: Found spaces around =`);
      console.log(`      ${trimmed}`);
      console.log('      Tip: Use KEY=value (no spaces)');
      hasIssues = true;
    }
  }
});

if (!hasIssues) {
  console.log('   ✅ No common formatting issues found');
}

// Final summary
console.log('\n=== Summary ===');

if (allValid && !hasIssues) {
  console.log('✅ Configuration looks good!');
  console.log('\nNext steps:');
  console.log('1. Make sure the development server is stopped (Ctrl+C)');
  console.log('2. Clear Vite cache: rmdir /s /q node_modules\\.vite');
  console.log('3. Start dev server: npm run dev');
  console.log('4. Open browser console to verify config is loaded');
} else {
  console.log('❌ Configuration has issues that need to be fixed');
  console.log('\nPlease fix the issues above and run this script again.');
  process.exit(1);
}

console.log('\n========================================');
