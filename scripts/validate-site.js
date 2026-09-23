'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const analyticsTag = '<script src="analytics.js?v=20260923-outreach-1"></script>';

assert.ok(htmlFiles.length > 0, 'Expected at least one HTML page');
assert.match(
  fs.readFileSync(path.join(root, 'analytics.js'), 'utf8'),
  /G-MLTXHWTCJ9/,
  'The confirmed GA4 Measurement ID must be present'
);

htmlFiles.forEach(file => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const matches = html.split(analyticsTag).length - 1;
  assert.equal(matches, 1, `${file} must include the shared analytics module exactly once`);
  assert.doesNotMatch(
    html,
    /googletagmanager\.com\/gtag\/js/,
    `${file} must not contain a second Google tag loader`
  );
});

console.log(`Validated ${htmlFiles.length} static HTML pages.`);
