const progress = document.querySelector('.progress span');
const nav = document.querySelector('#site-nav');
const menuButton = document.querySelector('.menu-toggle');
const siteHeader = document.querySelector('.site-header');
const hero = document.querySelector('.hero');
const route = document.querySelector('.hero-visual .route');
const routeMarker = document.querySelector('.hero-visual .route-marker');
const hasFootstepsMarker = routeMarker?.classList.contains('footsteps-marker');
const processSteps = document.querySelectorAll('.steps li');
const manifestoDot = document.querySelector('.manifesto-dot');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let scrollFrame;
let footstepsFrame;
let footstepsStartedAt;
let previousScrollY = scrollY;

const updateSmartHeader = () => {
  if (!siteHeader) {
    previousScrollY = scrollY;
    return;
  }

  const movement = scrollY - previousScrollY;
  const navigationExpanded = nav.classList.contains('open') || nav.querySelector('.variant-menu[open]');
  siteHeader.classList.toggle('nav-scrolled', scrollY > 8);

  if (scrollY <= 8) {
    siteHeader.classList.remove('nav-hidden');
  } else if (movement > 2 && scrollY > siteHeader.offsetHeight && !navigationExpanded) {
    siteHeader.classList.add('nav-hidden');
  } else if (movement < -2) {
    siteHeader.classList.remove('nav-hidden');
  }

  previousScrollY = scrollY;
};

const updateProgress = () => {
  const available = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${available ? scrollY / available : 0})`;
};

const placeRouteMarker = amount => {
  if (!hero || !route || !routeMarker) return;

  const routeLength = route.getTotalLength();
  const distance = routeLength * Math.min(1, Math.max(0, amount));
  const point = route.getPointAtLength(distance);

  if (hasFootstepsMarker) {
    const before = route.getPointAtLength(Math.max(0, distance - 2));
    const after = route.getPointAtLength(Math.min(routeLength, distance + 2));
    const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI + 90;
    routeMarker.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${angle.toFixed(2)})`);
    return;
  }

  routeMarker.setAttribute('cx', point.x);
  routeMarker.setAttribute('cy', point.y);
};

const updateRouteMarker = () => {
  if (!hero || !route || !routeMarker) return;

  if (hasFootstepsMarker) {
    if (reducedMotion.matches) {
      routeMarker.style.opacity = '1';
      placeRouteMarker(.45);
    }
    return;
  }

  const travelDistance = Math.max(hero.offsetHeight - innerHeight * 0.15, 1);
  placeRouteMarker((scrollY - hero.offsetTop) / travelDistance);
};

const updateFootstepsAnimation = timestamp => {
  if (!hasFootstepsMarker || reducedMotion.matches) {
    footstepsFrame = undefined;
    return;
  }

  if (footstepsStartedAt === undefined) footstepsStartedAt = timestamp;
  const amount = ((timestamp - footstepsStartedAt) % 8200) / 8200;
  const opacity = Math.min(amount / .055, (1 - amount) / .085, 1);
  routeMarker.style.opacity = Math.max(0, opacity).toFixed(3);
  placeRouteMarker(amount);
  footstepsFrame = requestAnimationFrame(updateFootstepsAnimation);
};

const restartFootstepsAnimation = () => {
  if (footstepsFrame) cancelAnimationFrame(footstepsFrame);
  footstepsFrame = undefined;
  footstepsStartedAt = undefined;

  if (!hasFootstepsMarker) return;
  if (reducedMotion.matches) {
    routeMarker.style.opacity = '1';
    placeRouteMarker(.45);
    return;
  }

  footstepsFrame = requestAnimationFrame(updateFootstepsAnimation);
};

