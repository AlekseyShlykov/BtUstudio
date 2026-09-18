const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll('.generated-video').forEach(video => {
  video.muted = true;
  const syncPlayback = () => {
    if (prefersReducedMotion.matches) {
      video.pause();
      if (video.readyState >= 1) video.currentTime = 0;
      return;
    }
    video.play().catch(() => {});
  };
  video.addEventListener('loadeddata', () => {
    video.dataset.ready = 'true';
    syncPlayback();
  });
  prefersReducedMotion.addEventListener('change', syncPlayback);
  syncPlayback();
});

document.querySelectorAll('.image-stage[data-tilt]').forEach(stage => {
  const updateTilt = event => {
    if (prefersReducedMotion.matches || innerWidth <= 800) return;
    const rect = stage.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    stage.style.setProperty('--tilt-x', `${((x - .5) * 5).toFixed(2)}deg`);
    stage.style.setProperty('--tilt-y', `${((.5 - y) * 4).toFixed(2)}deg`);
    stage.style.setProperty('--image-x', `${((.5 - x) * 1.2).toFixed(2)}%`);
    stage.style.setProperty('--image-y', `${((.5 - y) * 1.2).toFixed(2)}%`);
  };
  const resetTilt = () => {
    stage.style.setProperty('--tilt-x', '0deg');
    stage.style.setProperty('--tilt-y', '0deg');
    stage.style.setProperty('--image-x', '0%');
    stage.style.setProperty('--image-y', '0%');
  };
  stage.addEventListener('pointermove', updateTilt, { passive: true });
  stage.addEventListener('pointerleave', resetTilt);
});

const scrollMotionStages = [...document.querySelectorAll('[data-scroll-motion]')];
let scrollMotionFrame = 0;
const updateScrollMotion = () => {
  scrollMotionFrame = 0;
  scrollMotionStages.forEach(stage => {
    const rect = stage.getBoundingClientRect();
    const travel = innerHeight + rect.height;
    const progress = Math.min(1, Math.max(0, (innerHeight - rect.top) / travel));
    const centered = progress - .5;
    stage.style.setProperty('--motion-progress', progress.toFixed(4));
    stage.style.setProperty('--motion-shift', `${(centered * -92).toFixed(2)}px`);
    stage.style.setProperty('--motion-shift-reverse', `${(centered * 68).toFixed(2)}px`);
    stage.style.setProperty('--motion-x', `${(Math.sin(progress * Math.PI * 1.4) * 42).toFixed(2)}px`);
    stage.style.setProperty('--motion-y', `${(centered * -74).toFixed(2)}px`);
    stage.style.setProperty('--motion-turn', `${(centered * 94).toFixed(2)}deg`);
    stage.style.setProperty('--motion-pct', `${(10 + progress * 78).toFixed(2)}%`);
    stage.dataset.motionFrame = String(Math.round(progress * 1000));
  });
};
const requestScrollMotion = () => {
  if (!scrollMotionFrame) scrollMotionFrame = requestAnimationFrame(updateScrollMotion);
};
addEventListener('scroll', requestScrollMotion, { passive: true });
addEventListener('resize', requestScrollMotion, { passive: true });
updateScrollMotion();

const archiveScanResults = {
  fern: {
    title: 'Fern specimen',
    description: 'Pressed botanical sample · archival mount',
    model: '<path d="M48 65C48 47 47 30 52 9M49 53 29 42M49 46l19-12M49 38 34 27M50 31l16-10M51 24 40 16M52 18l10-7"></path><path d="m29 42 8-1-4 7m35-14-8-1 4 7M34 27l8 1-5 6m29-13-8 1 5 6M40 16l7 2-5 5m20-12-7 2 5 5"></path>'
  },
  mineral: {
    title: 'Basalt fragment',
    description: 'Volcanic field sample · mineral collection',
    model: '<path d="m15 54 8-28 25-17 27 12 9 30-22 14-31-2z"></path><path d="m23 26 25 16 27-21M48 42l14 23M48 42 48 9M23 26l25-17"></path>'
  }
};

