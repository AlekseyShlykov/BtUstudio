(function (root, factory) {
  const library = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = library;
  }

  if (root && root.document) {
    if (root.BTUPrivacyControls && root.BTUPrivacyControls.version === 1) {
      root.BTUPrivacyControls.init();
    } else {
      const controls = library.createPrivacyControls(root);
      root.BTUPrivacyControls = controls;
      controls.init();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONSENT_STORAGE_KEY = 'btu_analytics_consent_v1';
  const CONSENT_COOKIE_KEY = 'btu_privacy_choice_v1';
  const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
  const GRANTED = 'granted';
  const DENIED = 'denied';
  const CONSENT_TEXT = 'We use optional Google Analytics cookies to measure visits and outreach. They stay off unless you allow them. A necessary cookie saves your choice.';
  const PRIVACY_TEXT = 'Change this choice any time with Privacy settings in the footer.';
  const NECESSARY_TEXT = 'Saves this choice for six months. Site preferences may use local or session storage.';
  const ANALYTICS_TEXT = 'Measures visits and outreach only after you allow it. Analytics cookies are removed after refusal.';

  function isConsentDecision(value) {
    return value === GRANTED || value === DENIED;
  }

  function readConsent(storage) {
    try {
      const value = storage && storage.getItem(CONSENT_STORAGE_KEY);
      return isConsentDecision(value) ? value : null;
    } catch {
      return null;
    }
  }

  function saveConsent(storage, value) {
    if (!isConsentDecision(value)) return false;
    try {
      if (!storage) return false;
      storage.setItem(CONSENT_STORAGE_KEY, value);
      return true;
    } catch {
      return false;
    }
  }

  function readConsentCookie(doc) {
    try {
      const cookies = String((doc && doc.cookie) || '').split(';');
      const prefix = `${CONSENT_COOKIE_KEY}=`;
      const match = cookies.map(value => value.trim()).find(value => value.startsWith(prefix));
      if (!match) return null;
      const value = decodeURIComponent(match.slice(prefix.length));
      return isConsentDecision(value) ? value : null;
    } catch {
      return null;
    }
  }

  function saveConsentCookie(doc, value, location) {
    if (!isConsentDecision(value) || !doc) return false;
    try {
      const secure = location && location.protocol === 'https:' ? '; Secure' : '';
      doc.cookie = `${CONSENT_COOKIE_KEY}=${encodeURIComponent(value)}; Max-Age=${CONSENT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
      return true;
    } catch {
      return false;
    }
  }

  function clearAnalyticsCookies(doc, location) {
    if (!doc) return 0;
    let names;
    try {
      names = String(doc.cookie || '')
        .split(';')
        .map(value => value.trim().split('=')[0])
        .filter(name => /^_ga(?:_|$)/.test(name));
    } catch {
      return 0;
    }

    const hostname = location && location.hostname;
    const domains = hostname
      ? [hostname, ...(hostname.startsWith('www.') ? [hostname.slice(4)] : [])]
      : [];
    const secure = location && location.protocol === 'https:' ? '; Secure' : '';

    names.forEach(name => {
      try {
        const expired = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
        doc.cookie = expired;
        domains.forEach(domain => {
          doc.cookie = `${expired}; Domain=${domain}`;
        });
      } catch {
        // Cookie restrictions must not break consent withdrawal.
      }
    });
    return names.length;
  }

  function notifyAnalytics(win, granted) {
    win.BTU_ANALYTICS_CONSENT = granted;
    if (win.BTUAnalytics && typeof win.BTUAnalytics.setConsent === 'function') {
      win.BTUAnalytics.setConsent(granted);
      return 'direct';
    }
    if (typeof win.dispatchEvent === 'function' && typeof win.CustomEvent === 'function') {
      win.dispatchEvent(new win.CustomEvent('btu:analytics-consent', {
        detail: { granted }
      }));
      return 'event';
    }
    return null;
  }

  function createPrivacyControls(win) {
    const doc = win.document;
    let storage = null;
    try {
      storage = win.localStorage;
    } catch {
      // The choice still applies to the current page if storage is unavailable.
    }

    let initialized = false;
    let rendered = false;
    let decision = null;
    let panel = null;
    let status = null;
    let closeButton = null;
    let allowButton = null;
    let denyButton = null;
    let analyticsCategoryStatus = null;
    let settingsButton = null;
    let previousFocus = null;
    let initialPrompt = false;

    function createElement(tagName, options) {
      const element = doc.createElement(tagName);
      const config = options || {};
      if (config.className) element.className = config.className;
      if (config.id) element.id = config.id;
      if (config.text) element.textContent = config.text;
      Object.entries(config.attributes || {}).forEach(([name, value]) => {
        element.setAttribute(name, value);
      });
      return element;
    }

    function statusText() {
      if (decision === GRANTED) return 'Current choice: Analytics allowed.';
      if (decision === DENIED) return 'Current choice: Only necessary.';
      return 'No choice saved. Analytics is currently off.';
    }

    function updateState() {
      if (!status) return;
      status.textContent = statusText();
      status.hidden = !decision;
      allowButton.setAttribute('aria-pressed', String(decision === GRANTED));
      denyButton.setAttribute('aria-pressed', String(decision === DENIED));
      if (analyticsCategoryStatus) {
        analyticsCategoryStatus.textContent = decision === GRANTED ? 'Allowed' : 'Off';
      }
      closeButton.hidden = initialPrompt && !decision;
      if (settingsButton) settingsButton.setAttribute('aria-expanded', String(Boolean(panel && !panel.hidden)));
    }

    function updatePageOffset() {
      if (!panel || panel.hidden || !doc.documentElement || !doc.documentElement.style) return;
      const height = Number(panel.offsetHeight) || 0;
      doc.documentElement.style.setProperty('--btu-privacy-height', `${height}px`);
    }

    function openPanel(isInitial) {
      if (!panel) return;
      initialPrompt = isInitial === true && !decision;
      previousFocus = initialPrompt ? settingsButton : doc.activeElement;
      panel.hidden = false;
      if (initialPrompt) panel.classList.add('btu-privacy-panel--initial');
      else panel.classList.remove('btu-privacy-panel--initial');
      panel.setAttribute('aria-hidden', 'false');
      if (doc.body && doc.body.classList) doc.body.classList.add('btu-privacy-open');
      updateState();

      const focusPanel = () => {
        updatePageOffset();
        if (typeof panel.focus === 'function') panel.focus({ preventScroll: true });
      };
      if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(focusPanel);
      else focusPanel();
    }

    function closePanel(restoreFocus) {
      if (!panel) return;
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      if (doc.body && doc.body.classList) doc.body.classList.remove('btu-privacy-open');
      if (doc.documentElement && doc.documentElement.style) {
        doc.documentElement.style.removeProperty('--btu-privacy-height');
      }
      if (settingsButton) settingsButton.setAttribute('aria-expanded', 'false');
      if (restoreFocus !== false && previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true });
      }
    }

    function choose(nextDecision) {
      if (!isConsentDecision(nextDecision)) return false;
      decision = nextDecision;
      saveConsent(storage, decision);
      saveConsentCookie(doc, decision, win.location);
      notifyAnalytics(win, decision === GRANTED);
      if (decision === DENIED) clearAnalyticsCookies(doc, win.location);
      updateState();
      closePanel(true);
      return true;
    }

    function renderFooterControl() {
      const footer = doc.querySelector('footer');
      if (!footer || doc.querySelector('[data-btu-privacy-settings]')) return;
      settingsButton = createElement('button', {
        className: 'privacy-settings-button',
        text: 'Privacy settings',
        attributes: {
          type: 'button',
          'aria-haspopup': 'dialog',
          'aria-controls': 'btu-privacy-panel',
          'aria-expanded': 'false',
          'data-btu-privacy-settings': ''
        }
      });
      settingsButton.addEventListener('click', () => openPanel(false));
      footer.append(settingsButton);
    }

    function renderPanel() {
      if (!doc.body || doc.querySelector('[data-btu-privacy-panel]')) return;
      panel = createElement('section', {
        className: 'btu-privacy-panel',
        id: 'btu-privacy-panel',
        attributes: {
          role: 'dialog',
          tabindex: '-1',
          'aria-modal': 'false',
          'aria-labelledby': 'btu-privacy-title',
          'aria-describedby': 'btu-privacy-description',
          'aria-hidden': 'true',
          'data-btu-privacy-panel': ''
        }
      });
      panel.hidden = true;

      const headingRow = createElement('div', { className: 'btu-privacy-heading' });
      const heading = createElement('h2', { id: 'btu-privacy-title', text: 'Cookies' });
      closeButton = createElement('button', {
        className: 'btu-privacy-close',
        text: 'Close',
        attributes: { type: 'button', 'aria-label': 'Close privacy settings' }
      });
      closeButton.addEventListener('click', () => closePanel(true));
      headingRow.append(heading, closeButton);

      const description = createElement('p', {
        id: 'btu-privacy-description',
        text: CONSENT_TEXT
      });
      const details = createElement('details', {
        className: 'btu-privacy-details',
        attributes: { 'data-consent-details': '' }
      });
      const detailsSummary = createElement('summary', { text: 'Details' });
      details.addEventListener('toggle', updatePageOffset);
      const categories = createElement('div', {
        className: 'btu-privacy-categories',
        id: 'btu-cookie-categories'
      });
      const necessaryCategory = createElement('section', { className: 'btu-privacy-category' });
      const necessaryHeading = createElement('div', { className: 'btu-privacy-category-heading' });
      const necessaryTitle = createElement('h3', { text: 'Necessary cookie & storage' });
      const necessaryStatus = createElement('span', {
        className: 'btu-privacy-category-state',
        text: 'Always active',
        attributes: { 'data-consent-necessary-state': '' }
      });
      necessaryHeading.append(necessaryTitle, necessaryStatus);
      necessaryCategory.append(
        necessaryHeading,
        createElement('p', { text: NECESSARY_TEXT })
      );

      const analyticsCategory = createElement('section', { className: 'btu-privacy-category' });
      const analyticsHeading = createElement('div', { className: 'btu-privacy-category-heading' });
      const analyticsTitle = createElement('h3', { text: 'Analytics cookies' });
      analyticsCategoryStatus = createElement('span', {
        className: 'btu-privacy-category-state',
        text: 'Off',
        attributes: { 'aria-live': 'polite', 'data-consent-analytics-state': '' }
      });
      analyticsHeading.append(analyticsTitle, analyticsCategoryStatus);
      analyticsCategory.append(
        analyticsHeading,
        createElement('p', { text: ANALYTICS_TEXT })
      );
      categories.append(necessaryCategory, analyticsCategory);

      const detail = createElement('p', {
        className: 'btu-privacy-detail',
        id: 'btu-privacy-detail',
        text: PRIVACY_TEXT
      });
      details.append(detailsSummary, categories, detail);
      status = createElement('p', {
        className: 'btu-privacy-status',
        attributes: { 'aria-live': 'polite', 'data-consent-status': '' }
      });
      const choices = createElement('div', {
        className: 'btu-privacy-choices',
        attributes: { role: 'group', 'aria-label': 'Analytics preference' }
      });
      allowButton = createElement('button', {
        className: 'btu-consent-choice',
        text: 'Allow analytics',
        attributes: { type: 'button', 'data-consent-allow': '', 'aria-pressed': 'false' }
      });
      denyButton = createElement('button', {
        className: 'btu-consent-choice',
        text: 'Only necessary',
        attributes: { type: 'button', 'data-consent-deny': '', 'aria-pressed': 'false' }
      });
      allowButton.addEventListener('click', () => choose(GRANTED));
      denyButton.addEventListener('click', () => choose(DENIED));
      choices.append(allowButton, denyButton);
      panel.append(headingRow, description, details, status, choices);

      panel.addEventListener('keydown', event => {
        if (event.key === 'Escape' && decision) {
          event.preventDefault();
          closePanel(true);
        }
      });
      doc.body.append(panel);
    }

    function render() {
      if (rendered) return;
      rendered = true;
      renderFooterControl();
      renderPanel();
      if (!decision) openPanel(true);
      else updateState();
    }

    function init() {
      if (initialized) return;
      initialized = true;
      decision = readConsent(storage) || readConsentCookie(doc);
      if (decision) {
        saveConsent(storage, decision);
        saveConsentCookie(doc, decision, win.location);
        notifyAnalytics(win, decision === GRANTED);
        if (decision === DENIED) clearAnalyticsCookies(doc, win.location);
      }
      if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', render, { once: true });
      } else {
        render();
      }
      if (typeof win.addEventListener === 'function') {
        win.addEventListener('resize', updatePageOffset, { passive: true });
      }
    }

    return Object.freeze({
      version: 1,
      init,
      choose,
      openSettings: () => openPanel(false),
      getDecision: () => decision,
      isOpen: () => Boolean(panel && !panel.hidden)
    });
  }

  return Object.freeze({
    CONSENT_STORAGE_KEY,
    CONSENT_COOKIE_KEY,
    CONSENT_COOKIE_MAX_AGE,
    GRANTED,
    DENIED,
    CONSENT_TEXT,
    PRIVACY_TEXT,
    NECESSARY_TEXT,
    ANALYTICS_TEXT,
    isConsentDecision,
    readConsent,
    saveConsent,
    readConsentCookie,
    saveConsentCookie,
    clearAnalyticsCookies,
    notifyAnalytics,
    createPrivacyControls
  });
});