const updateStepAnimations = () => {
  processSteps.forEach(step => {
    const rect = step.getBoundingClientRect();
    const distance = innerHeight * 0.62;
    const amount = reducedMotion.matches
      ? 1
      : Math.min(1, Math.max(0, (innerHeight * 0.82 - rect.top) / distance));
    step.style.setProperty('--step-progress', amount.toFixed(3));
    step.classList.toggle('phase-one', amount > 0.16);
    step.classList.toggle('phase-two', amount > 0.43);
    step.classList.toggle('phase-three', amount > 0.7);
    step.classList.toggle('step-finished', amount > 0.88);
  });
};

const updateManifestoDot = () => {
  if (!manifestoDot) return;
  const section = manifestoDot.closest('.manifesto, .page-title');
  if (!section) return;
  const travel = Math.max(section.offsetHeight * 0.65, 1);
  const amount = Math.min(1, Math.max(0, (scrollY - section.offsetTop) / travel));
  manifestoDot.style.setProperty('--dot-progress', amount.toFixed(3));
};

const updateScrollAnimations = () => {
  scrollFrame = undefined;
  updateProgress();
  updateSmartHeader();
  updateRouteMarker();
  updateStepAnimations();
  updateManifestoDot();
};

const requestScrollUpdate = () => {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollAnimations);
};

addEventListener('scroll', requestScrollUpdate, { passive: true });
addEventListener('resize', requestScrollUpdate, { passive: true });
reducedMotion.addEventListener('change', () => {
  requestScrollUpdate();
  restartFootstepsAnimation();
});
updateScrollAnimations();
restartFootstepsAnimation();

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(element => observer.observe(element));

menuButton.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  siteHeader.classList.remove('nav-hidden');
  menuButton.setAttribute('aria-expanded', open);
  menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});

nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  nav.querySelectorAll('details[open]').forEach(menu => menu.removeAttribute('open'));
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open menu');
}));

document.addEventListener('click', event => {
  document.querySelectorAll('.variant-menu[open]').forEach(menu => {
    if (!menu.contains(event.target)) menu.removeAttribute('open');
  });
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.variant-menu[open]').forEach(menu => menu.removeAttribute('open'));
});

document.querySelectorAll('.variant-menu').forEach(menu => {
  menu.addEventListener('toggle', () => {
    if (!menu.open || innerWidth > 800) return;
    const panel = menu.querySelector('.variant-menu-panel');
    const current = panel.querySelector('[aria-current="page"]');
    if (!current) return;
    requestAnimationFrame(() => {
      panel.scrollTop = current.offsetTop - panel.offsetTop - (panel.clientHeight - current.clientHeight) / 2;
    });
  });
});

document.querySelectorAll('.flip-object').forEach(card => {
  card.addEventListener('click', () => card.classList.toggle('flipped'));
});

