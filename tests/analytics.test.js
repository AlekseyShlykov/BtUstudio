'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const analytics = require('../analytics.js');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    values
  };
}

function createBrowser(href, storage = createStorage(), options = {}) {
  let currentUrl = new URL(href);
  const listeners = new Map();
  const documentListeners = new Map();
  const scripts = [];
  const location = {};

  function syncLocation() {
    location.href = currentUrl.href;
    location.pathname = currentUrl.pathname;
  }
  syncLocation();

  const document = {
    readyState: options.readyState || 'complete',
    referrer: options.referrer || '',
    head: {
      appendChild: node => {
        if (options.blockScript) throw new Error('blocked');
        scripts.push(node);
      }
    },
    documentElement: { appendChild: node => scripts.push(node) },
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    addEventListener: (name, callback) => documentListeners.set(name, callback)
  };

  const win = {
    document,
    location,
    sessionStorage: storage,
    history: {
      state: null,
      replaceState: (_state, _title, relativeUrl) => {
        currentUrl = new URL(relativeUrl, currentUrl);
        syncLocation();
      }
    },
    addEventListener: (name, callback) => listeners.set(name, callback)
  };

  return { win, storage, scripts, listeners, documentListeners };
}

function commands(win, commandName, eventName) {
  return (win.dataLayer || [])
    .map(command => Array.from(command))
    .filter(command => command[0] === commandName && (!eventName || command[1] === eventName));
}

test('valid museum URL maps to museums and step 0', () => {
  const result = analytics.parseOutreachAttribution(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_museums&utm_content=step_0'
  );
  assert.deepEqual(result, {
    outreachCampaign: 'btu_museums',
    outreachSegment: 'museums',
    emailStep: 0,
    landingPath: '/'
  });
});

test('media and university campaigns map to their segments', () => {
  const media = analytics.parseOutreachAttribution(
    'https://buildtounderstand.com/archive.html?utm_source=outreach&utm_medium=email&utm_campaign=btu_media&utm_content=step_2'
  );
  const university = analytics.parseOutreachAttribution(
    'https://buildtounderstand.com/science.html?utm_source=outreach&utm_medium=email&utm_campaign=btu_universities&utm_content=step_3'
  );
  assert.equal(media.outreachSegment, 'media');
  assert.equal(media.emailStep, 2);
  assert.equal(university.outreachSegment, 'universities');
  assert.equal(university.emailStep, 3);
});

test('unknown campaign does not create outreach attribution', () => {
  assert.equal(analytics.parseOutreachAttribution(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=person_123&utm_content=step_0'
  ), null);
});

test('invalid source or medium does not create outreach attribution', () => {
  assert.equal(analytics.parseOutreachAttribution(
    'https://buildtounderstand.com/?utm_source=newsletter&utm_medium=email&utm_campaign=btu_media&utm_content=step_0'
  ), null);
  assert.equal(analytics.parseOutreachAttribution(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=cpc&utm_campaign=btu_media&utm_content=step_0'
  ), null);
});

test('PII-like and arbitrary parameters never enter GA commands', () => {
  const browser = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_media&utm_content=step_1&utm_id=recipient_987&utm_term=alex%40example.com&email=alex%40example.com&contact_id=42&token=secret&arbitrary=value'
  );
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);
  const serialized = JSON.stringify(browser.win.dataLayer);
  assert.doesNotMatch(serialized, /alex|recipient|contact_id|secret|arbitrary|token/i);
  assert.match(serialized, /btu_media/);
});

test('UTM parameters are removed while non-UTM parameters and hash remain', () => {
  const cleaned = analytics.cleanAttributionUrl(
    'https://buildtounderstand.com/cases.html?story=science&utm_source=outreach&utm_medium=email&utm_campaign=btu_museums&utm_content=step_0&preview=1#case-2'
  );
  assert.equal(cleaned.changed, true);
  assert.equal(cleaned.relativeUrl, '/cases.html?story=science&preview=1#case-2');
});

