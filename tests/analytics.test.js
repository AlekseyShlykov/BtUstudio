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

test('media, startup and university campaigns map to their segments', () => {
  const media = analytics.parseOutreachAttribution(
    'https://buildtounderstand.com/archive.html?utm_source=outreach&utm_medium=email&utm_campaign=btu_media&utm_content=step_2'
  );
  const startup = analytics.parseOutreachAttribution(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_startups&utm_content=step_1'
  );
  const university = analytics.parseOutreachAttribution(
    'https://buildtounderstand.com/science.html?utm_source=outreach&utm_medium=email&utm_campaign=btu_universities&utm_content=step_3'
  );
  assert.equal(media.outreachSegment, 'media');
  assert.equal(media.emailStep, 2);
  assert.equal(startup.outreachSegment, 'startups');
  assert.equal(startup.emailStep, 1);
  assert.equal(university.outreachSegment, 'universities');
  assert.equal(university.emailStep, 3);
});

test('valid message hypothesis is stored and mapped to the GA campaign term', () => {
  const browser = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_media&utm_content=step_1&utm_term=media_understanding_engagement'
  );
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();

  assert.equal(runtime.getAttribution().messageHypothesisId, 'media_understanding_engagement');
  assert.equal(
    JSON.parse(browser.storage.values.get('btu-outreach-attribution-v1')).messageHypothesisId,
    'media_understanding_engagement'
  );

  runtime.setConsent(true);
  assert.equal(commands(browser.win, 'config')[0][2].campaign_term, 'media_understanding_engagement');
  assert.equal(
    commands(browser.win, 'event', 'page_view')[0][2].campaign_term,
    'media_understanding_engagement'
  );
  assert.equal(
    commands(browser.win, 'event', 'outreach_landing')[0][2].message_hypothesis_id,
    'media_understanding_engagement'
  );
});

test('hypothesis from another campaign is dropped without losing campaign attribution', () => {
  const browser = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_media&utm_content=step_2&utm_term=museum_pre_visit_understanding'
  );
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);

  assert.deepEqual(runtime.getAttribution(), {
    outreachCampaign: 'btu_media',
    outreachSegment: 'media',
    emailStep: 2,
    landingPath: '/'
  });
  assert.equal(commands(browser.win, 'config')[0][2].campaign_name, 'btu_media');
  assert.equal(commands(browser.win, 'config')[0][2].campaign_term, undefined);
  assert.doesNotMatch(JSON.stringify(browser.win.dataLayer), /museum_pre_visit_understanding/);
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

test('stored hypothesis is revalidated against its campaign', () => {
  const stored = JSON.stringify({
    outreachCampaign: 'btu_universities',
    outreachSegment: 'universities',
    emailStep: 1,
    landingPath: '/',
    messageHypothesisId: 'startup_b2b_value_explanation'
  });
  const storage = createStorage({ 'btu-outreach-attribution-v1': stored });
  const browser = createBrowser('https://buildtounderstand.com/cases.html', storage);
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);

  assert.equal(runtime.getAttribution().messageHypothesisId, undefined);
  assert.equal(commands(browser.win, 'config')[0][2].campaign_name, 'btu_universities');
  assert.equal(commands(browser.win, 'config')[0][2].campaign_term, undefined);
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

test('different hypotheses have distinct outreach landing signatures', () => {
  const storage = createStorage();
  const first = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_media&utm_content=step_1&utm_term=media_series_entry_point',
    storage
  );
  const firstRuntime = analytics.createAnalytics(first.win);
  firstRuntime.init();
  firstRuntime.setConsent(true);

  const second = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_media&utm_content=step_1&utm_term=media_audience_entry_point',
    storage
  );
  const secondRuntime = analytics.createAnalytics(second.win);
  secondRuntime.init();
  secondRuntime.setConsent(true);

  assert.equal(commands(first.win, 'event', 'outreach_landing').length, 1);
  assert.equal(commands(second.win, 'event', 'outreach_landing').length, 1);
});

