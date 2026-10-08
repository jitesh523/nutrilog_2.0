/* ── NutriLog Diet Particles ──
   Floating diet & fitness icons drawn on canvas.
   Login : cursor repels particles + smooth flash on login
   Dashboard : gentle ambient drift
*/
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const IS_LOGIN = !document.getElementById('app-shell');

  /* ── Canvas ── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  if (IS_LOGIN) {
    const screen = document.getElementById('auth-screen');
    if (screen) screen.style.zIndex = '20';
  }

  let W = 0, H = 0;
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* ── Icon paths (drawn centred at 0,0; caller applies transform) ── */
  const PATHS = [
    /* Apple */
    (c, s) => {
      c.arc(0, s*0.1, s*0.72, 0, Math.PI*2);
      c.moveTo(0, -s*0.42); c.quadraticCurveTo(s*0.4, -s*1.0, s*0.12, -s*0.58);
    },
    /* Water drop */
    (c, s) => {
      c.moveTo(0, -s); c.bezierCurveTo(s*0.6, -s*0.3, s*0.9, s*0.2, s*0.6, s*0.6);
      c.bezierCurveTo(s*0.3, s, -s*0.3, s, -s*0.6, s*0.6);
      c.bezierCurveTo(-s*0.9, s*0.2, -s*0.6, -s*0.3, 0, -s);
    },
    /* Leaf */
    (c, s) => {
      c.moveTo(0, s); c.bezierCurveTo(-s, s*0.2, -s*0.8, -s, 0, -s);
      c.bezierCurveTo(s*0.8, -s, s, s*0.2, 0, s);
      c.moveTo(0, s); c.lineTo(0, -s*0.6);
    },
    /* Dumbbell */
    (c, s) => {
      c.rect(-s*0.1, -s*0.45, s*0.2, s*0.9);       /* bar */
      c.rect(-s*0.45, -s*0.28, s*0.25, s*0.56);     /* left weight */
      c.rect(s*0.2,  -s*0.28, s*0.25, s*0.56);      /* right weight */
    },
    /* Heart */
    (c, s) => {
      c.moveTo(0, s*0.6);
      c.bezierCurveTo(-s*1.1, -s*0.2, -s*1.2, -s*0.9, -s*0.5, -s*0.9);
      c.bezierCurveTo(-s*0.1, -s*0.9, 0, -s*0.5, 0, -s*0.5);
      c.bezierCurveTo(0, -s*0.5, s*0.1, -s*0.9, s*0.5, -s*0.9);
      c.bezierCurveTo(s*1.2, -s*0.9, s*1.1, -s*0.2, 0, s*0.6);
    },
    /* Flame / calorie */
    (c, s) => {
      c.moveTo(0, s);
      c.bezierCurveTo(-s*0.9, s*0.3, -s*0.8, -s*0.3, -s*0.1, -s*0.5);
      c.bezierCurveTo(-s*0.3, -s*0.1, 0, s*0.1, 0, s*0.1);
      c.bezierCurveTo(0, s*0.1, s*0.1, -s*0.3, s*0.5, -s);
      c.bezierCurveTo(s*0.9, -s*0.1, s*0.9, s*0.4, 0, s);
    },
    /* Hexagon — nutrient / molecule */
    (c, s) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
        i === 0 ? c.moveTo(Math.cos(a)*s, Math.sin(a)*s)
                : c.lineTo(Math.cos(a)*s, Math.sin(a)*s);
      }
      c.closePath();
    },
    /* Fork & knife / plate */
    (c, s) => {
      /* fork tines */
      c.moveTo(-s*0.55, -s); c.lineTo(-s*0.55, 0);
      c.moveTo(-s*0.35, -s); c.lineTo(-s*0.35, 0);
      c.moveTo(-s*0.15, -s); c.lineTo(-s*0.15, 0);
      /* fork handle */
      c.moveTo(-s*0.35, 0); c.lineTo(-s*0.35, s);
      /* knife */
      c.moveTo(s*0.35, -s); c.bezierCurveTo(s*0.55, -s*0.3, s*0.55, 0, s*0.35, 0);
      c.lineTo(s*0.35, s);
    },
  ];

  /* ── Palette matching app theme ── */
  const COLORS = ['#c084fc','#a855f7','#818cf8','#f9a8d4','#d8b4fe','#e879f9'];

  /* ── Particle factory ── */
  function makeParticle() {
    return {
      x       : Math.random() * W,
      y       : Math.random() * H,
      vx      : (Math.random() - 0.5) * 0.5,
      vy      : (Math.random() - 0.5) * 0.5,
      size    : 9 + Math.random() * 13,
      angle   : Math.random() * Math.PI * 2,
      aSpin   : (Math.random() - 0.5) * 0.008,
      iconIdx : Math.floor(Math.random() * PATHS.length),
      color   : COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha   : 0.06 + Math.random() * 0.10,
      phase   : Math.random() * Math.PI * 2,
      pulseSpd: 0.3 + Math.random() * 0.5,
    };
  }

  const COUNT = IS_LOGIN ? 55 : 38;
  const particles = Array.from({ length: COUNT }, makeParticle);

  /* ── Mouse tracking ── */
  let mx = -9999, my = -9999;
  window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
  window.addEventListener('mouseleave', () => { mx = -9999; my = -9999; }, { passive: true });

  /* ── Update ── */
  function update(p, t) {
    /* Cursor repulsion (diet tracking themed: nutrients fleeing 🙂) */
    const dx = p.x - mx, dy = p.y - my;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const REPEL_R = IS_LOGIN ? 180 : 140;
    if (dist < REPEL_R && dist > 0) {
      const force = (1 - dist / REPEL_R) * 1.2;
      p.vx += (dx / dist) * force;
      p.vy += (dy / dist) * force;
    }

    /* Natural drift + subtle vertical float */
    p.vy -= 0.008; /* slow rise like steam / nutrients */
    p.vx += (Math.random() - 0.5) * 0.04;
    p.vy += (Math.random() - 0.5) * 0.04;

    /* Friction */
    p.vx *= 0.97;
    p.vy *= 0.97;

    /* Speed cap */
    const spd = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
    if (spd > 2.5) { p.vx = p.vx/spd*2.5; p.vy = p.vy/spd*2.5; }

    p.x += p.vx;
    p.y += p.vy;
    p.angle += p.aSpin;

    /* Wrap edges */
    if (p.x < -40) p.x = W + 40;
    else if (p.x > W + 40) p.x = -40;
    if (p.y < -40) p.y = H + 40;
    else if (p.y > H + 40) p.y = -40;

    /* Pulse opacity */
    p.currentAlpha = p.alpha * (0.6 + 0.4 * Math.sin(t * p.pulseSpd + p.phase));
  }

  /* ── Draw ── */
  function draw(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.currentAlpha));
    ctx.strokeStyle = p.color;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = p.size * 1.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    PATHS[p.iconIdx](ctx, p.size * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /* ── Page transition (replaces star blast) ── */
  window.triggerPageTransition = function (callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9999;pointer-events:none;',
      'background:radial-gradient(ellipse 80% 60% at 50% 50%,',
      '  rgba(109,40,217,0.95) 0%, rgba(9,6,15,0.98) 100%);',
      'opacity:0;transition:opacity 0.16s ease;',
    ].join('');
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      setTimeout(() => {
        overlay.style.transition = 'opacity 0.65s ease';
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.remove(); callback && callback(); }, 680);
      }, 180);
    });
  };

  /* ── Render loop ── */
  let t = 0;
  (function loop() {
    ctx.clearRect(0, 0, W, H);
    t += 0.016;
    for (let i = 0; i < particles.length; i++) {
      update(particles[i], t);
      draw(particles[i]);
    }
    requestAnimationFrame(loop);
  })();

})();
