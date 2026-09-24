'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const analytics = require('../analytics.js');
const privacy = require('../privacy-controls.js');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    values
  };
}

function createStyle() {
  const values = new Map();
  return {
    setProperty: (name, value) => values.set(name, value),
    removeProperty: name => values.delete(name),
    getPropertyValue: name => values.get(name) || ''
  };
}

function matchesSelector(element, selector) {
  if (selector === 'footer') return element.tagName === 'FOOTER';
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  const attribute = /^\[([^\]]+)\]$/.exec(selector);
  return Boolean(attribute && element.attributes.has(attribute[1]));
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.style = createStyle();
    this.textContent = '';
    this.hidden = false;
    this.offsetHeight = 280;
    this._className = '';
    this.classList = {
      add: name => {
        const classes = new Set(this._className.split(/\s+/).filter(Boolean));
        classes.add(name);
        this._className = [...classes].join(' ');
      },
      remove: name => {
        this._className = this._className
          .split(/\s+/)
          .filter(value => value && value !== name)
          .join(' ');
      },
      contains: name => this._className.split(/\s+/).includes(name)
    };
  }

  set className(value) {
    this._className = String(value);
  }

  get className() {
    return this._className;
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  append(...nodes) {
    nodes.forEach(node => {
      node.parentNode = this;
      this.children.push(node);
    });
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    event.currentTarget = this;
    (this.listeners.get(event.type) || []).forEach(callback => callback(event));
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  querySelector(selector) {
    if (matchesSelector(this, selector)) return this;
    for (const child of this.children) {
      const match = child.querySelector(selector);
      if (match) return match;
    }
    return null;
  }
}

class FakeDocument {
  constructor() {
    this.readyState = 'complete';
    this.referrer = '';
    this.listeners = new Map();
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.footer = new FakeElement('footer', this);
    this.cookies = new Map();
    this.cookieWrites = [];
    this.documentElement.append(this.head, this.body);
    this.body.append(this.footer);
    this.activeElement = this.body;
  }

  set cookie(serialized) {
    this.cookieWrites.push(String(serialized));
    const [pair, ...attributes] = String(serialized).split(';').map(value => value.trim());
    const separator = pair.indexOf('=');
    if (separator < 1) return;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const expired = attributes.some(attribute => attribute.toLowerCase() === 'max-age=0');
    if (expired) this.cookies.delete(name);
    else this.cookies.set(name, value);
  }

  get cookie() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }
}

function createWindow(options = {}) {
  const document = new FakeDocument();
  if (options.cookie) document.cookie = options.cookie;
  const localStorage = options.localStorage || createStorage();
  const sessionStorage = options.sessionStorage || createStorage();
  const calls = [];
  const events = [];
  const listeners = new Map();
  let currentUrl = new URL(options.href || 'https://buildtounderstand.com/');
  const location = {};

  function updateLocation() {
    location.href = currentUrl.href;
    location.pathname = currentUrl.pathname;
    location.protocol = currentUrl.protocol;
    location.hostname = currentUrl.hostname;
  }
  updateLocation();

  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  const win = {
    document,
    localStorage,
    sessionStorage,
    location,
    history: {
      state: null,
      replaceState: (_state, _title, relativeUrl) => {
        currentUrl = new URL(relativeUrl, currentUrl);
        updateLocation();
      }
    },
    CustomEvent,
    requestAnimationFrame: callback => callback(),
    addEventListener: (name, callback) => {
      const callbacks = listeners.get(name) || [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
    },
    dispatchEvent: event => {
      events.push(event);
      (listeners.get(event.type) || []).forEach(callback => callback(event));
      return true;
    }
  };

  if (options.analytics !== false) {
    win.BTUAnalytics = {
      setConsent: granted => calls.push(granted)
    };
  }

  return { win, document, localStorage, sessionStorage, calls, events };
}

function dataLayerCommands(win, name, eventName) {
  return (win.dataLayer || [])
    .map(command => Array.from(command))
    .filter(command => command[0] === name && (!eventName || command[1] === eventName));
}

test('first visit shows accessible equal-choice controls without granting consent', () => {
  const browser = createWindow();
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();

  const panel = browser.document.querySelector('[data-btu-privacy-panel]');
  const settings = browser.document.querySelector('[data-btu-privacy-settings]');
  const allow = browser.document.querySelector('[data-consent-allow]');
  const deny = browser.document.querySelector('[data-consent-deny]');
  const details = browser.document.querySelector('[data-consent-details]');

  assert.equal(controls.isOpen(), true);
  assert.equal(browser.calls.length, 0);
  assert.equal(browser.document.cookie, '');
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('aria-modal'), 'false');
  assert.equal(panel.getAttribute('aria-hidden'), 'false');
  assert.equal(settings.textContent, 'Privacy settings');
  assert.equal(allow.textContent, 'Allow analytics');
  assert.equal(deny.textContent, 'Only necessary');
  assert.equal(allow.getAttribute('aria-pressed'), 'false');
  assert.equal(deny.getAttribute('aria-pressed'), 'false');
  assert.equal(browser.document.querySelector('#btu-privacy-description').textContent, privacy.CONSENT_TEXT);
  assert.ok(privacy.CONSENT_TEXT.length < 150);
  assert.equal(browser.document.querySelector('#btu-privacy-title').textContent, 'Cookies');
  assert.equal(panel.classList.contains('btu-privacy-panel--initial'), true);
  assert.equal(details.tagName, 'DETAILS');
  assert.notEqual(details.open, true);
  assert.equal(browser.document.querySelector('[data-consent-status]').hidden, true);
  assert.equal(browser.document.querySelector('[data-consent-necessary-state]').textContent, 'Always active');
  assert.equal(browser.document.querySelector('[data-consent-analytics-state]').textContent, 'Off');
  assert.equal(browser.document.activeElement, panel);
});

