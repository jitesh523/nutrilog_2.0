/* ── NutriLog Exerciser ──
   Anime chibi character that follows the cursor and cycles through exercises.
*/
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ── Canvas ── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0;
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* ── Cursor tracking ── */
  let curX = W / 2, curY = H / 2;
  let figX = curX, figY = curY;
  let facingRight = true;
  window.addEventListener('mousemove', e => { curX = e.clientX; curY = e.clientY; }, { passive: true });

  /* ── Palette ── */
  const C = {
    skin:  '#fdd5b6', skinD: '#f0b88a',
    hair:  '#2d1b69', hairL: '#4c1d95', hairS: '#a78bfa',
    eye:   '#1e1b4b', iris:  '#6d28d9',
    blush: 'rgba(251,113,133,0.38)',
    mouth: '#c47b6a',
    top:   '#7c3aed', topD:  '#5b21b6', topL: '#a78bfa',
    pants: '#4c1d95', pantsD: '#3b0764',
    shoe:  '#ede9fe', shoeD: '#c4b5fd', shoeAlt: '#a8a0f8',
    sweat: 'rgba(147,197,253,0.92)',
  };

  /* ── Helpers ── */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function eio(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

  function lerpPose(a, b, t) {
    const out = {};
    Object.keys(a).forEach(k => out[k] = [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t)]);
    return out;
  }

  /* Capsule / pill shape between two points */
  function capsule(x1, y1, x2, y2, r) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2, true);
    ctx.arc(x2, y2, r, a + Math.PI / 2, a - Math.PI / 2, true);
    ctx.closePath();
  }

  function fillCapsule(x1, y1, x2, y2, r, color) {
    capsule(x1, y1, x2, y2, r);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* ── Neutral pose (hip centre = origin, y-down) ── */
  const N = {
    lSh:[-11,-26], rSh:[11,-26],
    lEl:[-14,-10], rEl:[14,-10],
    lHa:[-14,  5], rHa:[14,  5],
    lHi:[ -8,  0], rHi:[ 8,  0],
    lKn:[ -8, 22], rKn:[ 8, 22],
    lFo:[ -8, 42], rFo:[ 8, 42],
  };

  /* ── Exercise definitions ── */
  const EXERCISES = [
    { name:'Running', spd:240, expr:'run', frames:[
      { lSh:[-11,-26], rSh:[11,-26], lEl:[-2,-36],  rEl:[18,-16], lHa:[5,-47],   rHa:[24,-4],
        lHi:[-8,0],    rHi:[8,0],    lKn:[-22,18],  rKn:[14,16],  lFo:[-28,36],  rFo:[6,30] },
      N,
      { lSh:[-11,-26], rSh:[11,-26], lEl:[-18,-16], rEl:[2,-36],  lHa:[-24,-4],  rHa:[-5,-47],
        lHi:[-8,0],    rHi:[8,0],    lKn:[-14,16],  rKn:[22,18],  lFo:[-6,30],   rFo:[28,36] },
      N,
    ]},
    { name:'Jumping Jacks', spd:480, expr:'happy', frames:[
      N,
      { lSh:[-11,-28], rSh:[11,-28], lEl:[-32,-42], rEl:[32,-42], lHa:[-44,-56], rHa:[44,-56],
        lHi:[-8,0],    rHi:[8,0],    lKn:[-22,20],  rKn:[22,20],  lFo:[-34,38],  rFo:[34,38] },
    ]},
    { name:'Squat', spd:680, expr:'strain', frames:[
      N,
      { lSh:[-11,-18], rSh:[11,-18], lEl:[-22,-12], rEl:[22,-12], lHa:[-30,-2],  rHa:[30,-2],
        lHi:[-14,6],   rHi:[14,6],   lKn:[-24,26],  rKn:[24,26],  lFo:[-24,46],  rFo:[24,46] },
    ]},
    { name:'High Knees', spd:280, expr:'run', frames:[
      { lSh:[-11,-26], rSh:[11,-26], lEl:[-11,-10], rEl:[20,-30], lHa:[-14,5],   rHa:[28,-42],
        lHi:[-8,0],    rHi:[8,0],    lKn:[-14,6],   rKn:[8,22],   lFo:[-14,18],  rFo:[8,42] },
      N,
      { lSh:[-11,-26], rSh:[11,-26], lEl:[-20,-30], rEl:[11,-10], lHa:[-28,-42], rHa:[14,5],
        lHi:[-8,0],    rHi:[8,0],    lKn:[-8,22],   rKn:[14,6],   lFo:[-8,42],   rFo:[14,18] },
      N,
    ]},
    { name:'Shoulder Press', spd:600, expr:'strain', frames:[
      { lSh:[-11,-26], rSh:[11,-26], lEl:[-24,-26], rEl:[24,-26], lHa:[-24,-44], rHa:[24,-44],
        lHi:[-8,0],    rHi:[8,0],    lKn:[-8,22],   rKn:[8,22],   lFo:[-8,42],   rFo:[8,42] },
      { lSh:[-11,-26], rSh:[11,-26], lEl:[-14,-44], rEl:[14,-44], lHa:[-10,-60], rHa:[10,-60],
        lHi:[-8,0],    rHi:[8,0],    lKn:[-8,22],   rKn:[8,22],   lFo:[-8,42],   rFo:[8,42] },
    ]},
    { name:'Bicep Curl', spd:500, expr:'happy', frames:[
      N,
      { lSh:[-11,-26], rSh:[11,-26], lEl:[-12,-26], rEl:[14,-10], lHa:[-12,-44], rHa:[14,5],
        lHi:[-8,0],    rHi:[8,0],    lKn:[-8,22],   rKn:[8,22],   lFo:[-8,42],   rFo:[8,42] },
      N,
      { lSh:[-11,-26], rSh:[11,-26], lEl:[-14,-10], rEl:[12,-26], lHa:[-14,5],   rHa:[12,-44],
        lHi:[-8,0],    rHi:[8,0],    lKn:[-8,22],   rKn:[8,22],   lFo:[-8,42],   rFo:[8,42] },
    ]},
  ];

  /* ── Draw the chibi character ── */
  function drawCharacter(pose, x, y, alpha, expr, label) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    if (!facingRight) ctx.scale(-1, 1);

    /* Key derived positions */
    const neckX = (pose.lSh[0] + pose.rSh[0]) / 2;
    const neckY = (pose.lSh[1] + pose.rSh[1]) / 2 - 5;
    const hipX  = (pose.lHi[0] + pose.rHi[0]) / 2;
    const hipY  = (pose.lHi[1] + pose.rHi[1]) / 2;
    const hx = 0;
    const hy = neckY - 24; /* chibi head sits high above shoulders */

    /* Ground shadow */
    ctx.save();
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.ellipse(0, (pose.lFo[1] + pose.rFo[1]) / 2 + 5, 19, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* ── BACK LIMBS (left = farther, drawn first) ── */

    fillCapsule(pose.lSh[0], pose.lSh[1], pose.lEl[0], pose.lEl[1], 4.5, C.topD);
    fillCapsule(pose.lEl[0], pose.lEl[1], pose.lHa[0], pose.lHa[1], 3.8, C.skinD);
    ctx.fillStyle = C.skinD;
    ctx.beginPath(); ctx.arc(pose.lHa[0], pose.lHa[1], 4.2, 0, Math.PI * 2); ctx.fill();

    fillCapsule(pose.lHi[0], pose.lHi[1], pose.lKn[0], pose.lKn[1], 5.5, C.pantsD);
    fillCapsule(pose.lKn[0], pose.lKn[1], pose.lFo[0], pose.lFo[1], 4.5, C.pantsD);
    ctx.save();
    ctx.translate(pose.lFo[0], pose.lFo[1]);
    ctx.fillStyle = C.shoeD;
    ctx.beginPath(); ctx.ellipse(2, 2, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.shoeAlt;
    ctx.beginPath(); ctx.ellipse(1, 0, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* ── TORSO ── */
    capsule(neckX, neckY, hipX, hipY, 12);
    ctx.fillStyle = C.top;
    ctx.fill();

    /* Collar highlight */
    ctx.fillStyle = C.topL;
    ctx.beginPath(); ctx.arc(neckX, neckY + 1, 6.5, 0, Math.PI * 2); ctx.fill();

    /* Shirt centre stripe */
    ctx.save();
    ctx.globalAlpha = alpha * 0.30;
    ctx.strokeStyle = C.topL;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, neckY + 7);
    ctx.lineTo(-3, hipY - 2);
    ctx.stroke();
    ctx.restore();

    /* Hip band (waistline detail) */
    ctx.save();
    ctx.globalAlpha = alpha * 0.50;
    ctx.strokeStyle = C.pantsD;
    ctx.lineWidth = 2;
    capsule(pose.lHi[0], pose.lHi[1], pose.rHi[0], pose.rHi[1], 6);
    ctx.fillStyle = C.pants;
    ctx.fill();
    ctx.restore();

    /* ── FRONT LIMBS (right = closer, drawn on top) ── */

    fillCapsule(pose.rHi[0], pose.rHi[1], pose.rKn[0], pose.rKn[1], 5.5, C.pants);
    fillCapsule(pose.rKn[0], pose.rKn[1], pose.rFo[0], pose.rFo[1], 4.5, C.pants);
    ctx.save();
    ctx.translate(pose.rFo[0], pose.rFo[1]);
    ctx.fillStyle = C.shoeD;
    ctx.beginPath(); ctx.ellipse(2, 2, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.shoe;
    ctx.beginPath(); ctx.ellipse(1, 0, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    fillCapsule(pose.rSh[0], pose.rSh[1], pose.rEl[0], pose.rEl[1], 4.5, C.top);
    fillCapsule(pose.rEl[0], pose.rEl[1], pose.rHa[0], pose.rHa[1], 3.8, C.skin);
    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.arc(pose.rHa[0], pose.rHa[1], 4.5, 0, Math.PI * 2); ctx.fill();

    /* Neck */
    fillCapsule(neckX, neckY, neckX, neckY + 5, 4.5, C.skin);

    /* ── HEAD ── */

    /* Hair bulk (behind face) */
    ctx.fillStyle = C.hair;
    ctx.beginPath(); ctx.ellipse(hx, hy + 4, 23, 25, 0, 0, Math.PI * 2); ctx.fill();

    /* Hair spikes above head */
    const spikes = [
      [hx - 19, hy - 8,  -0.55],
      [hx - 11, hy - 21, -0.27],
      [hx,      hy - 26,  0.00],
      [hx + 11, hy - 21,  0.27],
      [hx + 19, hy - 8,   0.55],
    ];
    ctx.fillStyle = C.hair;
    for (const [sx, sy, rot] of spikes) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-5, 6); ctx.lineTo(0, -12); ctx.lineTo(5, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* Face oval */
    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.ellipse(hx, hy, 20, 22, 0, 0, Math.PI * 2); ctx.fill();

    /* Hair fringe / bangs overlapping forehead */
    ctx.fillStyle = C.hair;
    ctx.beginPath(); ctx.ellipse(hx - 8, hy - 17, 10, 8, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 4, hy - 18, 9,  7,  0.10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 14, hy - 14, 7, 7,  0.32, 0, Math.PI * 2); ctx.fill();

    /* Hair highlight streak */
    ctx.fillStyle = C.hairS;
    ctx.beginPath(); ctx.ellipse(hx - 6, hy - 14, 3, 9, 0.28, 0, Math.PI * 2); ctx.fill();

    /* ── EXPRESSIONS ── */
    if (expr === 'happy') {
      /* Big sparkly eyes */
      for (const [ex, ey] of [[-7, hy - 1], [7, hy - 1]]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(ex, ey, 5.5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.iris;
        ctx.beginPath(); ctx.ellipse(ex, ey + 1, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.eye;
        ctx.beginPath(); ctx.ellipse(ex, ey + 1.5, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ex + 1.5, ey - 1,  1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex - 1.5, ey + 1,  0.8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.eye; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(ex, ey - 1, 5.5, Math.PI + 0.3, -0.3); ctx.stroke();
      }
      ctx.strokeStyle = C.mouth; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(hx, hy + 8, 6, 0.2, Math.PI - 0.2); ctx.stroke();

    } else if (expr === 'run') {
      /* Determined angled eyes */
      for (const [ex, ey, flip] of [[-7, hy - 1, -1], [7, hy - 1, 1]]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(ex, ey, 5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.iris;
        ctx.beginPath(); ctx.ellipse(ex, ey + 1, 3.5, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.eye;
        ctx.beginPath(); ctx.ellipse(ex, ey + 1.5, 2.2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ex + flip * 1.5, ey - 1, 1.2, 0, Math.PI * 2); ctx.fill();
        /* Angled brow */
        ctx.strokeStyle = C.hair; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ex - flip * 5, ey - 11);
        ctx.lineTo(ex + flip * 5, ey - 13);
        ctx.stroke();
      }
      /* Smirk */
      ctx.strokeStyle = C.mouth; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hx + 2, hy + 8, 4, 0.3, Math.PI - 0.5); ctx.stroke();
      /* Sweat drop */
      ctx.fillStyle = C.sweat;
      ctx.beginPath(); ctx.arc(hx + 21, hy - 5, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + 21, hy - 7.5);
      ctx.lineTo(hx + 17, hy - 14);
      ctx.lineTo(hx + 25, hy - 14);
      ctx.closePath(); ctx.fill();

    } else {
      /* strain — squinting effort eyes */
      for (const [ex, ey] of [[-7, hy - 1], [7, hy - 1]]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(ex, ey, 5.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.iris;
        ctx.beginPath(); ctx.ellipse(ex, ey + 1, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
        /* Skin-coloured upper eyelid covers the top half → squint effect */
        ctx.fillStyle = C.skin;
        ctx.beginPath(); ctx.arc(ex, ey - 2, 6.2, Math.PI, 0); ctx.fill();
        /* Tiny shine */
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(ex + 1, ey + 0.5, 1, 0, Math.PI * 2); ctx.fill();
      }
      /* Effort grimace */
      ctx.strokeStyle = C.mouth; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx - 5, hy + 9); ctx.lineTo(hx + 5, hy + 9); ctx.stroke();
      /* Effort energy marks */
      ctx.strokeStyle = 'rgba(251,113,133,0.80)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx + 17, hy - 5); ctx.lineTo(hx + 22, hy - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx + 15, hy);     ctx.lineTo(hx + 21, hy);      ctx.stroke();
    }

    /* Blush marks (always) */
    ctx.fillStyle = C.blush;
    ctx.beginPath(); ctx.ellipse(hx - 14, hy + 6, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 14, hy + 6, 5, 3, 0, 0, Math.PI * 2); ctx.fill();

    /* ── EXERCISE LABEL PILL ── */
    ctx.save();
    if (!facingRight) ctx.scale(-1, 1); /* un-flip so text is always readable */
    ctx.font = 'bold 9px "Space Grotesk",system-ui,sans-serif';
    const tw = ctx.measureText(label).width;
    const lx = 0, ly = hy - 38;
    const ph = 13, pr = 5, pw = tw + 14;

    ctx.globalAlpha = alpha * 0.88;
    ctx.fillStyle = 'rgba(76,29,149,0.84)';
    ctx.beginPath();
    ctx.moveTo(lx - pw/2 + pr, ly - ph/2);
    ctx.lineTo(lx + pw/2 - pr, ly - ph/2);
    ctx.quadraticCurveTo(lx + pw/2, ly - ph/2, lx + pw/2, ly - ph/2 + pr);
    ctx.lineTo(lx + pw/2, ly + ph/2 - pr);
    ctx.quadraticCurveTo(lx + pw/2, ly + ph/2, lx + pw/2 - pr, ly + ph/2);
    ctx.lineTo(lx - pw/2 + pr, ly + ph/2);
    ctx.quadraticCurveTo(lx - pw/2, ly + ph/2, lx - pw/2, ly + ph/2 - pr);
    ctx.lineTo(lx - pw/2, ly - ph/2 + pr);
    ctx.quadraticCurveTo(lx - pw/2, ly - ph/2, lx - pw/2 + pr, ly - ph/2);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e9d5ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, ly);
    ctx.restore();

    ctx.restore();
  }

  /* ── Animation state ── */
  let exIdx   = 0;
  let fIdx    = 0;
  let fT      = 0;
  let exTimer = 0;
  const EX_DUR = 5500;

  let blendFrom = null;
  let blendT    = 0;
  const BLEND   = 450;

  let figAlpha = 0;
  let prev = performance.now();

  (function loop(now) {
    const dt = Math.min(now - prev, 50);
    prev = now;
    ctx.clearRect(0, 0, W, H);

    /* Smooth follow + facing direction */
    const dx = curX - figX;
    figX += dx * 0.11;
    figY += (curY - figY) * 0.11;
    if (Math.abs(dx) > 0.5) facingRight = dx > 0;

    /* Fade in */
    figAlpha = Math.min(figAlpha + dt * 0.0018, 0.88);

    /* Advance animation frame */
    const ex = EXERCISES[exIdx];
    fT += dt / ex.spd;
    if (fT >= 1) { fT -= 1; fIdx = (fIdx + 1) % ex.frames.length; }

    /* Cycle to next exercise */
    exTimer += dt;
    if (exTimer >= EX_DUR) {
      exTimer = 0;
      const ni = (fIdx + 1) % ex.frames.length;
      blendFrom = lerpPose(ex.frames[fIdx], ex.frames[ni], eio(fT));
      blendT    = 0;
      exIdx     = (exIdx + 1) % EXERCISES.length;
      fIdx      = 0;
      fT        = 0;
    }

    /* Interpolate current pose */
    const curEx = EXERCISES[exIdx];
    const ni    = (fIdx + 1) % curEx.frames.length;
    let pose    = lerpPose(curEx.frames[fIdx], curEx.frames[ni], eio(fT));

    /* Blend from previous exercise */
    if (blendFrom) {
      blendT += dt;
      const bp = Math.min(blendT / BLEND, 1);
      pose = lerpPose(blendFrom, pose, eio(bp));
      if (bp >= 1) blendFrom = null;
    }

    drawCharacter(pose, figX, figY - 22, figAlpha, curEx.expr, curEx.name);
    requestAnimationFrame(loop);
  })(performance.now());

})();
