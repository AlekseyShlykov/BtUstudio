(() => {
  const button = document.querySelector('.story-shuffle');
  if (!button) return;

  const storyIds = ['map','archive','origami','scifi','fantasy','detective','science'];
  const homePages = {
    map:'index.html',
    archive:'archive.html',
    origami:'origami.html',
    scifi:'scifi.html',
    fantasy:'fantasy.html',
    detective:'detective.html',
    science:'science.html'
  };
  const restoreKey = 'btu-random-story-position';
  const currentFile = location.pathname.split('/').pop() || 'index.html';
  const pageType = currentFile === 'cases.html'
    ? 'cases'
    : (currentFile === 'team.html' ? 'team' : 'home');
  const activeStory = pageType === 'home'
    ? (Object.entries(homePages).find(([, file]) => file === currentFile)?.[0] || 'map')
    : (document.body.dataset.story || new URLSearchParams(location.search).get('story') || 'map');
  const pageForStory = story => {
    if (pageType === 'cases') return `cases.html?story=${story}`;
    if (pageType === 'team') return `team.html?story=${story}`;
    return homePages[story] || 'index.html';
  };
  const currentKey = `${pageType}:${activeStory}`;
  if (activeStory) {
    try { sessionStorage.setItem('btu-active-story', activeStory); } catch {}
  }
  const landmarks = () => [...document.querySelectorAll('main > section, body > .footer-playground, body > footer')];
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  let savedPosition;
  try {
    savedPosition = JSON.parse(sessionStorage.getItem(restoreKey) || 'null');
  } catch {
    savedPosition = null;
  }

  if (savedPosition?.target === currentKey && Date.now() - savedPosition.savedAt < 15000) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    try { sessionStorage.removeItem(restoreKey); } catch {}

    let userMoved = false;
    const stopAutomaticRestore = event => {
      if (event.isTrusted) userMoved = true;
    };
    addEventListener('wheel', stopAutomaticRestore, { passive: true, once: true });
    addEventListener('touchstart', stopAutomaticRestore, { passive: true, once: true });
    addEventListener('keydown', stopAutomaticRestore, { once: true });

    const restorePosition = () => {
      if (userMoved) return;
      const items = landmarks();
      const item = items[savedPosition.landmarkIndex];
      let targetY = savedPosition.scrollRatio * Math.max(0, document.documentElement.scrollHeight - innerHeight);
      if (item) {
        targetY = item.offsetTop + item.offsetHeight * savedPosition.landmarkProgress - innerHeight * savedPosition.viewportAnchor;
      }
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      scrollTo(0, clamp(targetY, 0, Math.max(0, root.scrollHeight - innerHeight)));
      if (previousScrollBehavior) root.style.scrollBehavior = previousScrollBehavior;
      else root.style.removeProperty('scroll-behavior');
    };

    requestAnimationFrame(() => requestAnimationFrame(restorePosition));
    [120,360,800,1400].forEach(delay => setTimeout(restorePosition, delay));
    document.fonts?.ready.then(restorePosition).catch(() => {});
  }

  button.dataset.storyShuffleReady = 'true';
  button.addEventListener('click', () => {
    const candidates = storyIds.filter(story => story !== activeStory);
    if (!candidates.length) return;

    const randomValue = globalThis.crypto?.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
      : Math.random();
    const targetStory = candidates[Math.floor(randomValue * candidates.length)];
    const target = pageForStory(targetStory);
    const targetKey = `${pageType}:${targetStory}`;
    const viewportAnchor = .38;
    const anchorY = scrollY + innerHeight * viewportAnchor;
    const items = landmarks();
    let landmarkIndex = items.findIndex(item => anchorY >= item.offsetTop && anchorY < item.offsetTop + item.offsetHeight);
    if (landmarkIndex < 0) {
      landmarkIndex = items.reduce((closest, item, index) => Math.abs(item.offsetTop - anchorY) < Math.abs(items[closest].offsetTop - anchorY) ? index : closest, 0);
    }
    const landmark = items[landmarkIndex];
    const landmarkProgress = landmark ? clamp((anchorY - landmark.offsetTop) / Math.max(1, landmark.offsetHeight), 0, 1) : 0;
    const scrollRange = Math.max(1, document.documentElement.scrollHeight - innerHeight);

    try {
      sessionStorage.setItem(restoreKey, JSON.stringify({
        target:targetKey,
        landmarkIndex,
        landmarkProgress,
        viewportAnchor,
        scrollRatio:scrollY / scrollRange,
        savedAt:Date.now()
      }));
    } catch {}

    button.disabled = true;
    location.assign(target);
  });
})();
