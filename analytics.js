(function (root, factory) {
  const library = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = library;
  }

  if (root && root.document) {
    if (root.BTUAnalytics && root.BTUAnalytics.version === 1) {
      root.BTUAnalytics.init();
    } else {
      const analytics = library.createAnalytics(root);
      root.BTUAnalytics = analytics;
      analytics.init();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MEASUREMENT_ID = 'G-MLTXHWTCJ9';
  const UTM_KEYS = Object.freeze([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_id',
    'utm_term'
  ]);
  const CAMPAIGN_SEGMENTS = Object.freeze({
    btu_media: 'media',
    btu_museums: 'museums',
    btu_startups: 'startups',
    btu_universities: 'universities'
  });
  const ALLOWED_TERMS = new Set(Object.values(CAMPAIGN_SEGMENTS));
  const ATTRIBUTION_STORAGE_KEY = 'btu-outreach-attribution-v1';
  const SENT_STORAGE_KEY = 'btu-outreach-landing-sent-v1';
  const MAX_VALUE_LENGTH = 64;
  const MAX_PATH_LENGTH = 200;
  const DENIED_CONSENT = Object.freeze({
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });
  const GRANTED_ANALYTICS_CONSENT = Object.freeze({
    ad_storage: 'denied',
    analytics_storage: 'granted',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });

  function getSingleValue(searchParams, key) {
    const values = searchParams.getAll(key);
    if (values.length !== 1) return null;
    const value = values[0];
    return value.length <= MAX_VALUE_LENGTH ? value : null;
  }

  function safeLandingPath(pathname) {
    if (typeof pathname !== 'string' || pathname.length < 1 || pathname.length > MAX_PATH_LENGTH) {
      return '/';
    }
    return pathname.startsWith('/') ? pathname : '/';
  }

  function attributionSignature(attribution) {
    return `${attribution.outreachCampaign}|${attribution.emailStep}|${attribution.landingPath}`;
  }

  function validateStoredAttribution(value) {
    if (!value || typeof value !== 'object') return null;
    const segment = CAMPAIGN_SEGMENTS[value.outreachCampaign];
    if (!segment || value.outreachSegment !== segment) return null;
    if (!Number.isInteger(value.emailStep) || value.emailStep < 0 || value.emailStep > 3) return null;
    if (safeLandingPath(value.landingPath) !== value.landingPath) return null;

    const attribution = {
      outreachCampaign: value.outreachCampaign,
      outreachSegment: segment,
      emailStep: value.emailStep,
      landingPath: value.landingPath
    };

    if (Object.hasOwn(CAMPAIGN_SEGMENTS, value.campaignId)) {
      attribution.campaignId = value.campaignId;
    }
    if (ALLOWED_TERMS.has(value.campaignTerm)) {
      attribution.campaignTerm = value.campaignTerm;
    }

    return attribution;
  }

  function parseOutreachAttribution(input) {
    let url;
    try {
      url = new URL(input, 'https://buildtounderstand.com/');
    } catch {
      return null;
    }

    const source = getSingleValue(url.searchParams, 'utm_source');
    const medium = getSingleValue(url.searchParams, 'utm_medium');
    const campaign = getSingleValue(url.searchParams, 'utm_campaign');
    const content = getSingleValue(url.searchParams, 'utm_content');
    const contentMatch = content && /^step_([0-3])$/.exec(content);
    const segment = campaign && CAMPAIGN_SEGMENTS[campaign];

    if (source !== 'outreach' || medium !== 'email' || !segment || !contentMatch) {
      return null;
    }

    const attribution = {
      outreachCampaign: campaign,
      outreachSegment: segment,
      emailStep: Number(contentMatch[1]),
      landingPath: safeLandingPath(url.pathname)
    };

    const campaignId = getSingleValue(url.searchParams, 'utm_id');
    const campaignTerm = getSingleValue(url.searchParams, 'utm_term');

    // These optional fields are deliberately low-cardinality allowlists. Arbitrary
    // values could be recipient or click identifiers and must never reach GA.
    if (campaignId && Object.hasOwn(CAMPAIGN_SEGMENTS, campaignId)) {
      attribution.campaignId = campaignId;
    }
    if (campaignTerm && ALLOWED_TERMS.has(campaignTerm)) {
      attribution.campaignTerm = campaignTerm;
    }

    return attribution;
  }

  function cleanAttributionUrl(input) {
    let url;
    try {
      url = new URL(input, 'https://buildtounderstand.com/');
    } catch {
      return null;
    }

    let changed = false;
    UTM_KEYS.forEach(key => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });

    return {
      changed,
      relativeUrl: `${url.pathname}${url.search}${url.hash}`
    };
  }

  function safePageLocation(input) {
    if (!input) return '';
    try {
      const url = new URL(input, 'https://buildtounderstand.com/');
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  }

  function campaignFields(attribution) {
    if (!attribution) return {};
    const fields = {
      campaign_source: 'outreach',
      campaign_medium: 'email',
      campaign_name: attribution.outreachCampaign,
      campaign_content: `step_${attribution.emailStep}`
    };
    if (attribution.campaignId) fields.campaign_id = attribution.campaignId;
    if (attribution.campaignTerm) fields.campaign_term = attribution.campaignTerm;
    return fields;
  }

  function outreachEventParameters(attribution) {
    return {
      outreach_campaign: attribution.outreachCampaign,
      outreach_segment: attribution.outreachSegment,
      email_step: attribution.emailStep,
      landing_path: attribution.landingPath
    };
  }

  function readJson(storage, key) {
    try {
      const value = storage && storage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function writeJson(storage, key, value) {
    try {
      if (storage) storage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be disabled without disabling the site or analytics wrapper.
    }
  }

  function createAnalytics(win) {
    const doc = win.document;
    let storage = null;
    try {
      storage = win.sessionStorage;
    } catch {
      // Sandboxed contexts can throw while merely accessing sessionStorage.
    }
    let initialized = false;
    let configured = false;
    let consentGranted = false;
    let attribution = null;

    function ensureGtag() {
      win.dataLayer = win.dataLayer || [];
      if (typeof win.gtag !== 'function') {
        win.gtag = function () {
          win.dataLayer.push(arguments);
        };
      }
      return win.gtag;
    }

    function gtag() {
      try {
        ensureGtag().apply(win, arguments);
        return true;
      } catch {
        return false;
      }
    }

    function readSessionAttribution() {
      return validateStoredAttribution(readJson(storage, ATTRIBUTION_STORAGE_KEY));
    }

    function wasLandingSent(currentAttribution) {
      const sent = readJson(storage, SENT_STORAGE_KEY);
      return Array.isArray(sent) && sent.includes(attributionSignature(currentAttribution));
    }

    function markLandingSent(currentAttribution) {
      const signature = attributionSignature(currentAttribution);
      const existing = readJson(storage, SENT_STORAGE_KEY);
      const sent = Array.isArray(existing)
        ? existing.filter(value => typeof value === 'string').slice(-9)
        : [];
      if (!sent.includes(signature)) sent.push(signature);
      writeJson(storage, SENT_STORAGE_KEY, sent);
    }

    function loadGoogleTag() {
      try {
        const selector = `script[src*="googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"]`;
        if (doc.querySelector(selector)) return;
        const script = doc.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
        script.dataset.btuGoogleTag = 'true';
        (doc.head || doc.documentElement).appendChild(script);
      } catch {
        // Ad blockers and restrictive CSP must not affect the rest of the page.
      }
    }

    function currentPageContext() {
      const location = safePageLocation(win.location.href);
      const referrer = safePageLocation(doc.referrer || '');
      const context = { page_location: location, page_path: win.location.pathname };
      if (referrer) context.page_referrer = referrer;
      return context;
    }

    function configure() {
      if (configured || !consentGranted) return;
      configured = true;
      loadGoogleTag();

      const page = currentPageContext();
      const campaign = campaignFields(attribution);
      gtag('js', new Date());
      gtag('set', page);
      gtag('config', MEASUREMENT_ID, {
        send_page_view: false,
        ...page,
        ...campaign
      });
      gtag('event', 'page_view', {
        ...page,
        ...campaign
      });

      if (attribution && !wasLandingSent(attribution)) {
        gtag('event', 'outreach_landing', outreachEventParameters(attribution));
        markLandingSent(attribution);
      }
    }

    function configureWhenReady() {
      if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', configure, { once: true });
      } else {
        configure();
      }
    }

    function addAttribution(parameters) {
      if (!attribution) return parameters;
      return {
        ...parameters,
        outreach_campaign: attribution.outreachCampaign,
        email_step: attribution.emailStep
      };
    }

    function track(name, parameters) {
      if (!consentGranted || !configured) return false;
      return gtag('event', name, parameters);
    }

    function trackGenerateLead(method) {
      if (method !== 'contact_form') return false;
      return track('generate_lead', addAttribution({ method: 'contact_form' }));
    }

    function setConsent(granted) {
      consentGranted = granted === true;
      gtag('consent', 'update', consentGranted ? GRANTED_ANALYTICS_CONSENT : DENIED_CONSENT);
      if (consentGranted) configureWhenReady();
      return consentGranted;
    }

    function init() {
      if (initialized) return;
      initialized = true;

      // This must remain the first Google tag command on every page.
      gtag('consent', 'default', DENIED_CONSENT);

      const incomingAttribution = parseOutreachAttribution(win.location.href);
      if (incomingAttribution) {
        attribution = incomingAttribution;
        writeJson(storage, ATTRIBUTION_STORAGE_KEY, attribution);
      } else {
        attribution = readSessionAttribution();
      }

      const cleaned = cleanAttributionUrl(win.location.href);
      if (cleaned && cleaned.changed) {
        try {
          win.history.replaceState(win.history.state, '', cleaned.relativeUrl);
        } catch {
          // A failed cosmetic URL cleanup must not break the page.
        }
      }

      if (typeof win.addEventListener === 'function') {
        win.addEventListener('btu:analytics-consent', event => {
          setConsent(Boolean(event && event.detail && event.detail.granted));
        });
      }
      if (win.BTU_ANALYTICS_CONSENT === true) setConsent(true);
    }

    return Object.freeze({
      version: 1,
      init,
      setConsent,
      trackGenerateLead,
      getAttribution: () => attribution ? { ...attribution } : null
    });
  }

  return Object.freeze({
    MEASUREMENT_ID,
    UTM_KEYS,
    CAMPAIGN_SEGMENTS,
    cleanAttributionUrl,
    parseOutreachAttribution,
    campaignFields,
    outreachEventParameters,
    safePageLocation,
    createAnalytics
  });
});
