#!/usr/bin/env node

/**
 * Master Test Runner - Executes all cache system tests
 * Runs both backend unit tests and API integration tests
 * 
 * Usage:
 *   node run-all-tests.js                    # Run all tests
 *   node run-all-tests.js unit               # Run only unit tests
 *   node run-all-tests.js api                # Run only API tests
 *   node run-all-tests.js unit --verbose    # Run with detailed output
 */

import { spawn } from 'child_process';
import fs from 'fs';

const testSuites = [
  {
    name: 'Advanced Cache Unit Tests',
    file: './test-cache-advanced.js',
    description: 'Tests internal cache functionality and fixes'
  },
  {
    name: 'Advanced API Integration Tests',
    file: './test-cache-api.js',
    description: 'Tests cache endpoints and HTTP performance'
  }
];

let totalPassed = 0;
let totalFailed = 0;
let totalDuration = 0;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1];
  const icons = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    run: '🏃',
    complete: '🏁',
    report: '📊'
  };
  console.log(`${icons[level] || '•'} [${timestamp}] ${message}`);
}

function printHeader(text) {
  console.log('\n' + '═'.repeat(70));
  log(text, 'info');
  console.log('═'.repeat(70));
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

async function runTestSuite(testFile, verbose = false) {
  return new Promise((resolve, reject) => {
    log(`Starting: ${testFile}`, 'run');

    const startTime = Date.now();
    const childProcess = spawn('node', [testFile], {
      cwd: process.cwd(),
      stdio: verbose ? 'inherit' : 'pipe'
    });

    let output = '';
    let error = '';

    if (!verbose) {
      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        error += data.toString();
      });
    }

    childProcess.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        log(`Completed: ${testFile} in ${duration}ms`, 'success');
        
        // Parse results from output
        const passedMatch = output.match(/(\d+)\/(\d+) tests passed/);
        if (passedMatch) {
          const passed = parseInt(passedMatch[1]);
          const total = parseInt(passedMatch[2]);
          totalPassed += passed;
          totalFailed += (total - passed);
        }
      } else {
        log(`Failed: ${testFile} (exit code: ${code})`, 'error');
        if (error && !verbose) {
          log(`Error output: ${error.substring(0, 200)}...`, 'error');
        }
        totalFailed += 1;
      }

      totalDuration += duration;
      resolve({ code, output, error, duration });
    });

    childProcess.on('error', (err) => {
      reject(err);
    });
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const suiteFilter = args[0];
  const verbose = args.includes('--verbose');

  printHeader('🧪 CACHE SYSTEM - MASTER TEST RUNNER 🧪');

  log(`Node.js: ${process.version}`, 'info');
  log(`Working Directory: ${process.cwd()}`, 'info');
  log(`Verbose Mode: ${verbose ? 'ON' : 'OFF'}`, 'info');

  // Filter test suites based on arguments
  let suites = testSuites;
  if (suiteFilter === 'unit') {
    suites = testSuites.filter(s => s.file.includes('advanced'));
    log('Running unit tests only', 'info');
  } else if (suiteFilter === 'api') {
    suites = testSuites.filter(s => s.file.includes('api'));
    log('Running API tests only', 'info');
  }

  // Display test plan
  log('\nTest Plan:', 'info');
  suites.forEach((suite, idx) => {
    log(`${idx + 1}. ${suite.name}`, 'info');
    log(`   ${suite.description}`, 'info');
  });

  // Run each test suite
  const results = [];
  for (const suite of suites) {
    printHeader(`Running: ${suite.name}`);
    try {
      const result = await runTestSuite(suite.file, verbose);
      results.push({ suite: suite.name, ...result });
    } catch (err) {
      log(`ERROR: Failed to run ${suite.file}: ${err.message}`, 'error');
      results.push({ 
        suite: suite.name, 
        code: 1, 
        output: '', 
        error: err.message, 
        duration: 0 
      });
    }
  }

  // Print final report
  printHeader('📊 FINAL TEST REPORT');

  log('\nTest Suite Results:', 'report');
  results.forEach((result, idx) => {
    const status = result.code === 0 ? '✅ PASSED' : '❌ FAILED';
    log(`${idx + 1}. ${result.suite}: ${status} (${result.duration}ms)`, 
      result.code === 0 ? 'success' : 'error');
  });

  // Summary statistics
  const totalSuites = results.length;
  const passedSuites = results.filter(r => r.code === 0).length;
  const failedSuites = results.filter(r => r.code !== 0).length;

  log(`\nSummary:`, 'report');
  log(`  Test Suites: ${passedSuites}/${totalSuites} passed`, 
    passedSuites === totalSuites ? 'success' : 'warning');
  log(`  Total Tests: ${totalPassed} passed, ${totalFailed} failed`, 
    totalFailed === 0 ? 'success' : 'warning');
  log(`  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`, 'metric');

  // Performance analysis
  const avgTime = totalDuration / (totalSuites || 1);
  log(`  Average per Suite: ${avgTime.toFixed(0)}ms`, 'metric');

  // Final verdict
  console.log('\n' + '═'.repeat(70));
  if (failedSuites === 0 && totalFailed === 0) {
    log('🎉 ALL TESTS PASSED! SYSTEM IS PRODUCTION READY! 🎉', 'success');
    console.log('═'.repeat(70));
    process.exit(0);
  } else {
    log(`⚠️ ${failedSuites + totalFailed} issue(s) detected`, 'error');
    console.log('═'.repeat(70));
    process.exit(1);
  }
}

// Run main
main().catch(err => {
  log(`FATAL ERROR: ${err.message}`, 'error');
  console.error(err);
  process.exit(1);
});