document.querySelectorAll('.archive-scanner-stage').forEach(stage => {
  const scanBox = stage.querySelector('.archive-scan-box');
  const scanFrame = stage.querySelector('.archive-scan-frame');
  const scanClipShape = stage.querySelector('.archive-scan-clip-shape');
  let scanBeam = stage.querySelector('.archive-scan-beam');
  if (scanBeam && !scanBeam.matches('polygon')) {
    const polygonBeam = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygonBeam.setAttribute('class', 'archive-scan-beam');
    polygonBeam.setAttribute('points', '0,0 100,0 100,0 0,0');
    ['fill', 'filter', 'clip-path'].forEach(attribute => {
      if (scanBeam.hasAttribute(attribute)) polygonBeam.setAttribute(attribute, scanBeam.getAttribute(attribute));
    });
    scanBeam.replaceWith(polygonBeam);
    scanBeam = polygonBeam;
  }
  const scanLine = stage.querySelector('.archive-scan-line');
  const result = stage.querySelector('.archive-result');
  const resultTitle = stage.querySelector('[data-archive-title]');
  const resultDescription = stage.querySelector('[data-archive-description]');
  const resultModel = stage.querySelector('[data-archive-model]');
  let resultTimer = 0;
  let scanAnimationFrame = 0;

  const scanCell = cell => {
    const hitArea = cell.querySelector('polygon, rect');
    const item = archiveScanResults[cell.dataset.archiveItem];
    if (!hitArea || !item || !scanBox || !scanFrame || !scanClipShape || !scanBeam || !scanLine || !result) return;
    const bounds = hitArea.getBBox();
    const { x, y, width, height } = bounds;
    const sourcePoints = hitArea.matches('polygon')
      ? hitArea.getAttribute('points').trim().split(/\s+/).map(pair => pair.split(',').map(Number))
      : [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
    const localPoints = sourcePoints.map(([pointX, pointY]) => [pointX - x, pointY - y]);
    const framePoints = localPoints.map(([pointX, pointY]) => `${pointX.toFixed(2)},${pointY.toFixed(2)}`).join(' ');
    const [topLeft, topRight, bottomRight, bottomLeft] = localPoints;

    clearTimeout(resultTimer);
    if (scanAnimationFrame) cancelAnimationFrame(scanAnimationFrame);
    stage.querySelectorAll('.archive-cell').forEach(candidate => candidate.classList.toggle('is-selected', candidate === cell));
    result.classList.remove('is-visible');
    result.hidden = true;
    scanBox.setAttribute('transform', `translate(${x} ${y})`);
    scanFrame.setAttribute('points', framePoints);
    scanClipShape.setAttribute('points', framePoints);
    scanBeam.setAttribute('points', `${topLeft[0]},0 ${topRight[0]},0 ${topRight[0]},0 ${topLeft[0]},0`);
    scanLine.setAttribute('x1', topLeft[0]);
    scanLine.setAttribute('x2', topRight[0]);
    scanLine.setAttribute('y1', 0);
    scanLine.setAttribute('y2', 0);
    scanBox.removeAttribute('hidden');
    scanBox.classList.remove('is-scanning');
    void scanBox.getBoundingClientRect();
    scanBox.classList.add('is-scanning');
    stage.dataset.scanState = 'scanning';
    stage.dataset.scanItem = cell.dataset.archiveItem;

    const duration = prefersReducedMotion.matches ? 30 : 920;
    const interpolate = (from, to, progress) => from + (to - from) * progress;
    const pointOnSide = (from, to, progress) => [
      interpolate(from[0], to[0], progress),
      interpolate(from[1], to[1], progress)
    ];
    const beamDepth = Math.min(34, height * .32);
    const scanStartedAt = performance.now();
    const renderScan = timestamp => {
      const linearProgress = Math.min(1, Math.max(0, (timestamp - scanStartedAt) / duration));
      const progress = linearProgress * linearProgress * (3 - 2 * linearProgress);
      const beamTopProgress = Math.max(0, (progress * height - beamDepth) / height);
      const leadingLeft = pointOnSide(topLeft, bottomLeft, progress);
      const leadingRight = pointOnSide(topRight, bottomRight, progress);
      const trailingLeft = pointOnSide(topLeft, bottomLeft, beamTopProgress);
      const trailingRight = pointOnSide(topRight, bottomRight, beamTopProgress);
      scanBeam.setAttribute('points', [trailingLeft, trailingRight, leadingRight, leadingLeft]
        .map(([pointX, pointY]) => `${pointX.toFixed(2)},${pointY.toFixed(2)}`).join(' '));
      scanLine.setAttribute('x1', leadingLeft[0].toFixed(2));
      scanLine.setAttribute('x2', leadingRight[0].toFixed(2));
      scanLine.setAttribute('y1', leadingLeft[1].toFixed(2));
      scanLine.setAttribute('y2', leadingRight[1].toFixed(2));
      if (linearProgress < 1) scanAnimationFrame = requestAnimationFrame(renderScan);
      else scanAnimationFrame = 0;
    };
    scanAnimationFrame = requestAnimationFrame(renderScan);
    resultTimer = setTimeout(() => {
      scanBox.classList.remove('is-scanning');
      scanBox.setAttribute('hidden', '');
      stage.querySelectorAll('.archive-cell').forEach(candidate => candidate.classList.remove('is-selected'));
      resultTitle.textContent = item.title;
      resultDescription.textContent = item.description;
      resultModel.innerHTML = item.model;
      result.hidden = false;
      requestAnimationFrame(() => result.classList.add('is-visible'));
      stage.dataset.scanState = 'complete';
    }, duration);
  };

  stage.querySelectorAll('.archive-cell').forEach(cell => {
    cell.addEventListener('click', () => scanCell(cell));
    cell.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      scanCell(cell);
    });
  });
});