test('reload does not duplicate outreach_landing in one session', () => {
  const storage = createStorage();
  const href = 'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_museums&utm_content=step_0';
  const first = createBrowser(href, storage);
  const firstRuntime = analytics.createAnalytics(first.win);
  firstRuntime.init();
  firstRuntime.setConsent(true);
  assert.equal(commands(first.win, 'event', 'outreach_landing').length, 1);

  const reload = createBrowser('https://buildtounderstand.com/', storage);
  const reloadRuntime = analytics.createAnalytics(reload.win);
  reloadRuntime.init();
  reloadRuntime.setConsent(true);
  assert.equal(commands(reload.win, 'event', 'outreach_landing').length, 0);
});

test('URL cleanup and replaceState do not create a second page_view', () => {
  const browser = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_universities&utm_content=step_1'
  );
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);
  assert.equal(browser.win.location.href, 'https://buildtounderstand.com/');
  assert.equal(commands(browser.win, 'event', 'page_view').length, 1);
  assert.equal(commands(browser.win, 'config').length, 1);
  assert.equal(commands(browser.win, 'config')[0][2].send_page_view, false);
});

test('delegated Calendly tracking accepts the canonical link and safe variants', () => {
  assert.equal(analytics.isCalendlyLink('https://calendly.com/buildtounderstand/30min'), true);
  assert.equal(analytics.isCalendlyLink('https://calendly.com/buildtounderstand/30min/?month=2026-09'), true);
  assert.equal(analytics.isCalendlyLink('https://calendly.com/another-person/30min'), false);

  const browser = createBrowser('https://buildtounderstand.com/');
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);
  runtime.trackCalendlyClick({
    href: 'https://calendly.com/buildtounderstand/30min?utm_source=private',
    closest: selector => selector.includes('footer') ? {} : null
  });
  const events = commands(browser.win, 'event', 'calendly_click');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0][2], {
    link_url: 'https://calendly.com/buildtounderstand/30min',
    placement: 'footer'
  });
});

test('a Calendly click never generates generate_lead', () => {
  const browser = createBrowser('https://buildtounderstand.com/');
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);
  runtime.trackCalendlyClick({ href: analytics.CALENDLY_URL, closest: () => null });
  assert.equal(commands(browser.win, 'event', 'generate_lead').length, 0);
});

test('generate_lead requires the confirmed contact form method', () => {
  const browser = createBrowser('https://buildtounderstand.com/');
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);
  assert.equal(runtime.trackGenerateLead('click'), false);
  assert.equal(runtime.trackGenerateLead('contact_form'), true);
  assert.equal(commands(browser.win, 'event', 'generate_lead').length, 1);

  const script = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  assert.match(script, /onSuccess:[\s\S]*trackGenerateLead\('contact_form'\)/);
});

test('a blocked Google tag does not break the site-facing API', () => {
  const browser = createBrowser('https://buildtounderstand.com/', createStorage(), { blockScript: true });
  const runtime = analytics.createAnalytics(browser.win);
  assert.doesNotThrow(() => {
    runtime.init();
    runtime.setConsent(true);
    runtime.trackGenerateLead('contact_form');
  });
});

test('unavailable sessionStorage does not break initialization', () => {
  const browser = createBrowser('https://buildtounderstand.com/');
  Object.defineProperty(browser.win, 'sessionStorage', {
    get() { throw new Error('storage disabled'); }
  });
  assert.doesNotThrow(() => analytics.createAnalytics(browser.win).init());
});

test('denied consent emits no config, page view, outreach or lead events', () => {
  const browser = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_media&utm_content=step_0'
  );
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(false);
  runtime.trackGenerateLead('contact_form');

  assert.equal(commands(browser.win, 'consent', 'default').length, 1);
  assert.equal(commands(browser.win, 'config').length, 0);
  assert.equal(commands(browser.win, 'event').length, 0);
  assert.equal(browser.scripts.length, 0);
});

test('consent default precedes config and events', () => {
  const browser = createBrowser('https://buildtounderstand.com/');
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);
  const commandsInOrder = browser.win.dataLayer.map(command => Array.from(command));
  assert.deepEqual(commandsInOrder[0].slice(0, 2), ['consent', 'default']);
  assert.ok(commandsInOrder.findIndex(command => command[0] === 'config') > 0);
  assert.ok(commandsInOrder.findIndex(command => command[0] === 'event') > 0);
});