test('outreach attribution and hypothesis persist across internal pages', () => {
  const storage = createStorage();
  const landing = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_startups&utm_content=step_3&utm_term=startup_b2b_interactive_case_study',
    storage
  );
  const landingRuntime = analytics.createAnalytics(landing.win);
  landingRuntime.init();
  landingRuntime.setConsent(true);

  const internalPage = createBrowser('https://buildtounderstand.com/team.html?story=scifi', storage);
  const internalRuntime = analytics.createAnalytics(internalPage.win);
  internalRuntime.init();
  internalRuntime.setConsent(true);

  assert.equal(internalRuntime.getAttribution().messageHypothesisId, 'startup_b2b_interactive_case_study');
  assert.equal(
    commands(internalPage.win, 'event', 'page_view')[0][2].campaign_term,
    'startup_b2b_interactive_case_study'
  );
  assert.equal(commands(internalPage.win, 'event', 'outreach_landing').length, 0);
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

test('analytics exposes only current site capabilities', () => {
  assert.deepEqual(Object.keys(analytics).sort(), [
    'CAMPAIGN_SEGMENTS',
    'MEASUREMENT_ID',
    'UTM_KEYS',
    'campaignFields',
    'cleanAttributionUrl',
    'createAnalytics',
    'outreachEventParameters',
    'parseOutreachAttribution',
    'safePageLocation'
  ]);
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
  assert.equal((script.match(/trackGenerateLead\('contact_form'\)/g) || []).length, 1);
  assert.doesNotMatch(script, /onError:[\s\S]*trackGenerateLead/);
});

test('typed events are all blocked before analytics consent', () => {
  const browser = createBrowser('https://buildtounderstand.com/');
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();

  assert.equal(runtime.trackCaseProject('the_choice', 'image'), false);
  assert.equal(runtime.trackStoryShuffle('home', 'map', 'archive'), false);
  assert.equal(runtime.trackArchiveScanComplete('fern'), false);
  assert.equal(runtime.trackContactIntent('nav'), false);
  assert.equal(commands(browser.win, 'event').length, 0);
});

test('typed methods send fixed events and outreach attribution after consent', () => {
  const browser = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_museums&utm_content=step_2&utm_term=museum_archive_reactivation'
  );
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);

  assert.equal(runtime.trackCaseProject('reasonable_doubt', 'text'), true);
  assert.equal(runtime.trackStoryShuffle('cases', 'map', 'science'), true);
  assert.equal(runtime.trackArchiveScanComplete('mineral'), true);
  assert.equal(runtime.trackContactIntent('body'), true);

  assert.deepEqual(commands(browser.win, 'event', 'case_project_click')[0][2], {
    project_id: 'reasonable_doubt',
    link_position: 'text',
    outreach_campaign: 'btu_museums',
    outreach_segment: 'museums',
    email_step: 2,
    message_hypothesis_id: 'museum_archive_reactivation'
  });
  assert.deepEqual(commands(browser.win, 'event', 'story_shuffle')[0][2], {
    page_type: 'cases',
    from_story: 'map',
    to_story: 'science',
    outreach_campaign: 'btu_museums',
    outreach_segment: 'museums',
    email_step: 2,
    message_hypothesis_id: 'museum_archive_reactivation'
  });
  assert.deepEqual(commands(browser.win, 'event', 'archive_scan_complete')[0][2], {
    interaction_id: 'archive_scanner',
    item_id: 'mineral',
    outreach_campaign: 'btu_museums',
    outreach_segment: 'museums',
    email_step: 2,
    message_hypothesis_id: 'museum_archive_reactivation'
  });
  assert.deepEqual(commands(browser.win, 'event', 'contact_intent')[0][2], {
    placement: 'body',
    outreach_campaign: 'btu_museums',
    outreach_segment: 'museums',
    email_step: 2,
    message_hypothesis_id: 'museum_archive_reactivation'
  });
});

test('typed methods reject values outside their allowlists', () => {
  const browser = createBrowser('https://buildtounderstand.com/');
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);
  const initialEventCount = commands(browser.win, 'event').length;

  assert.equal(runtime.trackCaseProject('personal_project', 'image'), false);
  assert.equal(runtime.trackCaseProject('the_choice', 'hero'), false);
  assert.equal(runtime.trackStoryShuffle('archive', 'map', 'science'), false);
  assert.equal(runtime.trackStoryShuffle('home', 'story_from_url', 'science'), false);
  assert.equal(runtime.trackStoryShuffle('home', 'map', 'story_from_url'), false);
  assert.equal(runtime.trackArchiveScanComplete('drawer_42'), false);
  assert.equal(runtime.trackContactIntent('modal'), false);
  assert.equal(commands(browser.win, 'event').length, initialEventCount);
});

