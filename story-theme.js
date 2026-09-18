(() => {
  const stories = {
    map: { variant: '36', home: 'index.html' },
    archive: { variant: '40', home: 'archive.html' },
    origami: { variant: '51', home: 'origami.html' },
    scifi: { variant: '53', home: 'scifi.html' },
    fantasy: { variant: '54', home: 'fantasy.html' },
    detective: { variant: '55', home: 'detective.html' },
    science: { variant: '57', home: 'science.html' }
  };
  const legacyStories = { '36': 'map', '40': 'archive', '51': 'origami', '53': 'scifi', '54': 'fantasy', '55': 'detective', '57': 'science' };
  const normalizeStory = value => stories[value] ? value : (legacyStories[value] || null);
  const requestedRaw = new URLSearchParams(location.search).get('story');
  const requested = normalizeStory(requestedRaw);
  const storageKey = 'btu-active-story';
  const storyFromPage = value => {
    if (!value) return null;
    const file = value.split('/').pop()?.split(/[?#]/)[0] || '';
    if (file === 'index.html' || file === 'home-36.html' || file === '') return 'map';
    return Object.entries(stories).find(([, config]) => config.home === file)?.[0] || null;
  };
  let remembered = null;
  try { remembered = normalizeStory(sessionStorage.getItem(storageKey)); } catch {}
  const referred = storyFromPage(document.referrer);
  const story = stories[requested]
    ? requested
    : (stories[referred] ? referred : (stories[remembered] ? remembered : 'map'));
  const home = stories[story].home;

  try { sessionStorage.setItem(storageKey, story); } catch {}
  if ((requestedRaw && requestedRaw !== story) || (!requestedRaw && story !== 'map')) {
    const url = new URL(location.href);
    url.searchParams.set('story', story);
    history.replaceState(null, '', url);
  }

  document.body.classList.add('home-image-variant', `home-image-variant-${stories[story].variant}`);
  document.body.dataset.story = story;

  const setHref = (selector, href) => {
    document.querySelectorAll(selector).forEach(link => link.setAttribute('href', href));
  };

  const connectTheme = () => {
    setHref('[data-story-home]', home);
    setHref('[data-story-about]', `${home}#about`);
    setHref('[data-story-contact]', `${home}#contact`);
    setHref('[data-story-cases]', `cases.html?story=${story}`);
    setHref('[data-story-team]', `team.html?story=${story}`);

    document.querySelectorAll('.variant-menu-panel a').forEach(link => {
      link.removeAttribute('aria-current');
      const href = link.getAttribute('href') || '';
      const linkStory = storyFromPage(href);
      if (linkStory === story) link.setAttribute('aria-current', 'page');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connectTheme, { once: true });
  } else {
    connectTheme();
  }
})();