const syncCoverOverlayViewport = (overlay, image) => {
  if (!overlay || !image?.naturalWidth || !image.clientWidth || !image.clientHeight) return;
  const boxWidth = image.clientWidth;
  const boxHeight = image.clientHeight;
  const imageScale = Math.max(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight);
  const visibleWidth = boxWidth / imageScale;
  const visibleHeight = boxHeight / imageScale;
  const positionTokens = getComputedStyle(image).objectPosition.match(/-?[\d.]+/g)?.map(Number) || [50, 50];
  const positionX = (positionTokens[0] ?? 50) / 100;
  const positionY = (positionTokens[1] ?? 50) / 100;
  const viewX = (image.naturalWidth - visibleWidth) * positionX;
  const viewY = (image.naturalHeight - visibleHeight) * positionY;
  overlay.setAttribute('viewBox', `${viewX.toFixed(3)} ${viewY.toFixed(3)} ${visibleWidth.toFixed(3)} ${visibleHeight.toFixed(3)}`);
};

document.querySelectorAll('.paper-river-route,.storm-overlay').forEach(overlay => {
  const image = overlay.closest('.hero-visual')?.querySelector('.generated-hero');
  const sync = () => syncCoverOverlayViewport(overlay, image);
  const syncWhenReady = () => {
    sync();
    requestAnimationFrame(sync);
  };
  image?.addEventListener('load', syncWhenReady, { once: true });
  addEventListener('resize', sync, { passive: true });
  syncWhenReady();
});

document.querySelectorAll('.motion-route').forEach(route => {
  const path = route.querySelector('path');
  const point = route.querySelector('circle');
  if (!path || !point || !path.getTotalLength) return;
  const image = route.closest('.hero-visual')?.querySelector('.generated-hero');
  const syncRouteViewport = () => syncCoverOverlayViewport(route, image);
  const syncWhenReady = () => {
    syncRouteViewport();
    requestAnimationFrame(syncRouteViewport);
  };
  image?.addEventListener('load', syncWhenReady, { once: true });
  addEventListener('resize', syncRouteViewport, { passive: true });
  syncWhenReady();
  const length = path.getTotalLength();
  const routeYOffset = Number(route.dataset.routeY || 0);
  let routeFrame = 0;
  const renderRoute = milliseconds => {
    const host = route.closest('[data-scroll-motion]');
    const scrollProgress = Number(host?.style.getPropertyValue('--motion-progress') || 0);
    const automatic = prefersReducedMotion.matches ? 0 : milliseconds / 9200;
    const progress = (automatic + scrollProgress * .48) % 1;
    const position = path.getPointAtLength(progress * length);
    point.setAttribute('cx', position.x.toFixed(2));
    point.setAttribute('cy', (position.y + routeYOffset).toFixed(2));
    route.dataset.motionFrame = String(Math.round(progress * 1000));
    if (!prefersReducedMotion.matches) routeFrame = requestAnimationFrame(renderRoute);
  };
  const restartRoute = () => {
    if (routeFrame) cancelAnimationFrame(routeFrame);
    renderRoute(performance.now());
  };
  prefersReducedMotion.addEventListener('change', restartRoute);
  restartRoute();
});

const vertexSource = `
  attribute vec2 a_position;
  void main(){gl_Position=vec4(a_position,0.0,1.0);}
`;
const fragmentSource = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform vec2 u_pointer;
  uniform float u_time;
  uniform float u_mode;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
  }
  void main(){
    vec2 uv=gl_FragCoord.xy/u_resolution.xy;
    vec2 p=uv*vec2(u_resolution.x/u_resolution.y,1.0);
    float n=noise(p*5.0+u_time*.07)+.5*noise(p*11.0-u_time*.1);
    float pointerGlow=exp(-distance(uv,u_pointer)*5.5);
    if(u_mode<1.5){
      float wave=.5+.5*sin((uv.x*1.35+uv.y+n*.13)*34.0-u_time*.8);
      float caustic=pow(wave,11.0)*(.35+.65*n);
      vec3 color=mix(vec3(.05,.55,.72),vec3(1.0,.55,.16),smoothstep(.72,1.15,n));
      float alpha=(caustic*.32+pointerGlow*.055);
      gl_FragColor=vec4(color*alpha,alpha);
    }else if(u_mode<2.5){
      float contour=abs(fract((uv.y+n*.11)*13.0-u_time*.055)-.5);
      float line=smoothstep(.055,.0,contour);
      float sweep=exp(-abs(uv.x-(fract(u_time*.045)*1.4-.2))*18.0);
      vec3 color=mix(vec3(.16,.48,.64),vec3(1.0,.43,.08),sweep);
      float alpha=line*(.045+sweep*.18)+pointerGlow*.035;
      gl_FragColor=vec4(color*alpha,alpha);
    }else{
      vec2 center=uv-u_pointer;
      float radius=length(center);
      float ripple=.5+.5*sin(radius*54.0-u_time*1.15+n*3.0);
      float ring=pow(ripple,13.0)*exp(-radius*2.2);
      float prism=.5+.5*sin((uv.x*.72+uv.y*.38+n*.08)*18.0-u_time*.34);
      vec3 a=vec3(.18,.84,.88),b=vec3(.98,.31,.28),c=vec3(.53,.25,1.0);
      vec3 color=mix(mix(a,b,prism),c,smoothstep(.76,1.25,n));
      float alpha=ring*.14+pointerGlow*.045+pow(prism,12.0)*.025;
      gl_FragColor=vec4(color*alpha,alpha);
    }
  }
