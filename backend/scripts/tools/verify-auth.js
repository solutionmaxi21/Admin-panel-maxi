#!/usr/bin/env node

/**
 * Admin Authentication Verification Script
 * Runs all authentication tests and verifies the system is working
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

console.log(chalk.cyan.bold('\n🔐 Admin Authentication Verification\n'));
console.log(chalk.gray('=' .repeat(50) + '\n'));

const tests = [
  {
    name: 'Check Admin Accounts',
    command: 'node check-admin.js',
    description: 'Verify admin accounts exist in database'
  },
  {
    name: 'Test Authentication Flow',
    command: 'node test-auth-complete.js',
    description: 'Complete end-to-end authentication test'
  }
];

let allPassed = true;

for (const test of tests) {
  console.log(chalk.yellow(`\n▶ ${test.name}`));
  console.log(chalk.gray(`  ${test.description}`));
  
  try {
    execSync(test.command, { 
      cwd: process.cwd(),
      stdio: 'inherit'
    });
    console.log(chalk.green(`  ✅ Passed\n`));
  } catch (error) {
    console.log(chalk.red(`  ❌ Failed\n`));
    allPassed = false;
  }
}

console.log(chalk.gray('=' .repeat(50)));

if (allPassed) {
  console.log(chalk.green.bold('\n✅ All authentication tests passed!\n'));
  console.log(chalk.cyan('Admin Login Credentials:'));
  console.log(chalk.white('  Email:    admin@maxistore.com'));
  console.log(chalk.white('  Password: Admin1234!'));
  console.log(chalk.white('  URL:      http://localhost:5174\n'));
  process.exit(0);
} else {
  console.log(chalk.red.bold('\n❌ Some tests failed. Please review the output above.\n'));
  process.exit(1);
}