test('allow persists only granted, notifies analytics, closes, and restores focus', () => {
  const browser = createWindow();
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();
  browser.document.querySelector('[data-consent-allow]').click();

  const settings = browser.document.querySelector('[data-btu-privacy-settings]');
  assert.deepEqual(browser.calls, [true]);
  assert.equal(browser.localStorage.values.get(privacy.CONSENT_STORAGE_KEY), 'granted');
  assert.deepEqual([...browser.localStorage.values.keys()], [privacy.CONSENT_STORAGE_KEY]);
  assert.equal(browser.document.cookies.get(privacy.CONSENT_COOKIE_KEY), 'granted');
  assert.equal(browser.document.querySelector('[data-consent-analytics-state]').textContent, 'Allowed');
  assert.match(
    browser.document.cookieWrites.at(-1),
    /Max-Age=15552000; Path=\/; SameSite=Lax; Secure$/
  );
  assert.equal(controls.isOpen(), false);
  assert.equal(browser.document.activeElement, settings);
  assert.equal(settings.getAttribute('aria-expanded'), 'false');
});

test('only necessary persists denied and sends no positive consent', () => {
  const browser = createWindow();
  browser.document.cookie = '_ga=existing-client-id';
  browser.document.cookie = '_ga_MLTXHWTCJ9=existing-session';
  browser.document.cookie = 'unrelated=keep';
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();
  browser.document.querySelector('[data-consent-deny]').click();

  assert.deepEqual(browser.calls, [false]);
  assert.equal(browser.localStorage.values.get(privacy.CONSENT_STORAGE_KEY), 'denied');
  assert.equal(browser.document.cookies.get(privacy.CONSENT_COOKIE_KEY), 'denied');
  assert.equal(browser.document.cookies.has('_ga'), false);
  assert.equal(browser.document.cookies.has('_ga_MLTXHWTCJ9'), false);
  assert.equal(browser.document.cookies.get('unrelated'), 'keep');
  assert.equal(controls.getDecision(), 'denied');
  assert.equal(controls.isOpen(), false);
});

test('stored choice is applied once and settings can revoke it without reload', () => {
  const localStorage = createStorage({ [privacy.CONSENT_STORAGE_KEY]: 'granted' });
  const browser = createWindow({ localStorage });
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();
  controls.init();

  assert.deepEqual(browser.calls, [true]);
  assert.equal(controls.isOpen(), false);
  browser.document.querySelector('[data-btu-privacy-settings]').click();
  assert.equal(browser.document.querySelector('[data-consent-status]').hidden, false);
  assert.equal(browser.document.querySelector('[data-consent-allow]').getAttribute('aria-pressed'), 'true');
  assert.equal(browser.document.querySelector('[data-btu-privacy-panel]').classList.contains('btu-privacy-panel--initial'), false);
  browser.document.querySelector('[data-consent-deny]').click();
  assert.deepEqual(browser.calls, [true, false]);
  assert.equal(localStorage.values.get(privacy.CONSENT_STORAGE_KEY), 'denied');
  assert.equal(browser.document.cookies.get(privacy.CONSENT_COOKIE_KEY), 'denied');
});

test('necessary preference cookie restores the decision if local storage was cleared', () => {
  const browser = createWindow({
    cookie: `${privacy.CONSENT_COOKIE_KEY}=denied`
  });
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();

  assert.equal(controls.getDecision(), 'denied');
  assert.equal(controls.isOpen(), false);
  assert.equal(browser.localStorage.values.get(privacy.CONSENT_STORAGE_KEY), 'denied');
  assert.deepEqual(browser.calls, [false]);
});