document.querySelectorAll('.dot-arena').forEach(arena => {
  const dot = arena.querySelector('.escape-dot');
  const radius = 16;
  const state = { x: 0, y: 0, vx: 0, vy: 0, lastX: 0, lastY: 0, lastTime: 0, ready: false, visible: false };
  let animationFrame;
  let previousTime = performance.now();

  const placeAtCenter = () => {
    if (state.ready) return;
    state.x = arena.clientWidth / 2;
    state.y = arena.clientHeight / 2;
    state.ready = true;
  };

  arena.addEventListener('pointermove', event => {
    placeAtCenter();
    const rect = arena.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const now = performance.now();
    const elapsed = state.lastTime ? Math.max(now - state.lastTime, 8) : 16;
    const pointerSpeed = state.lastTime
      ? Math.hypot(pointerX - state.lastX, pointerY - state.lastY) / elapsed * 16.67
      : 0;
    const awayX = state.x - pointerX;
    const awayY = state.y - pointerY;
    const distance = Math.max(Math.hypot(awayX, awayY), 0.01);
    const influence = Math.max(0, 1 - distance / 125);

    if (influence > 0) {
      const impulse = (2.2 + Math.min(pointerSpeed * 0.42, 18)) * influence;
      state.vx += awayX / distance * impulse;
      state.vy += awayY / distance * impulse;
      const speed = Math.hypot(state.vx, state.vy);
      if (speed > 30) {
        state.vx = state.vx / speed * 30;
        state.vy = state.vy / speed * 30;
      }
    }

    state.lastX = pointerX;
    state.lastY = pointerY;
    state.lastTime = now;
    startAnimation();
  });

  const animateDot = now => {
    animationFrame = undefined;
    if (!state.visible) return;
    placeAtCenter();
    const frameScale = Math.min((now - previousTime) / 16.67, 2);
    previousTime = now;
    state.x += state.vx * frameScale;
    state.y += state.vy * frameScale;
    const maxX = arena.clientWidth - radius;
    const maxY = arena.clientHeight - radius;

    if (state.x <= radius || state.x >= maxX) {
      state.x = Math.min(maxX, Math.max(radius, state.x));
      state.vx *= -0.88;
    }
    if (state.y <= radius || state.y >= maxY) {
      state.y = Math.min(maxY, Math.max(radius, state.y));
      state.vy *= -0.88;
    }

    const damping = Math.pow(0.985, frameScale);
    state.vx *= damping;
    state.vy *= damping;
    dot.style.transform = `translate(${state.x - radius}px,${state.y - radius}px)`;
    if (Math.hypot(state.vx, state.vy) > 0.02) startAnimation();
  };

  function startAnimation() {
    if (!state.visible || animationFrame) return;
    previousTime = performance.now();
    animationFrame = requestAnimationFrame(animateDot);
  }

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting;
    if (state.visible) {
      placeAtCenter();
      dot.style.transform = `translate(${state.x - radius}px,${state.y - radius}px)`;
      startAnimation();
    } else if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
    }
  }, { rootMargin: '100px' });
  visibilityObserver.observe(arena);
});

document.querySelectorAll('.draggable').forEach(object => {
  object.addEventListener('pointerdown', event => {
    if (event.target.closest('.draggable') !== object) return;
    event.preventDefault();
    object.classList.add('dragging');
    object.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = Number(object.dataset.x || 0);
    const originY = Number(object.dataset.y || 0);

    const move = moveEvent => {
      const x = originX + moveEvent.clientX - startX;
      const y = originY + moveEvent.clientY - startY;
      object.dataset.x = x;
      object.dataset.y = y;
      object.style.setProperty('--x', `${x}px`);
      object.style.setProperty('--y', `${y}px`);
    };
    const end = () => {
      object.classList.remove('dragging');
      object.removeEventListener('pointermove', move);
      object.removeEventListener('pointerup', end);
      object.removeEventListener('pointercancel', end);
    };
    object.addEventListener('pointermove', move);
    object.addEventListener('pointerup', end);
    object.addEventListener('pointercancel', end);
  });
});

const contactForm = document.querySelector('#contact-form');
if (contactForm) {
  const storyName = document.title.split('—')[0].trim();
  const subjectField = contactForm.elements.namedItem('_subject');
  let versionField = contactForm.elements.namedItem('website_version');
  if (!versionField) {
    versionField = document.createElement('input');
    versionField.type = 'hidden';
    versionField.name = 'website_version';
    if (subjectField) subjectField.after(versionField);
    else contactForm.prepend(versionField);
  }
  if (subjectField) subjectField.value = `New enquiry — ${storyName}`;
  versionField.value = storyName;

  window.formspree = window.formspree || function () {
    (window.formspree.q = window.formspree.q || []).push(arguments);
  };
  window.formspree('initForm', {
    formElement: '#contact-form',
    formId: 'mbgllzjy',
    useDefaultStyles: false,
    onSuccess: context => {
      window.BTUAnalytics?.trackGenerateLead('contact_form');
      context.form.reset();
    },
    data: {
      source: 'Build to Understand Studio website',
      page: () => location.pathname
    }
  });
}
