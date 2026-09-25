import fs from 'node:fs';
import assert from 'node:assert/strict';

const reportPath = process.argv[2];
assert.ok(reportPath, 'Usage: node scripts/verify-report-version.mjs <report.json>');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
assert.equal(report.version, pkg.version, 'Evidence report version must match the checked-out package.json');
console.log(`Evidence report version verified: ${pkg.version}`);
