/* ── NutriLog Background Image Engine ──
   Cursor-driven gym / diet scene switcher with parallax.
   Works on both login and dashboard pages without touching any UI element.
*/
(function () {
  'use strict';

  /* ── Image library ── */
  const SCENES = [
    /* Gym weights / barbell */
    'https://images.unsplash.com/photo-1534438327167-65c84a823e94?auto=format&fit=crop&w=1920&q=80',
    /* Outdoor running */
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1920&q=80',
    /* Colorful healthy bowl */
    'https://images.unsplash.com/photo-1512621776951-a57ef161b629?auto=format&fit=crop&w=1920&q=80',
    /* Gym dumbbells / floor */
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=1920&q=80',
    /* Meal prep containers */
    'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1920&q=80',
    /* Fresh vegetables */
    'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1920&q=80',
  ];

  /* ── Layout constants ── */
  /* Screen is divided into a 3-col × 2-row grid; each cell maps to one scene.
     As the cursor moves between cells the matching image smoothly crossfades in. */
  const COLS = 3;
  const ROWS = 2;

  /* ── Overlay config ── */
  const IMAGE_OPACITY = 0.52;

  /* ── Create root container ── */
  const IS_LOGIN = !document.getElementById('app-shell');

  const root = document.createElement('div');
  root.id = 'bg-image-root';
  root.style.cssText = [
    'position:fixed;inset:0;',
    'z-index:0;',
    'pointer-events:none;',
    'overflow:hidden;',
  ].join('');
  /* Prepend so it sits beneath everything else */
  document.body.prepend(root);

  /* On login page the auth screen needs to stay above our canvas */
  if (IS_LOGIN) {
    const authEl = document.getElementById('auth-screen');
    if (authEl && parseInt(getComputedStyle(authEl).zIndex, 10) < 20) {
      authEl.style.zIndex = '20';
    }
  }

  /* ── Build image layers ── */
  const layers = SCENES.map((url, i) => {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute;inset:0;',
      /* Slight scale-up gives room for parallax shift without showing edges */
      'width:110%;height:110%;top:-5%;left:-5%;',
      `background-image:url('${url}');`,
      'background-size:cover;',
      'background-position:center;',
      'background-repeat:no-repeat;',
      /* Start invisible; will fade in once loaded */
      'opacity:0;',
      'transition:opacity 0.95s cubic-bezier(0.4,0,0.2,1);',
      'will-change:opacity,background-position;',
    ].join('');
    root.appendChild(el);
    return el;
  });

  /* ── Single neutral dark overlay for readability ── */
  const overlayEl = document.createElement('div');
  overlayEl.style.cssText = [
    'position:absolute;inset:0;pointer-events:none;',
    'background:rgba(0,0,0,0.54);',
  ].join('');
  root.appendChild(overlayEl);

  /* ── Preload images; only make them eligible once loaded ── */
  const loaded = new Array(SCENES.length).fill(false);
  SCENES.forEach((url, i) => {
    const img = new Image();
    img.onload  = () => { loaded[i] = true; };
    img.onerror = () => { loaded[i] = false; /* skip broken images silently */ };
    img.src = url;
  });

  /* ── State ── */
  let activeIdx  = 0;   /* currently visible scene */
  let cursorX    = 0.5; /* normalised 0–1 */
  let cursorY    = 0.5;
  let smoothX    = 0.5; /* lerped for parallax */
  let smoothY    = 0.5;
  let lastSwitch = 0;   /* timestamp to rate-limit transitions */
  const MIN_INTERVAL_MS = 900; /* don't switch faster than this */

  /* ── Mouse / touch tracking ── */
  function handleMove(cx, cy) {
    cursorX = cx / window.innerWidth;
    cursorY = cy / window.innerHeight;

    const now = Date.now();
    if (now - lastSwitch < MIN_INTERVAL_MS) return;

    /* Map cursor to grid cell */
    const col = Math.min(Math.floor(cursorX * COLS), COLS - 1);
    const row = Math.min(Math.floor(cursorY * ROWS), ROWS - 1);
    const idx = row * COLS + col;

    if (idx === activeIdx) return;
    /* Only switch to images that successfully loaded */
    if (!loaded[idx]) return;

    /* Crossfade: fade out active, fade in new */
    layers[activeIdx].style.opacity = '0';
    layers[idx].style.opacity       = String(IMAGE_OPACITY);
    activeIdx  = idx;
    lastSwitch = now;
  }

  window.addEventListener('mousemove', e => handleMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', e => {
    if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  /* ── Parallax render loop ── */
  const PARALLAX_X = 6; /* max horizontal shift in percent */
  const PARALLAX_Y = 4; /* max vertical shift in percent */

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Show initial image as soon as it loads */
  let initDone = false;
  function tryInit() {
    if (initDone) return;
    /* Find the first loaded image */
    const firstLoaded = loaded.findIndex(v => v);
    if (firstLoaded !== -1) {
      activeIdx = firstLoaded;
      layers[firstLoaded].style.opacity = String(IMAGE_OPACITY);
      initDone = true;
    }
  }

  (function loop() {
    tryInit();

    if (!REDUCED) {
      /* Smooth lerp toward real cursor position */
      smoothX += (cursorX - smoothX) * 0.04;
      smoothY += (cursorY - smoothY) * 0.04;

      /* Apply parallax to every layer — inactive ones just drift silently */
      const bpx = 50 + (smoothX - 0.5) * PARALLAX_X * 2;
      const bpy = 50 + (smoothY - 0.5) * PARALLAX_Y * 2;

      for (let i = 0; i < layers.length; i++) {
        /* transition on background-position: none (we animate via rAF) */
        layers[i].style.backgroundPosition = `${bpx.toFixed(2)}% ${bpy.toFixed(2)}%`;
      }
    }

    requestAnimationFrame(loop);
  })();

})();
