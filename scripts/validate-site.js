'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const analyticsTag = '<script src="analytics.js?v=20260924-compact-consent-2"></script>';
const privacyScriptTag = '<script src="privacy-controls.js?v=20260924-compact-consent-2"></script>';
const privacyStyleTag = '<link rel="stylesheet" href="privacy-controls.css?v=20260924-compact-consent-2">';
const publicPages = [
  'index.html',
  'archive.html',
  'detective.html',
  'fantasy.html',
  'origami.html',
  'science.html',
  'scifi.html',
  'cases.html',
  'team.html'
];

assert.ok(htmlFiles.length > 0, 'Expected at least one HTML page');
assert.match(
  fs.readFileSync(path.join(root, 'analytics.js'), 'utf8'),
  /G-MLTXHWTCJ9/,
  'The confirmed GA4 Measurement ID must be present'
);
publicPages.forEach(file => {
  assert.ok(htmlFiles.includes(file), `Expected public page ${file}`);
});

htmlFiles.forEach(file => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.equal(
    html.split(analyticsTag).length - 1,
    1,
    `${file} must include the shared analytics module exactly once`
  );
  assert.equal(
    html.split(privacyScriptTag).length - 1,
    1,
    `${file} must include the privacy controls exactly once`
  );
  assert.equal(
    html.split(privacyStyleTag).length - 1,
    1,
    `${file} must include the privacy styles exactly once`
  );
  assert.match(html, /<footer(?:\s|>)/, `${file} must provide a footer for Privacy settings`);
  assert.doesNotMatch(
    html,
    /googletagmanager\.com\/gtag\/js/,
    `${file} must not contain a second Google tag loader`
  );
});

console.log(`Validated ${htmlFiles.length} static HTML pages.`);