test('cases story and hash survive cleanup and outreach has only approved fields', () => {
  const browser = createBrowser(
    'https://buildtounderstand.com/cases.html?story=map&utm_source=outreach&utm_medium=email&utm_campaign=btu_media&utm_content=step_2#top'
  );
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);

  assert.equal(browser.win.location.href, 'https://buildtounderstand.com/cases.html?story=map#top');
  const events = commands(browser.win, 'event', 'outreach_landing');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0][2], {
    outreach_campaign: 'btu_media',
    outreach_segment: 'media',
    email_step: 2,
    landing_path: '/cases.html'
  });
});

test('invalid partial attribution is cleaned without creating analytics attribution', () => {
  const browser = createBrowser(
    'https://buildtounderstand.com/team.html?story=science&utm_source=outreach&utm_medium=cpc&utm_campaign=btu_media&preview=1#people'
  );
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();

  assert.equal(runtime.getAttribution(), null);
  assert.equal(browser.win.location.href, 'https://buildtounderstand.com/team.html?story=science&preview=1#people');
  assert.equal(browser.storage.values.has('btu-outreach-attribution-v1'), false);
});

test('repeat initialization and consent grants do not duplicate page events', () => {
  const browser = createBrowser(
    'https://buildtounderstand.com/?utm_source=outreach&utm_medium=email&utm_campaign=btu_museums&utm_content=step_0'
  );
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.init();
  runtime.setConsent(true);
  runtime.setConsent(true);

  assert.equal(commands(browser.win, 'consent', 'default').length, 1);
  assert.equal(commands(browser.win, 'config').length, 1);
  assert.equal(commands(browser.win, 'event', 'page_view').length, 1);
  assert.equal(commands(browser.win, 'event', 'outreach_landing').length, 1);
  assert.equal(browser.scripts.length, 1);
});

test('withdrawing consent stops future lead events without duplicating page views', () => {
  const browser = createBrowser('https://buildtounderstand.com/');
  const runtime = analytics.createAnalytics(browser.win);
  runtime.init();
  runtime.setConsent(true);
  runtime.setConsent(false);

  assert.equal(runtime.trackGenerateLead('contact_form'), false);
  runtime.setConsent(true);
  assert.equal(commands(browser.win, 'event', 'page_view').length, 1);
  assert.equal(commands(browser.win, 'event', 'generate_lead').length, 0);
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

test('site interaction hooks call only the typed analytics methods at the required moments', () => {
  const cases = fs.readFileSync(path.resolve(__dirname, '../cases.html'), 'utf8');
  const script = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const shuffle = fs.readFileSync(path.resolve(__dirname, '../story-shuffle.js'), 'utf8');
  const variants = fs.readFileSync(path.resolve(__dirname, '../image-variants.js'), 'utf8');

  const projectAttributes = cases.match(/data-case-project="[^"]+"/g) || [];
  const positionAttributes = cases.match(/data-case-link-position="(?:image|text)"/g) || [];
  assert.equal(projectAttributes.length, 8);
  assert.equal(positionAttributes.length, 8);
  for (const projectId of [
    'the_choice',
    'brain_shapes_behavior',
    'reasonable_doubt',
    'evolution_of_civilizations'
  ]) {
    assert.equal(projectAttributes.filter(value => value.includes(`"${projectId}"`)).length, 2);
  }

  assert.match(script, /data-case-project[\s\S]{0,180}addEventListener\('click'[\s\S]{0,180}trackCaseProject/);
  assert.match(script, /a\[href\*="#contact"\][\s\S]+addEventListener\('click'[\s\S]+trackContactIntent/);
  assert.match(shuffle, /trackStoryShuffle\(pageType, activeStory, targetStory\);\s*location\.assign\(target\)/);
  assert.match(
    variants,
    /result\.hidden = false;[\s\S]{0,240}stage\.dataset\.scanState = 'complete';\s*window\.BTUAnalytics\?\.trackArchiveScanComplete/
  );
});

test('all changed scripts use the shared outreach event cache version', () => {
  const version = '20260927-outreach-events-1';
  const htmlFiles = fs.readdirSync(path.resolve(__dirname, '..'))
    .filter(file => file.endsWith('.html'));

  htmlFiles.forEach(file => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    for (const scriptName of ['analytics.js', 'script.js', 'story-shuffle.js']) {
      assert.match(html, new RegExp(`${scriptName.replace('.', '\\.') }\\?v=${version}`), `${file}: ${scriptName}`);
    }
    if (html.includes('image-variants.js')) {
      assert.match(html, new RegExp(`image-variants\\.js\\?v=${version}`), `${file}: image-variants.js`);
    }
  });
});
