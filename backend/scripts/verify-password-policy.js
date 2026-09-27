
import { validatePasswordStrength } from '../src/shared/utils/password.js';

const testPasswords = [
    { p: '123', expected: false, desc: 'Too short' },
    { p: 'password', expected: false, desc: 'Common word' },
    { p: 'Password123!', expected: false, desc: 'Common pattern' }, // zxcvbn likely rate this low
    { p: 'correct_horse_battery_staple', expected: true, desc: 'High entropy phrase' },
    { p: 'Tr0ub4dor&3', expected: true, desc: 'Strong complex' },
    { p: 'MyS3cr3tP@ssw0rdIsStrong2024!', expected: true, desc: 'Very strong' }
];

console.log('🔒 Testing Password Policy (zxcvbn implementation)\n');

let passed = 0;
let failed = 0;

testPasswords.forEach(({ p, expected, desc }) => {
    const result = validatePasswordStrength(p);
    const success = result.isValid === expected;

    const status = success ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`${status} [${desc}] "${p}"`);
    console.log(`     -> Valid: ${result.isValid}, Score: ${result.score}`);
    if (!success) {
        console.log(`     -> Errors: ${result.errors.join(', ')}`);
        failed++;
    } else {
        passed++;
    }
    console.log('------------------------------------------------');
});

console.log(`\nSummary: ${passed} Passed, ${failed} Failed`);
if (failed > 0) process.exit(1);