test('saved panel can be closed with Escape and returns focus to its opener', () => {
  const localStorage = createStorage({ [privacy.CONSENT_STORAGE_KEY]: 'denied' });
  const browser = createWindow({ localStorage });
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();
  const settings = browser.document.querySelector('[data-btu-privacy-settings]');
  settings.focus();
  settings.click();

  let prevented = false;
  browser.document.querySelector('[data-btu-privacy-panel]').dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault: () => { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(controls.isOpen(), false);
  assert.equal(browser.document.activeElement, settings);
});

test('consent falls back to a safe custom event when analytics loads later', () => {
  const browser = createWindow({ analytics: false });
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();
  controls.choose('granted');

  assert.equal(browser.win.BTU_ANALYTICS_CONSENT, true);
  assert.equal(browser.events.length, 1);
  assert.equal(browser.events[0].type, 'btu:analytics-consent');
  assert.deepEqual(browser.events[0].detail, { granted: true });
});

test('real analytics loads and emits page events only after the UI grants consent', () => {
  const browser = createWindow({
    analytics: false,
    href: 'https://buildtounderstand.com/cases.html?story=map&utm_source=outreach&utm_medium=email&utm_campaign=btu_universities&utm_content=step_3#top'
  });
  const runtime = analytics.createAnalytics(browser.win);
  browser.win.BTUAnalytics = runtime;
  runtime.init();
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();

  assert.equal(dataLayerCommands(browser.win, 'config').length, 0);
  assert.equal(dataLayerCommands(browser.win, 'event').length, 0);
  assert.equal(browser.document.head.children.length, 0);
  browser.document.querySelector('[data-consent-allow]').click();

  assert.equal(browser.win.location.href, 'https://buildtounderstand.com/cases.html?story=map#top');
  assert.equal(dataLayerCommands(browser.win, 'config').length, 1);
  assert.equal(dataLayerCommands(browser.win, 'event', 'page_view').length, 1);
  assert.equal(dataLayerCommands(browser.win, 'event', 'outreach_landing').length, 1);
  assert.equal(browser.document.head.children.length, 1);

  browser.document.querySelector('[data-btu-privacy-settings]').click();
  browser.document.querySelector('[data-consent-deny]').click();
  assert.equal(runtime.trackGenerateLead('contact_form'), false);
  assert.equal(dataLayerCommands(browser.win, 'event', 'generate_lead').length, 0);
});

test('stored grant configures real analytics once without reopening the first-visit panel', () => {
  const localStorage = createStorage({ [privacy.CONSENT_STORAGE_KEY]: 'granted' });
  const browser = createWindow({ analytics: false, localStorage });
  const runtime = analytics.createAnalytics(browser.win);
  browser.win.BTUAnalytics = runtime;
  runtime.init();
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();
  controls.init();

  assert.equal(controls.isOpen(), false);
  assert.equal(dataLayerCommands(browser.win, 'config').length, 1);
  assert.equal(dataLayerCommands(browser.win, 'event', 'page_view').length, 1);
  assert.equal(browser.document.head.children.length, 1);
});

test('outreach refusal keeps attribution locally but loads and emits nothing', () => {
  const browser = createWindow({
    analytics: false,
    href: 'https://buildtounderstand.com/team.html?story=map&utm_source=outreach&utm_medium=email&utm_campaign=btu_museums&utm_content=step_0#people'
  });
  const runtime = analytics.createAnalytics(browser.win);
  browser.win.BTUAnalytics = runtime;
  runtime.init();
  const controls = privacy.createPrivacyControls(browser.win);
  controls.init();
  browser.document.querySelector('[data-consent-deny]').click();

  assert.equal(browser.win.location.href, 'https://buildtounderstand.com/team.html?story=map#people');
  assert.equal(JSON.parse(browser.sessionStorage.values.get('btu-outreach-attribution-v1')).outreachCampaign, 'btu_museums');
  assert.equal(dataLayerCommands(browser.win, 'config').length, 0);
  assert.equal(dataLayerCommands(browser.win, 'event').length, 0);
  assert.equal(browser.document.head.children.length, 0);
});

test('all site pages load the consent UI assets and keep a footer control host', () => {
  const root = path.resolve(__dirname, '..');
  const pages = fs.readdirSync(root).filter(file => file.endsWith('.html'));
  assert.ok(pages.length >= 9);
  pages.forEach(page => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /privacy-controls\.js\?v=20260924-compact-consent-2/);
    assert.match(html, /privacy-controls\.css\?v=20260924-compact-consent-2/);
    assert.match(html, /<footer(?:\s|>)/);
  });
});

test('privacy styles provide a compact, shadowless prompt with equal choices and mobile clearance', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../privacy-controls.css'), 'utf8');
  assert.match(css, /\.btu-privacy-choices[\s\S]*grid-template-columns:\s*1fr 1fr/);
  assert.match(css, /\.btu-privacy-categories/);
  assert.match(css, /\.btu-privacy-details/);
  assert.match(css, /\.btu-privacy-panel--initial \.btu-privacy-details[\s\S]*display:\s*none/);
  assert.match(css, /width:\s*min\(420px/);
  assert.match(css, /box-shadow:\s*none/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /body\.btu-privacy-open/);
  assert.match(css, /max-height:\s*calc\(100dvh/);
  assert.match(css, /@media \(max-width: 800px\)/);
});