`;

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
};

document.querySelectorAll('.shader-canvas').forEach(canvas => {
  if (canvas.closest('.home-image-variant-54')) {
    canvas.hidden = true;
    return;
  }
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) {
    canvas.hidden = true;
    return;
  }

  try {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const pointer = gl.getUniformLocation(program, 'u_pointer');
    const time = gl.getUniformLocation(program, 'u_time');
    const mode = gl.getUniformLocation(program, 'u_mode');
    const pointerState = { x: .5, y: .5 };
    let frameCount = 0;
    let animationFrame;

    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 1.25) * .72;
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };
    const render = milliseconds => {
      resize();
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(pointer, pointerState.x, pointerState.y);
      gl.uniform1f(time, milliseconds / 1000);
      gl.uniform1f(mode, Number(canvas.dataset.shaderMode || 1));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frameCount += 1;
      canvas.dataset.frames = String(frameCount);
      if (!prefersReducedMotion.matches) animationFrame = requestAnimationFrame(render);
    };
    const restart = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      frameCount = 0;
      render(performance.now());
    };
    canvas.closest('.hero-visual')?.addEventListener('pointermove', event => {
      const rect = canvas.getBoundingClientRect();
      pointerState.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      pointerState.y = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    }, { passive: true });
    prefersReducedMotion.addEventListener('change', restart);
    restart();
  } catch (error) {
    canvas.hidden = true;
    console.warn('Shader overlay unavailable.', error);
  }
});

const storyStages = [...document.querySelectorAll('[data-story-motion]')];
const storyStepMedia = [...document.querySelectorAll('.home-image-variant .step-media')];
let storyMotionFrame = 0;
const clampStory = value => Math.min(1, Math.max(0, value));

storyStages.forEach(stage => {
  const image = stage.querySelector('.generated-hero');
  const overlays = [...stage.querySelectorAll('svg.story-overlay[preserveAspectRatio="none"]')];
  if (!image || !overlays.length) return;
  const syncOverlayViewport = () => {
    if (!image.naturalWidth || !image.clientWidth || !image.clientHeight) return;
    const boxWidth = image.clientWidth;
    const boxHeight = image.clientHeight;
    const imageScale = Math.max(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight);
    const visibleWidth = boxWidth / imageScale;
    const visibleHeight = boxHeight / imageScale;
    const position = getComputedStyle(image).objectPosition.match(/[\d.]+/g)?.map(Number) || [50, 50];
    const viewX = (image.naturalWidth - visibleWidth) * ((position[0] ?? 50) / 100);
    const viewY = (image.naturalHeight - visibleHeight) * ((position[1] ?? 50) / 100);
    overlays.forEach(overlay => overlay.setAttribute('viewBox', `${viewX.toFixed(3)} ${viewY.toFixed(3)} ${visibleWidth.toFixed(3)} ${visibleHeight.toFixed(3)}`));
  };
  const syncWhenReady = () => {
    syncOverlayViewport();
    requestAnimationFrame(syncOverlayViewport);
  };
  image.addEventListener('load', syncWhenReady, { once: true });
  addEventListener('resize', syncOverlayViewport, { passive: true });
  syncWhenReady();
});

const updateStoryMotion = () => {
  storyMotionFrame = 0;
  const reduced = prefersReducedMotion.matches;

  storyStages.forEach(stage => {
    const hero = stage.closest('.hero');
    const heroRect = hero.getBoundingClientRect();
    const progress = reduced ? .58 : clampStory(-heroRect.top / Math.max(1, hero.offsetHeight * .78));
    const inverse = 1 - progress;
    const number = Number(stage.dataset.storyMotion);
    const image = stage.querySelector('.generated-hero');
    const staticHero = number === 51;
    const scaleRange = number === 47 ? .32 : number === 49 ? .1 : staticHero ? 0 : .065;
    const scale = 1.035 + progress * scaleRange;
    const panX = staticHero ? 0 : progress * (number === 47 ? -1.6 : -.55);
    const panY = staticHero ? 0 : progress * -.45;
    stage.style.setProperty('--story-progress', progress.toFixed(4));
    stage.style.setProperty('--story-scale', scale.toFixed(4));
    stage.style.setProperty('--story-pan-x', `${panX.toFixed(2)}%`);
    stage.style.setProperty('--story-pan-y', `${panY.toFixed(2)}%`);
    stage.dataset.storyFrame = String(Math.round(progress * 1000));
    if (image && innerWidth > 800) image.style.transform = `scale(${scale.toFixed(4)}) translate3d(${panX.toFixed(2)}%,${panY.toFixed(2)}%,0)`;

    if (number === 47) {
      stage.style.setProperty('--lens-size', `${(300 - progress * 132).toFixed(1)}px`);
    }

    if (number === 48) {
      const nose = stage.querySelector('.ship-nose');
      const cabin = stage.querySelector('.ship-cabin');
      const engine = stage.querySelector('.ship-engine');
      const topWing = stage.querySelector('.ship-wing-top');
      const bottomWing = stage.querySelector('.ship-wing-bottom');
      if (nose) nose.style.transform = `translateX(${(-185 * inverse).toFixed(1)}px)`;
      if (cabin) cabin.style.transform = `translateY(${(-58 * inverse).toFixed(1)}px)`;
      if (engine) engine.style.transform = `translateX(${(190 * inverse).toFixed(1)}px)`;
      if (topWing) topWing.style.transform = `translate(${(92 * inverse).toFixed(1)}px,${(-118 * inverse).toFixed(1)}px)`;
      if (bottomWing) bottomWing.style.transform = `scaleY(-1) translate(${(92 * inverse).toFixed(1)}px,${(-118 * inverse).toFixed(1)}px)`;
      stage.style.setProperty('--engine-glow', progress > .78 ? ((progress - .78) / .22).toFixed(3) : '0');
    }

    if (number === 49) {
      stage.style.setProperty('--complex-opacity', (1 - progress * .92).toFixed(3));
      stage.style.setProperty('--complex-scale', (1 - progress * .48).toFixed(3));
      stage.style.setProperty('--simple-opacity', clampStory((progress - .34) / .52).toFixed(3));
      stage.style.setProperty('--simple-scale', (.55 + clampStory((progress - .34) / .52) * .45).toFixed(3));
    }

    if (number === 50 || number === 52 || number === 54) {
      const path = stage.querySelector('.story-path');
      const point = stage.querySelector('.story-path-point, .story-snitch');
      if (path) {
        path.style.strokeDashoffset = String(1 - progress);
        if (point && path.getTotalLength) {
          const length = path.getTotalLength();
          const position = path.getPointAtLength(length * progress);
          if (point.matches('.story-snitch')) {
            const before = path.getPointAtLength(Math.max(0, length * progress - 3));
            const after = path.getPointAtLength(Math.min(length, length * progress + 3));
            const routeAngle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
            const bank = Math.min(18, Math.max(-18, routeAngle * .22));
            const pointWidth = Number(point.getAttribute('width')) || 24;
            const pointHeight = Number(point.getAttribute('height')) || 12;
            point.setAttribute('x', (position.x - pointWidth / 2).toFixed(2));
            point.setAttribute('y', (position.y - pointHeight / 2).toFixed(2));
            point.setAttribute('transform', `rotate(${bank.toFixed(2)} ${position.x.toFixed(2)} ${position.y.toFixed(2)})`);
          } else {
            point.setAttribute('cx', position.x.toFixed(2));
            point.setAttribute('cy', position.y.toFixed(2));
          }
        }
      }
    }

    if (number === 51) {
      const path = stage.querySelector('.paper-boat-path');
      const boat = stage.querySelector('.paper-boat');
      if (path && boat && path.getTotalLength) {
        const boatProgress = reduced ? .38 : progress;
        const length = path.getTotalLength();
        const position = path.getPointAtLength(length * boatProgress);
        const before = path.getPointAtLength(Math.max(0, length * boatProgress - 4));
        const after = path.getPointAtLength(Math.min(length, length * boatProgress + 4));
        const routeAngle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
        const pointWidth = Number(boat.getAttribute('width')) || 96;
        const pointHeight = Number(boat.getAttribute('height')) || 64;
        boat.setAttribute('x', (position.x - pointWidth / 2).toFixed(2));
        boat.setAttribute('y', (position.y - pointHeight / 2).toFixed(2));
        boat.setAttribute('transform', `rotate(${(routeAngle + 162).toFixed(2)} ${position.x.toFixed(2)} ${position.y.toFixed(2)})`);
        const bridgePassages = [[.89, 1]];
        const behindBridge = bridgePassages.some(([start, end]) => boatProgress >= start && boatProgress <= end);
        boat.style.setProperty('--boat-opacity', behindBridge ? '0' : '1');
        stage.dataset.boatBehindBridge = behindBridge ? 'true' : 'false';
        stage.dataset.boatFrame = String(Math.round(boatProgress * 1000));
      }
    }

    if (number === 53) {
      const strike = clampStory((progress - .07) / .2);
      const strikeFade = progress < .38 ? strike : Math.max(.18, 1 - (progress - .38) / .28);
      stage.style.setProperty('--bolt-offset', (1 - strike).toFixed(4));
      stage.style.setProperty('--bolt-opacity', strikeFade.toFixed(3));
      stage.style.setProperty('--bolt-haze', (strikeFade * .8).toFixed(3));
      stage.dataset.lightningFrame = String(Math.round(strike * 1000));
    }

    if (number === 54) {
      stage.style.setProperty('--realm-glow', (.12 + progress * .72).toFixed(3));
      stage.style.setProperty('--beacon-opacity', (.12 + clampStory((progress - .55) / .35) * .88).toFixed(3));
      stage.style.setProperty('--ember-opacity', (.08 + progress * .86).toFixed(3));
      stage.style.setProperty('--ember-x', `${(progress * 34).toFixed(2)}px`);
      stage.style.setProperty('--ember-y', `${(progress * -86).toFixed(2)}px`);
      stage.dataset.realmRouteFrame = String(Math.round(progress * 1000));
    }

    if (number === 55) {
      const clueStops = [[43, 61], [57, 62], [72, 54], [89, 60]];
      const clueTravel = progress * (clueStops.length - 1);
      const clueIndex = Math.min(clueStops.length - 2, Math.floor(clueTravel));
      const local = clueTravel - clueIndex;
      const from = clueStops[clueIndex];
      const to = clueStops[clueIndex + 1];
      const x = from[0] + (to[0] - from[0]) * local;
      const y = from[1] + (to[1] - from[1]) * local;
      stage.style.setProperty('--detective-x', `${x.toFixed(2)}%`);
      stage.style.setProperty('--detective-y', `${y.toFixed(2)}%`);
      stage.style.setProperty('--detective-turn', `${(-9 + progress * 15).toFixed(2)}deg`);
      stage.dataset.clueFrame = String(Math.round(progress * 1000));
    }

    if (number === 56) {
      const clueStops = [[51, 64], [64, 58], [77, 43], [89, 67]];
      const clueTravel = progress * (clueStops.length - 1);
      const clueIndex = Math.min(clueStops.length - 2, Math.floor(clueTravel));
      const local = clueTravel - clueIndex;
      const from = clueStops[clueIndex];
      const to = clueStops[clueIndex + 1];
      const x = from[0] + (to[0] - from[0]) * local;
      const y = from[1] + (to[1] - from[1]) * local;
      stage.style.setProperty('--victorian-x', `${x.toFixed(2)}%`);
      stage.style.setProperty('--victorian-y', `${y.toFixed(2)}%`);
      stage.style.setProperty('--victorian-turn', `${(-10 + progress * 17).toFixed(2)}deg`);
      stage.style.setProperty('--gas-x', `${(65 + progress * 22).toFixed(2)}%`);
      stage.style.setProperty('--gas-y', `${(45 + Math.sin(progress * Math.PI) * 9).toFixed(2)}%`);
      stage.style.setProperty('--gas-opacity', (.2 + progress * .38).toFixed(3));
      stage.style.setProperty('--gas-scale', (.86 + progress * .22).toFixed(3));
      stage.querySelectorAll('.victorian-clue-pins i').forEach((pin, index) => {
        const reveal = clampStory((progress - index * .18) / .22);
        pin.style.setProperty('--pin-opacity', reveal.toFixed(3));
        pin.style.setProperty('--pin-scale', (.55 + reveal * .45).toFixed(3));
      });
      stage.dataset.victorianFrame = String(Math.round(progress * 1000));
    }

    if (number === 57) {
      const flight = clampStory(progress / .46);
      const electronFade = 1 - clampStory((progress - .41) / .05);
      const wave = clampStory((progress - .46) / .38);
      const measurement = clampStory((progress - .62) / .28);
      stage.style.setProperty('--electron-x', `${(44 + flight * 18.2).toFixed(2)}%`);
      stage.style.setProperty('--electron-y', '42%');
      stage.style.setProperty('--wave-y', '42%');
      stage.style.setProperty('--electron-scale', (1 + Math.sin(flight * Math.PI) * .48).toFixed(3));
      stage.style.setProperty('--electron-opacity', (.95 * electronFade).toFixed(3));
      stage.style.setProperty('--wave-opacity', (wave * .84).toFixed(3));
      stage.style.setProperty('--wave-scale', (.16 + wave * .84).toFixed(3));
      stage.style.setProperty('--measurement-opacity', (measurement * .86).toFixed(3));
      stage.style.setProperty('--measurement-scale', (.78 + measurement * .22).toFixed(3));
      stage.dataset.doubleSlitFrame = String(Math.round(progress * 1000));
    }

    if (number === 58) {
      const approach = clampStory(progress / .58);
      const collision = clampStory((progress - .48) / .34);
      stage.style.setProperty('--beam-left', `${(49 + approach * 23).toFixed(2)}%`);
      stage.style.setProperty('--beam-right', `${(94 - approach * 22).toFixed(2)}%`);
      stage.style.setProperty('--beam-scale', (1 + Math.sin(approach * Math.PI) * .42).toFixed(3));
      stage.style.setProperty('--beam-opacity', (progress < .75 ? .94 : Math.max(.1, 1 - (progress - .75) / .18)).toFixed(3));
      stage.style.setProperty('--collision-opacity', (collision * .9).toFixed(3));
      stage.style.setProperty('--collision-scale', (.14 + collision * 1.12).toFixed(3));
      stage.dataset.colliderFrame = String(Math.round(progress * 1000));
    }
  });

  storyStepMedia.forEach((media, index) => {
    const rect = media.getBoundingClientRect();
    const progress = reduced ? .62 : clampStory((innerHeight * .84 - rect.top) / (innerHeight * .76));
    media.style.setProperty('--step-scale', (1.015 + progress * .045).toFixed(4));
    media.style.setProperty('--step-lift', `${((progress - .5) * -8).toFixed(2)}px`);
    media.style.setProperty('--triptych-pan-x', `${((progress - .5) * (index % 2 ? 6 : -6)).toFixed(2)}px`);
    media.style.setProperty('--step-scan', `${(-20 + progress * 124).toFixed(2)}%`);
    media.dataset.storyStepFrame = String(Math.round(progress * 1000));
    if (document.body.classList.contains('home-image-variant-53')) {
      const distances = [18, -24, 52];
      media.style.setProperty('--city-pan-x', `${((progress - .5) * distances[index % 3]).toFixed(2)}px`);
      if (index === 2) {
        const pointProgress = clampStory((progress - .18) / .58);
        media.style.setProperty('--point-opacity', pointProgress.toFixed(3));
        media.style.setProperty('--point-scale', (.5 + pointProgress * .5).toFixed(3));
        media.dataset.cityDetailFrame = String(Math.round(pointProgress * 1000));
      }
    }
    if (document.body.classList.contains('home-image-variant-54')) {
      const distances = [-16, 24, -42];
      media.style.setProperty('--fantasy-pan-x', `${((progress - .5) * distances[index % 3]).toFixed(2)}px`);
      if (index === 0) {
        media.style.setProperty('--draft-turn', `${(progress * 82).toFixed(2)}deg`);
        media.style.setProperty('--draft-opacity', (.24 + progress * .68).toFixed(3));
      }
      if (index === 1) {
        media.style.setProperty('--choice-x', `${(17 + clampStory(progress / .78) * 66).toFixed(2)}%`);
        media.style.setProperty('--choice-opacity', (.18 + progress * .74).toFixed(3));
        media.dataset.ringChoiceFrame = String(Math.round(progress * 1000));
      }
      if (index === 2) {
        const forgeProgress = clampStory((progress - .12) / .72);
        media.style.setProperty('--forge-opacity', (.14 + forgeProgress * .82).toFixed(3));
        media.style.setProperty('--forge-scale', (.82 + forgeProgress * .18).toFixed(3));
        media.dataset.forgeFrame = String(Math.round(forgeProgress * 1000));
      }
    }
    if (document.body.classList.contains('home-image-variant-55')) {
      const distances = [-10, 8, -12];
      media.style.setProperty('--case-pan-x', `${((progress - .5) * distances[index % 3]).toFixed(2)}px`);
      if (index === 0) {
        media.style.setProperty('--suspect-opacity', (.24 + progress * .7).toFixed(3));
        media.style.setProperty('--suspect-scale', (.9 + progress * .1).toFixed(3));
        media.dataset.suspectFrame = String(Math.round(progress * 1000));
      }
      if (index === 1) {
        media.style.setProperty('--evidence-ring', progress.toFixed(3));
        media.querySelectorAll('.evidence-pulse i').forEach((marker, markerIndex) => {
          const reveal = clampStory((progress - markerIndex * .12) / .34);
          marker.style.setProperty('--evidence-opacity', reveal.toFixed(3));
          marker.style.setProperty('--evidence-scale', (.68 + reveal * .32).toFixed(3));
        });
        media.dataset.evidenceFrame = String(Math.round(progress * 1000));
      }
      if (index === 2) {
        const conclusion = clampStory((progress - .08) / .72);
        media.style.setProperty('--thread-focus-opacity', (.18 + conclusion * .78).toFixed(3));
        media.style.setProperty('--thread-focus-scale', (.88 + conclusion * .12).toFixed(3));
        media.dataset.threadFrame = String(Math.round(conclusion * 1000));
      }
    }
    if (document.body.classList.contains('home-image-variant-56')) {
      const distances = [-8, 7, -10];
      media.style.setProperty('--victorian-pan-x', `${((progress - .5) * distances[index % 3]).toFixed(2)}px`);
      if (index === 0) {
        media.style.setProperty('--cabinet-opacity', (.24 + progress * .68).toFixed(3));
        media.style.setProperty('--cabinet-scale', (.9 + progress * .1).toFixed(3));
        media.dataset.cabinetFrame = String(Math.round(progress * 1000));
      }
      if (index === 1) {
        media.style.setProperty('--period-ring', progress.toFixed(3));
        media.querySelectorAll('.period-evidence-pulse i').forEach((marker, markerIndex) => {
          const reveal = clampStory((progress - markerIndex * .12) / .34);
          marker.style.setProperty('--period-opacity', reveal.toFixed(3));
          marker.style.setProperty('--period-scale', (.68 + reveal * .32).toFixed(3));
        });
        media.dataset.periodEvidenceFrame = String(Math.round(progress * 1000));
      }
      if (index === 2) {
        const conclusion = clampStory((progress - .08) / .72);
        media.style.setProperty('--period-thread-opacity', (.18 + conclusion * .76).toFixed(3));
        media.style.setProperty('--period-thread-scale', (.88 + conclusion * .12).toFixed(3));
        media.dataset.periodThreadFrame = String(Math.round(conclusion * 1000));
      }
    }
    if (document.body.classList.contains('home-image-variant-57')) {
      const distances = [-7, 6, -8];
      media.style.setProperty('--science-pan-x', `${((progress - .5) * distances[index % 3]).toFixed(2)}px`);
      if (index === 0) {
        media.style.setProperty('--calibration-progress', progress.toFixed(3));
        media.dataset.calibrationFrame = String(Math.round(progress * 1000));
      }
      if (index === 1) {
        media.querySelectorAll('.electron-hit-sequence i').forEach((hit, hitIndex) => {
          const reveal = clampStory((progress - hitIndex * .09) / .32);
          hit.style.setProperty('--hit-opacity', reveal.toFixed(3));
          hit.style.setProperty('--hit-scale', (.4 + reveal * .6).toFixed(3));
        });
        media.dataset.electronHitsFrame = String(Math.round(progress * 1000));
      }
      if (index === 2) {
        const fringe = clampStory((progress - .08) / .72);
        media.style.setProperty('--fringe-opacity', (.12 + fringe * .78).toFixed(3));
        media.style.setProperty('--fringe-focus', fringe.toFixed(3));
        media.style.setProperty('--fringe-scale', (.88 + fringe * .12).toFixed(3));
        media.dataset.fringeFrame = String(Math.round(fringe * 1000));
      }
    }
    if (document.body.classList.contains('home-image-variant-58')) {
      const distances = [-6, 5, -7];
      media.style.setProperty('--science-pan-x', `${((progress - .5) * distances[index % 3]).toFixed(2)}px`);
      if (index === 0) {
        const beam = clampStory(progress / .82);
        media.style.setProperty('--prep-left', `${(22 + beam * 28).toFixed(2)}%`);
        media.style.setProperty('--prep-right', `${(78 - beam * 28).toFixed(2)}%`);
        media.style.setProperty('--prep-opacity', (.2 + beam * .78).toFixed(3));
        media.style.setProperty('--prep-scale', (.7 + Math.sin(beam * Math.PI) * .5).toFixed(3));
        media.dataset.beamFrame = String(Math.round(beam * 1000));
      }
      if (index === 1) {
        const collision = clampStory((progress - .08) / .72);
        media.style.setProperty('--raw-opacity', (.12 + collision * .72).toFixed(3));
        media.style.setProperty('--raw-scale', (.3 + collision * .92).toFixed(3));
        media.style.setProperty('--raw-inner-scale', (.18 + collision * .64).toFixed(3));
        media.dataset.rawCollisionFrame = String(Math.round(collision * 1000));
      }
      if (index === 2) {
        const event = clampStory((progress - .08) / .72);
        media.style.setProperty('--event-progress', event.toFixed(3));
        media.style.setProperty('--event-opacity', (.14 + event * .82).toFixed(3));
        media.style.setProperty('--event-scale', (.68 + event * .32).toFixed(3));
        media.dataset.reconstructionFrame = String(Math.round(event * 1000));
      }
    }
  });

  const launchShip = document.querySelector('.launch-ship');
  if (launchShip) {
    const finalStep = document.querySelector('.steps li:last-child');
    const rect = finalStep.getBoundingClientRect();
    const launch = reduced ? 0 : clampStory((innerHeight * .72 - rect.top) / (innerHeight * .76));
    const flight = clampStory((launch - .48) / .52);
    const opacity = launch < .08 ? 0 : launch < .76 ? 1 : clampStory((1 - launch) / .24);
    document.body.style.setProperty('--launch-opacity', opacity.toFixed(3));
    document.body.style.setProperty('--launch-x', `${(flight * 112).toFixed(2)}vw`);
    document.body.style.setProperty('--launch-y', `${(flight * -22).toFixed(2)}vh`);
    document.body.style.setProperty('--launch-turn', `${(flight * -9).toFixed(2)}deg`);
    document.body.style.setProperty('--launch-scale', (.78 + flight * .28).toFixed(3));
    launchShip.dataset.launchFrame = String(Math.round(launch * 1000));
  }
};

const requestStoryMotion = () => {
  if (!storyMotionFrame) storyMotionFrame = requestAnimationFrame(updateStoryMotion);
};
addEventListener('scroll', requestStoryMotion, { passive: true });
addEventListener('resize', requestStoryMotion, { passive: true });
prefersReducedMotion.addEventListener('change', requestStoryMotion);
updateStoryMotion();
