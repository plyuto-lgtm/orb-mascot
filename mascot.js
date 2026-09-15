/* Orb mascot — a black sphere with two eyes that live on its 3D surface.
   Usage:  const m = new Mascot(svgElement, { eyeLon: 16 });
           m.look(yaw, pitch)   // degrees, positive = right / up
           m.blink()            // one blink
           m.set({ eyeScale: 1.2, squash: 0.5 })
   Call m.render() after changing values directly, or m.start() for the
   built-in loop (smoothing, idle wander, blinking, cursor follow). */
(function (global) {
  const D2R = Math.PI / 180;
  let uid = 0;
  const NS = 'http://www.w3.org/2000/svg';
  const hex2 = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

  // body silhouettes, centred on (100,100); sphereR = radius of the inner sphere the eyes ride on
  const SHAPES = {
    circle:  R => ({ d: `M${100-R} 100a${R} ${R} 0 1 0 ${2*R} 0a${R} ${R} 0 1 0 ${-2*R} 0Z`, sphereR: R }),
    squircle:R => ({ surf: { rx: 1, ry: 1 }, d: polar(t => { const c=Math.cos(t), s=Math.sin(t); const k=Math.pow(Math.pow(Math.abs(c),4)+Math.pow(Math.abs(s),4),-0.25); return [R*0.98*k*c, R*0.98*k*s]; }), sphereR: R }),
    egg:     R => ({ surf: { cy: 0.06, rx: 0.9, ry: 0.98 }, d: polar(t => { const c=Math.cos(t), s=Math.sin(t); const up = s<0 ? -s : 0; return [R*0.94*c*(1-0.22*Math.pow(up,1.5)), R*(s<0 ? 1.03*s : 0.97*s)]; }), sphereR: R*0.9 }),
    pebble:  R => ({ surf: { rx: 0.95, ry: 0.92 }, d: polar(t => { const r=R*(0.98+0.05*Math.sin(3*t+0.6)+0.03*Math.cos(5*t)); return [r*Math.cos(t), r*Math.sin(t)]; }), sphereR: R*0.93 }),
  };
  // composed bodies: union of circles, joins filleted by `round`
  // composed bodies: union of circles, joins filleted by `round`.
  // anim(circles, k) returns the circles for this frame. k = { t, dt (s), yaw, pitch, vel (deg/s, smoothed), poke (1..0), twitch {i, p} | null, mem (per-instance scratch) }
  const S = Math.sin, PI2 = Math.PI * 2;
  // Pieces (every circle except `main`) sit on the head sphere and rotate with the head, which follows the gaze
  // at `head` of the angle through a spring (k = stiffness, d = damping). anim() adds idle motion on top:
  // k = { t, dt (s), vel (deg/s), poke (1..0), twitch {i, p} | null, mem }
  const COMPOSED = {
    bear:  { c: [[0,0.05,0.9],[-0.6,-0.62,0.32],[0.6,-0.62,0.32]], sphereR: 0.88, surf: { cy: 0.05 }, main: 0, head: 0.35, k: 60, d: 14,
      anim: (c, k) => c.map(([x, y, r], i) => {
        if (i === 0) return [x, y, r];
        let dx = 0, dr = 0;
        if (k.twitch && k.twitch.i === i) { const p = k.twitch.p, env = Math.pow(S(p * Math.PI), 0.6); dx = S(p * PI2) * 0.07 * env * (i === 1 ? -1 : 1); dr = 0.08 * env * S(p * Math.PI * 2); return [x + dx, y - 0.05 * env, r * (1 + dr)]; }
        return [x + dx, y + k.poke * 0.02, r * (1 + dr - k.poke * 0.03)];        // ears settle back a touch on a poke          // twitch; ears flatten on a poke
      }) },
    lemon: { c: [[0,0,0.84],[0,-0.72,0.3],[0,0.72,0.3]], sphereR: 0.84, surf: { rx: 0.84, ry: 0.98 }, main: 0, head: 0.4, k: 50, d: 13,
      anim: (c, k) => c.map(([x, y, r], i) => i === 0 ? [x, y, r] : [x + S(k.t * PI2 / 3.1) * 0.012, y + (i === 1 ? -1 : 1) * k.poke * 0.018, r]) },
    ghost: { c: [[0,-0.12,0.84],[-0.48,0.62,0.3],[0,0.7,0.3],[0.48,0.62,0.3]], sphereR: 0.84, surf: { cy: -0.12 }, main: 0, head: 0.32, k: 30, d: 10,
      anim: (c, k) => c.map(([x, y, r], i) => {
        if (i === 0) return [x, y, r];
        const amp = 0.025 + Math.min(0.03, Math.abs(k.vel) / 2500);                   // tail waves; harder when the head moves
        return [x, y + S(k.t * PI2 / 1.7 + i * 1.2) * amp + k.poke * 0.012, r * (1 + k.poke * 0.02)];
      }) },
    cloud: { c: [[0,0,0.94,0.5,-45],[0,0,0.94,0.5,45]], sphereR: 0.86, main: -1, head: 0.3, k: 40, d: 12,   // two pills crossed; the X tilts with the head
      anim: (c, k) => c.map(([x, y, rx, ry, a], i) => {
        const b = S(k.t * PI2 / 2.8 + i * Math.PI) * 0.015, puff = k.poke * 0.03;
        return [x, y, rx * (1 + b + puff), ry * (1 + puff - b), a + k.hy * 0.35 + (i ? 1 : -1) * k.hp * 0.15];
      }) },
    drop:  { c: [[0,0.12,0.84],[0,-0.7,0.26]], sphereR: 0.84, surf: { cy: 0.12 }, main: 0, head: 0.45, k: 45, d: 7,        // slightly under-damped: the sprout settles with one soft overshoot
      anim: (c, k) => c.map(([x, y, r], i) => i === 0 ? [x, y, r] : [x, y - k.poke * 0.02, r * (1 + k.poke * 0.04)]) },
    stack: { c: [[0,0,0.55],[0,-0.36,0.86,0.52],[0,0.36,0.86,0.52]], sphereR: 0.84, surf: { rx: 0.9, ry: 0.8 }, main: 0, head: 0.3, k: 40, d: 12,   // hidden core; both ellipses turn with the head
      // the half on the side it looks toward leads; the other half follows on the slow spring
      lag: (i, k) => { const w = Math.max(-1, Math.min(1, k.pitch / 12)); return i === 1 ? Math.max(0, w) : Math.max(0, -w); },
      anim: (c, k) => c.map((p, i) => i === 0 ? p : [p[0], p[1] + S(k.t * PI2 / 3.4 + i * Math.PI) * 0.006, p[2], p[3] * (1 + k.poke * 0.03)]) },
    seacow: { c: [[0,-0.06,0.86],[-0.62,0.6,0.32],[0.62,0.6,0.32]], sphereR: 0.86, surf: { cy: -0.06 }, main: 0, head: 0.35, k: 60, d: 14,   // like the bear, flipped: feet at the bottom corners
      anim: (c, k) => c.map(([x, y, r], i) => i === 0 ? [x, y, r] : [x + S(k.t * PI2 / 2.9 + i * 2) * 0.006, y - k.poke * 0.02, r * (1 - k.poke * 0.03)]) },
    flower: { c: [[0,0,0.8], ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4 + Math.PI / 8; return [0.62 * Math.cos(a), 0.62 * Math.sin(a), 0.33]; })], sphereR: 0.86, main: 0, head: 0.25, k: 40, d: 12,
      anim: (c, k) => c.map(([x, y, r], i) => i === 0 ? [x, y, r] : [x, y, r * (1 + S(k.t * PI2 / 3 + i * 0.8) * 0.02 + k.poke * 0.03)]) },   // petals breathe in a ripple
  };
  // ---------- acts: scripted performances layered on top of the normal behaviour ----------
  // run(t, A, ctx): t in seconds; set A.rot/dx/dy/sx/sy (body, pivotY in R units, 1 = bottom edge),
  // A.pieces (fn over normalised pieces before head projection), A.eyeScale/eyeSquash/eyeShake, A.look [yaw, pitch]
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const E = {
    io: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    o: t => 1 - Math.pow(1 - t, 3),
    i: t => t * t * t,
    back: t => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    spring: t => 1 - Math.exp(-6 * t) * Math.cos(11 * t),
  };
  const rotP = (p, deg) => { const a = deg * D2R, c = Math.cos(a), sn = Math.sin(a), q = p.slice(); q[0] = p[0] * c - p[1] * sn; q[1] = p[0] * sn + p[1] * c; if (q.length > 3) q[4] = (p[4] || 0) + deg; return q; };
  const pulse = (t, a, b) => S(Math.PI * seg(t, a, b));                                  // 0 -> 1 -> 0 across [a, b]
  // press the body against a floor: pieces whose bottom passes the floor line flatten and spread (normalised units)
  const restBottom = cs => Math.max(...cs.map(p => p[1] + (p.length > 3 ? p[3] : p[2])));
  const squashFloor = (cs, depth) => {
    if (depth <= 0) return cs; const floor = restBottom(cs) - depth;
    return cs.map(p => { const ry = p.length > 3 ? p[3] : p[2], rx = p[2], over = p[1] + ry - floor; if (over <= 0) return p;
      return [p[0], p[1] - over * 0.55, rx + over * 0.6, ry - over * 0.55, p.length > 3 ? p[4] : 0]; });
  };
  // hop: soft crouch, arc, gentle landing (floor deformation optional), small settle
  const hop = (t, A, n, P, h, useFloor) => {
    if (t >= n * P) return; const u = (t % P) / P;
    if (u < 0.2) { const c = E.io(u / 0.2); A.sy = 1 - 0.06 * c; A.sx = 1 + 0.03 * c; return; }
    if (u < 0.66) { const f = (u - 0.2) / 0.46; A.dy = -h * S(Math.PI * f); const c = 1 - E.o(Math.min(1, f * 3)); A.sy = 1 - 0.06 * c; A.sx = 1 + 0.03 * c; return; }
    if (u < 0.82) { const c = S(Math.PI * (u - 0.66) / 0.16); if (useFloor) A.floor = 0.1 * c; else A.sy = 1 - 0.07 * c; A.sx = 1 + 0.05 * c; return; }
    const w = (u - 0.82) / 0.18; A.sy = 1 + 0.02 * S(w * Math.PI) ;
  };

  const ACTS = {
    bear: {
      regrow: { label: 'New ears', hint: 'Pulls its ears up and off, they fade away, then fresh ones grow back out of the head.', dur: 3.6,
        run: (t, A) => { const b = pulse(t, 0, 0.4); A.eyeScale = 1 + 0.2 * b;
          const up = E.i(seg(t, 0.4, 1.4)), grow = t < 1.9 ? 0 : E.back(seg(t, 1.9, 3.1));
          A.eyeSquash = 1 - 0.3 * pulse(t, 0.4, 1.4);
          A.pieces = cs => cs.map((p, i) => { if (!i) return p; if (t < 1.9) return [p[0] * (1 + 0.15 * up), p[1] - 0.5 * up, p[2] * (1 - up)]; return [p[0] * (0.7 + 0.3 * grow), -0.3 + (p[1] + 0.3) * grow, p[2] * Math.max(0, grow)]; });
          if (t >= 1.9) A.sy = 1 - 0.04 * pulse(t, 1.9, 2.5); } },
    },
    lemon: {
      bell: { label: 'Bell', hint: 'Swings from its top nub like an old alarm-clock bell, ringing down to rest.', dur: 3.0,
        run: (t, A) => { const e = Math.exp(-t / 1.1); A.rot = 18 * S(PI2 * t / 0.85) * e; A.pivotY = -0.98;
          const lag = 0.05 * S(PI2 * t / 0.85 - 1.2) * e; A.pieces = cs => cs.map((p, i) => i === 2 ? [p[0] + lag, p[1], p[2]] : p); } },
      propeller: { label: 'Propeller', hint: 'Eyes bump, then the nubs orbit the core two full turns; the body shrinks with the speed of the spin.', dur: 3.3,
        run: (t, A) => { const b = pulse(t, 0, 0.45); A.eyeScale = 1 + 0.3 * b; A.eyeSquash = 1 - 0.15 * b;
          const u = seg(t, 0.45, 2.75), th = 720 * E.io(u);
          const speed = (u < 0.5 ? 12 * u * u : 12 * (1 - u) * (1 - u)) / 3;                       // normalised angular speed of the ease
          A.pieces = cs => cs.map((p, i) => i ? rotP(p, th) : p);
          A.sx = A.sy = 1 - 0.14 * speed; A.pivotY = 0; A.eyeSquash *= 1 - 0.4 * speed; } },
    },
    ghost: {
      tuck: { label: 'Tuck in', hint: 'Draws its tail up into the body, the skirt flattens while it holds, then the bumps snap back out.', dur: 2.8,
        run: (t, A) => {
          const sOf = d => { const tt = t - d; return tt < 0.9 ? E.io(seg(tt, 0, 0.9)) : tt < 1.5 ? 1 : 1 - E.back(seg(tt, 1.5, 2.3)); };
          const sMid = sOf(0), delay = [0, 0.08, 0, 0.08];
          A.pieces = cs => cs.map((p, i) => { if (!i) return p; const sv = sOf(delay[i]), sp = Math.max(0, sv); return [p[0] * (1 - 0.3 * sp), p[1] - 0.55 * sv, p[2] * (1 - 0.45 * sp)]; });
          const held = Math.max(0, sMid); A.sy = 1 - 0.07 * held; A.sx = 1 + 0.05 * held; A.eyeSquash = 1 - 0.35 * held; } },
      piano: { label: 'Piano', hint: 'Presses its tail bumps one after another like piano keys; the idle keys shrink and lean away.', dur: 3.4,
        run: (t, A) => { const order = [1, 2, 3, 2, 1, 2, 3, 3, 2], step = 0.36, k = Math.min(order.length - 1, Math.floor(t / step)), u = (t % step) / step, pr = t < order.length * step ? S(Math.PI * u) : 0, key = order[k];
          A.pieces = cs => { const kx = cs[key][0]; return cs.map((p, i) => { if (!i) return p; if (i === key) return [p[0], p[1] + 0.09 * pr, p[2] * (1 - 0.12 * pr)]; const away = Math.sign(p[0] - kx) || (i < key ? -1 : 1); return [p[0] + away * 0.06 * pr, p[1] - 0.03 * pr, p[2] * (1 - 0.15 * pr)]; }); };
          A.look = [0, -14]; A.dy = 1.5 * pr; } },
    },
    cloud: {
      quarter: { label: 'Quarter turns', hint: 'Turns a full circle in four springy 90 degree steps; the eyes start to follow each turn and swing back.', dur: 3.7,
        run: (t, A) => { const step = 0.85, k = Math.min(3, Math.floor(t / step)), u = seg(t, k * step, k * step + 0.62), th = t >= 4 * step ? 360 : 90 * k + 90 * E.back(u);
          A.pieces = cs => cs.map(p => p.length > 3 ? [p[0], p[1], p[2], p[3], (p[4] || 0) + th] : p); A.dy = -3 * S(Math.PI * u);
          A.eyeOrbit = 14 * S(Math.PI * Math.min(1, u * 1.3)); } },
      hop: { label: 'Hop', hint: 'Two soft hops with a small squash on landing.', dur: 2.2, run: (t, A) => hop(t, A, 2, 1.0, 20, false) },
    },
    drop: {
      hop: { label: 'Hop', hint: 'Two soft hops, the bottom flattening a little on each landing.', dur: 2.2, run: (t, A) => hop(t, A, 2, 1.0, 22, true) },
      sprout: { label: 'New sprout', hint: 'Eyes bump, the body tightens as the sprout pulls free and fades, then a new one grows out of it.', dur: 3.5,
        run: (t, A) => { const b = pulse(t, 0, 0.4); A.eyeScale = 1 + 0.25 * b;
          const up = E.i(seg(t, 0.4, 1.3)), grow = t < 1.8 ? 0 : E.back(seg(t, 1.8, 2.9)), pull = pulse(t, 0.4, 1.3);
          A.eyeSquash = 1 - 0.3 * pull; A.sx = A.sy = 1 - 0.08 * pull; A.pivotY = 0;
          A.pieces = cs => cs.map((p, i) => { if (!i) return p; if (t < 1.8) return [p[0], p[1] - 0.6 * up, p[2] * (1 - up)]; return [p[0], -0.35 + (p[1] + 0.35) * grow, p[2] * Math.max(0, grow)]; });
          if (t >= 1.8) A.sy *= 1 - 0.04 * pulse(t, 1.8, 2.4); } },
    },
    stack: {
      deflate: { label: 'Deflate', hint: 'Squeezes toward its centre with a soft spring, holds, then springs back.', dur: 3.0,
        run: (t, A) => { const sv = t < 1.1 ? E.back(E.io(seg(t, 0, 1.1))) : t < 1.6 ? 1 : 1 - E.spring(seg(t, 1.6, 2.9)); const sp = Math.max(0, sv);
          A.pieces = cs => cs.map((p, i) => i === 0 ? p : [p[0], p[1] * (1 - 0.42 * sv), p[2] * (1 + 0.1 * sp), p[3] * (1 - 0.28 * sp)]);
          A.eyeScale = 1 - 0.2 * sp; A.eyeSquash = 1 - 0.25 * sp; } },
      stretch: { label: 'Stretch', hint: 'A slow blink, then the halves pull apart with the eyes stretching too, hold, and snap back together.', dur: 3.2,
        run: (t, A) => { A.eyeSquash = 1 - 0.35 * pulse(t, 0, 0.7);
          const u = t < 0.7 ? 0 : t < 1.7 ? E.io(seg(t, 0.7, 1.7)) : t < 2.3 ? 1 : 1 - E.spring(seg(t, 2.3, 3.2));
          A.pieces = cs => cs.map((p, i) => i === 0 ? [p[0], p[1], p[2] * (1 + 0.1 * u), p[2] * (1 + 0.1 * u) + 0.26 * u, 0] : i === 1 ? [p[0], p[1] - 0.24 * u, p[2], p[3]] : [p[0], p[1] + 0.24 * u, p[2], p[3]]);   // the core grows into a waist
          A.eyeSquash *= 1 + 0.4 * u; A.eyeScale = 1 + 0.05 * u; } },
    },
    seacow: {
      wave: { label: 'Wave', hint: 'Lifts and waves the left flipper, then the right, glancing at each.', dur: 3.2,
        run: (t, A) => { const side = t < 1.55 ? 1 : 2, u = side === 1 ? seg(t, 0.1, 1.5) : seg(t, 1.6, 3.0), lift = S(Math.PI * u), wig = S(PI2 * u * 3) * 0.06 * lift;
          A.pieces = cs => cs.map((p, i) => i === side ? [p[0] + (side === 1 ? -0.12 : 0.12) * lift + wig, p[1] - 0.55 * lift, p[2]] : p);
          A.look = [side === 1 ? -18 : 18, 8]; A.rot = (side === 1 ? -4 : 4) * lift; } },
      cover: { label: 'Cover eyes', hint: 'Each flipper travels up its own side of the body and in over the eye, holds, then goes back down the same way.', dur: 3.4,
        run: (t, A, ctx) => {
          const o = ctx.self.o, su = ctx.self._surf, ex = Math.sin(o.eyeLon * D2R) * su.rx, ey = su.cy - Math.sin(o.eyeLat * D2R) * su.ry;
          const u = t < 1.0 ? E.io(seg(t, 0, 1.0)) : t < 2.1 ? 1 : 1 - E.io(seg(t, 2.1, 3.2));               // 0 at rest, 1 covering
          const path = (side, k) => {                                                              // corner -> up the side -> in over the eye
            const x0 = side * 0.62, y0 = 0.6, x1 = side * 0.7, y1 = 0.02, x2 = side * ex, y2 = ey;
            if (k < 0.55) { const a = E.io(k / 0.55); return [x0 + (x1 - x0) * a, y0 + (y1 - y0) * a]; }
            const a = E.io((k - 0.55) / 0.45); return [x1 + (x2 - x1) * a, y1 + (y2 - y1) * a]; };
          const L = path(-1, u), R = path(1, u), r = 0.32 - 0.06 * u;
          A.pieces = cs => cs.map((p, i) => i === 1 ? [L[0], L[1], r] : i === 2 ? [R[0], R[1], r] : p);
          if (u > 0) A.overlay = [[L[0], L[1], r], [R[0], R[1], r]];
          A.look = [0, 0]; } },
    },
    flower: {
      spin: { label: 'Spin', hint: 'A springy half turn; the eyes join into one at the middle of the turn and part again as it settles.', dur: 2.8,
        run: (t, A) => { const u = seg(t, 0, 2.4), th = 180 * E.spring(u), mid = S(Math.PI * clamp01(u * 1.1));
          A.pieces = cs => cs.map((p, i) => i ? rotP(p, th) : p);
          A.roundMul = 1 - 0.6 * mid; A.eyeMerge = mid; A.eyeScale = 1 + 0.6 * mid; } },
      inflate: { label: 'Inflate', hint: 'The core swells into one big circle that fills the gaps between the petals, easing in with a soft spring, then settles back.', dur: 3.0,
        run: (t, A) => { const sv = t < 1.1 ? E.back(E.io(seg(t, 0, 1.1))) : t < 1.7 ? 1 : 1 - E.spring(seg(t, 1.7, 2.9)); const sp = Math.max(0, sv);
          A.pieces = cs => cs.map((p, i) => i ? p : [p[0], p[1], p[2] * (1 + 0.22 * sv)]);
          A.eyeScale = 1 + 0.3 * sp; } },
    },
  };
  for (const k in ACTS) if (COMPOSED[k]) COMPOSED[k].acts = ACTS[k];

  // Generative blob bodies: a seed produces a whole body definition (pieces, spring, idle motion, lag rule)
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // complexity 0..1: low = one or two mirrored circles, high = up to five pieces, ellipses, asymmetry
  function blobBody(seed, opts = {}) {
    const cx = Math.max(0, Math.min(1, opts.complexity == null ? 0.5 : opts.complexity));
    const R = mulberry32((seed | 0) * 9973 + 17), rnd = (a, b) => a + (b - a) * R(), pick = arr => arr[Math.floor(R() * arr.length)];
    const mainR = rnd(0.74, 0.9), c = [[0, rnd(-0.08, 0.08), mainR]];
    const n = 1 + Math.floor(R() * (1 + cx * 4)), mirror = R() < 0.95 - cx * 0.7; let ellipses = 0;
    for (let i = 0; i < n; i++) {
      const ang = rnd(-Math.PI, Math.PI), r = rnd(0.22, 0.3 + cx * 0.12), ell = R() < cx * 0.6;
      const dist = Math.max(rnd(0.55, 0.8), mainR - r + 0.16);                        // always pokes clearly out of the core
      const x = Math.cos(ang) * dist, y = Math.sin(ang) * dist;
      const piece = ell ? [x, y, r * rnd(1.1, 1.6), r * rnd(0.5, 0.85), rnd(-60, 60)] : [x, y, r];
      if (ell) ellipses++;
      c.push(piece);
      if (mirror && Math.abs(x) > 0.12) { const m = piece.slice(); m[0] = -x; if (m.length > 3) m[4] = -m[4]; c.push(m); }
    }
    const head = rnd(0.22, 0.45), k = rnd(30, 75), bouncy = R() < 0.25, d = bouncy ? rnd(5, 8) : rnd(10, 15);
    const phase = c.map(() => R() * PI2), speed = rnd(2.2, 3.8), amp = rnd(0.01, 0.03), lagMode = R() < 0.35;
    const temperament = pick(['calm', 'curious', 'sleepy', 'jumpy']);
    const traits = [
      `${c.length - 1} piece${c.length > 2 ? 's' : ''} on a ${mainR.toFixed(2)}R core` + (ellipses ? `, ${ellipses} of them elliptical` : ''),
      mirror ? 'mirrored left and right' : 'asymmetric',
      bouncy ? 'under-damped spring, pieces overshoot and settle' : 'well-damped spring, pieces glide',
      lagMode ? 'the side it looks away from trails the turn' : 'all pieces turn together',
      `breathes every ${speed.toFixed(1)} s at ${(amp * 100).toFixed(0)}% of piece size`,
    ];
    return {
      name: 'blob-' + seed, seed, complexity: cx, c, sphereR: mainR, main: 0, head, k, d, temperament, traits,
      anim: (cs, kk) => cs.map((p, i) => {
        if (i === 0) return p;
        const b = 1 + S(kk.t * PI2 / speed + phase[i]) * amp;
        return p.length > 3 ? [p[0], p[1], p[2] * b, p[3] * (1 + kk.poke * 0.03), p[4]] : [p[0], p[1], p[2] * (b + kk.poke * 0.03)];
      }),
      lag: lagMode ? (i, kk) => { const w = Math.max(-1, Math.min(1, kk.yaw / 15)); return c[i][0] > 0 ? Math.max(0, -w) : Math.max(0, w); } : null,
    };
  }
  // project a rest-position piece onto the head sphere and rotate it by the head angles (degrees)
  function headProject(c, hy, hp) {
    const [x, y, r] = c, d2 = x * x + y * y, z0 = Math.sqrt(Math.max(0.02, 1 - d2));
    const v = rotv([x, -y, z0], hy * D2R, hp * D2R);
    const depth = z => z >= 0 ? 0.85 + 0.15 * z : 0.85 * Math.max(0, 1 + z / 0.6);      // near pieces read larger; behind the head they shrink away
    const sc = depth(v[2]) / depth(z0);
    return c.length > 3 ? [v[0], -v[1], r * sc, c[3] * sc, c[4] || 0] : [v[0], -v[1], r * sc];
  }
  function rotv(v, y, p) {
    const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
    const x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy;
    return [x, v[1] * cp + z * sp, -v[1] * sp + z * cp];
  }
  function polar(fn, n = 96) { let d=''; for (let i=0;i<n;i++){ const [x,y]=fn(i/n*Math.PI*2); d+=(i?'L':'M')+(100+x).toFixed(2)+' '+(100+y).toFixed(2); } return d+'Z'; }
  const EYES = { round:{eyeW:22,eyeH:22,corner:1}, pill:{eyeW:18,eyeH:30,corner:1}, square:{eyeW:22,eyeH:22,corner:0.35}, wide:{eyeW:28,eyeH:18,corner:1}, tall:{eyeW:14,eyeH:34,corner:1} };

  class Mascot {
    constructor(svg, opts = {}) {
      this.svg = svg;
      this.o = Object.assign({
        radius: 96,      // sphere radius in viewBox units (centre 100,100; viewBox -24 -24 248 248 leaves room for ears and puffs)
        eyeLon: 16,      // degrees each eye sits from the centre meridian
        eyeLat: 4,       // degrees above the equator
        eyeW: 22,        // eye width  (viewBox units)
        eyeH: 22,        // eye height (viewBox units)
        corner: 1,       // 0 = square, 1 = fully rounded
        body: 'circle',  // circle | squircle | egg | pebble | bear | lemon | ghost | cloud | drop | stack | seacow | flower | array of [x,y,r] or [x,y,rx,ry,angle]
        round: 0.5,      // fillet amount for composed bodies, 0..1
        eye: null,       // preset name: round | pill | square | wide | tall (overrides eyeW/eyeH/corner)
        maxYaw: 40, maxPitch: 28,
        shaded: true, wireframe: false, lean: true, breathe: true,
        follow: true, idle: true, autoBlink: true,
        color: '#0a0a0a',   // body colour; shading is derived from it
        shade: 'flat',      // flat | soft | glossy | rim   (shaded:false forces flat)
        light: -135,        // direction the light comes from, degrees: 0 right, -90 top, -135 top-left
        contrast: 1,        // shading strength multiplier
        eyeColor: null,     // null = auto (white on dark bodies, ink on light ones)
        twitch: false,      // bear only: occasional single ear wiggle
      }, opts);
      // live values
      this.yaw = 0; this.pitch = 0; this.tYaw = 0; this.tPitch = 0;
      this.blinkAmt = 0; this.eyeScale = 1; this.squash = 1;
      this.tEyeScale = 1; this.tSquash = 1;
      this.manual = false;
      this._poke = 0; this._pokeS = 0; this._vel = 0; this._twitch = null; this._t = 0; this._dt = 0; this._mem = {};
      this._hy = 0; this._hp = 0; this._hvy = 0; this._hvp = 0;   // head angles + spring velocities
      this._sy = 0; this._sp = 0; this._svy = 0; this._svp = 0;   // slow head spring (for lagging pieces)
      this._build(); this.render();
    }

    _build() {
      const id = 'orb' + (uid++);
      const s = this.svg; s.setAttribute('viewBox', '-24 -24 248 248'); s.innerHTML = '';
      const defs = el('defs', {});
      const g = el('radialGradient', { id: id + 'g', gradientUnits: 'userSpaceOnUse', cx: 72, cy: 62, r: 165 });
      this.stops = [el('stop', { offset: '0' }), el('stop', { offset: '0.45' }), el('stop', { offset: '1' })];
      g.append(...this.stops); this.grad = g;
      this.specGrad = el('radialGradient', { id: id + 's', gradientUnits: 'userSpaceOnUse' });
      this.specGrad.append(el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.5' }), el('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0' }));
      this.rimGrad = el('radialGradient', { id: id + 'r', gradientUnits: 'userSpaceOnUse' });
      this.rimGrad.append(el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0' }), el('stop', { offset: '0.62', 'stop-color': '#fff', 'stop-opacity': '0' }), el('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0.3' }));
      defs.append(this.specGrad, this.rimGrad); this.specId = id + 's'; this.rimId = id + 'r';
      this.blur = el('feGaussianBlur', { stdDeviation: 7, result: 'b' });
      const goo = el('filter', { id: id + 'f', x: '-20%', y: '-20%', width: '140%', height: '140%' });
      goo.append(this.blur, el('feColorMatrix', { in: 'b', type: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11' }));
      const mask = el('mask', { id: id + 'c' });
      this.clipCircle = el('path', { fill: '#fff' });
      this.maskGoo = el('g', { fill: '#fff', filter: `url(#${id}f)` });
      mask.append(this.clipCircle, this.maskGoo);
      defs.append(g, goo, mask); s.append(defs);
      this.gooId = id + 'f';

      this.root = el('g', {});                  // breathing
      this.body = el('g', {});                  // lean
      this.sphere = el('path', {});
      this.goo = el('g', { filter: `url(#${id}f)` });
      this.gradId = id + 'g';
      this.face = el('g', { mask: `url(#${id}c)` });
      this.wire = el('path', { fill: 'none', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 0.6 });
      this.eyeL = el('rect', {});
      this.eyeR = el('rect', {});
      this.rimEl = el('rect', { x: -40, y: -40, width: 280, height: 280, fill: `url(#${id}r)` });
      this.spec = el('ellipse', { fill: `url(#${id}s)` });
      this.over = el('g', {});
      this.face.append(this.rimEl, this.spec, this.wire, this.eyeL, this.eyeR, this.over);
      this.body.append(this.sphere, this.goo, this.face);
      this.root.append(this.body); s.append(this.root);
    }

    // rotate a unit vector: yaw about Y (right +), then pitch about X (up +)
    _rot(v) {
      const y = this.yaw * D2R, p = this.pitch * D2R;
      const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
      const x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy;
      return [x, v[1] * cp + z * sp, -v[1] * sp + z * cp];
    }

    // tangent-plane frame of a point on the sphere, projected orthographically
    _frame(lonDeg, latDeg) {
      const R = this.o.radius, su = this._surf, lon = lonDeg * D2R, lat = latDeg * D2R;
      const P = this._rot([Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)]);
      const E = this._rot([Math.cos(lon), 0, -Math.sin(lon)]);                                  // east
      const N = this._rot([-Math.sin(lon) * Math.sin(lat), Math.cos(lat), -Math.cos(lon) * Math.sin(lat)]); // north
      // the eye surface is a spheroid: radii rx (x, z) and ry (y), centre offset (cx, cy); the eye disc keeps its size
      const avg = (su.rx + su.ry) / 2, kx = su.rx / avg, ky = su.ry / avg;
      return { m: [E[0] * kx, -E[1] * ky, -N[0] * kx, N[1] * ky, 100 + R * (su.cx + su.rx * P[0]), 100 + R * (su.cy - su.ry * P[1])], z: P[2] };
    }

    _eye(rect, side) {
      const o = this.o, A = this._A; let lon = side * o.eyeLon, lat = o.eyeLat;
      let f = this._frame(lon, lat);
      if (A && (A.eyeOrbit || A.eyeMerge)) {                                                   // spinner / merge: a perfect screen-space circle around the midpoint, eyes stay round
        const fl = this._frame(-o.eyeLon, o.eyeLat), fr = this._frame(o.eyeLon, o.eyeLat);
        const cx = (fl.m[4] + fr.m[4]) / 2, cy = (fl.m[5] + fr.m[5]) / 2, d = Math.hypot(fr.m[4] - fl.m[4], fr.m[5] - fl.m[5]) / 2 * (1 - (A.eyeMerge || 0));
        const th = (A.eyeOrbit || 0) * D2R + (side < 0 ? Math.PI : 0);
        f = { m: [1, 0, 0, 1, cx + d * Math.cos(th), cy + d * Math.sin(th)], z: 1 };
      }
      const w = o.eyeW, h = o.eyeH, rx = Math.min(w, h) / 2 * o.corner;
      const open = 1 - this.blinkAmt * 0.94;
      const sx = this.eyeScale * (A ? A.eyeScale : 1), sy = this.eyeScale * this.squash * open * (A ? A.eyeSquash : 1);
      const jx = A && A.eyeShake ? (Math.random() * 2 - 1) * A.eyeShake : 0, jy = A && A.eyeShake ? (Math.random() * 2 - 1) * A.eyeShake : 0;
      rect.setAttribute('x', -w / 2); rect.setAttribute('y', -h / 2);
      rect.setAttribute('width', w); rect.setAttribute('height', h); rect.setAttribute('rx', rx);
      rect.setAttribute('transform', `translate(${jx.toFixed(2)} ${jy.toFixed(2)}) matrix(${f.m.map(n => n.toFixed(4)).join(' ')}) translate(0 ${(this.blinkAmt * h * 0.08).toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`);
      rect.style.visibility = f.z > -0.05 ? 'visible' : 'hidden';
      return f.z;
    }

    _wireframe() {
      if (!this.o.wireframe) { this.wire.setAttribute('d', ''); return; }
      let d = '';
      const line = pts => { let pen = false; for (const [lon, lat] of pts) { const f = this._frame(lon, lat); if (f.z > 0.01) { d += (pen ? 'L' : 'M') + f.m[4].toFixed(1) + ' ' + f.m[5].toFixed(1); pen = true; } else pen = false; } };
      for (let lon = 0; lon < 180; lon += 30) { const p = []; for (let lat = -90; lat <= 90; lat += 5) p.push([lon, lat]); line(p); }
      for (let lat = -60; lat <= 60; lat += 30) { const p = []; for (let lon = -180; lon <= 180; lon += 5) p.push([lon, lat]); line(p); }
      this.wire.setAttribute('d', d);
    }

    render() {
      const o = this.o;
      if (o.eye && EYES[o.eye]) Object.assign(o, EYES[o.eye]);
      const style = o.shaded === false ? 'flat' : (o.shade || 'soft');
      const shadeKey = o.color + '|' + style + '|' + o.light + '|' + o.contrast + '|' + o.radius;
      if (this._shadeKey !== shadeKey) {
        this._shadeKey = shadeKey; const c = hex2(o.color), W = [255, 255, 255], K = [0, 0, 0], k = o.contrast == null ? 1 : o.contrast, lum0 = lum(c);
        const a = (o.light == null ? -135 : o.light) * D2R, dx = Math.cos(a), dy = Math.sin(a), R = o.radius;
        const glossy = style === 'glossy';
        this.stops[0].setAttribute('stop-color', mix(c, W, (glossy ? 0.34 : 0.24) * k)); this.stops[1].setAttribute('stop-color', mix(c, K, 0.08 * k)); this.stops[2].setAttribute('stop-color', mix(c, K, (glossy ? 0.55 : 0.45) * k));
        this.grad.setAttribute('cx', (100 + dx * 0.45 * R).toFixed(1)); this.grad.setAttribute('cy', (100 + dy * 0.45 * R).toFixed(1)); this.grad.setAttribute('r', (1.7 * R).toFixed(1));
        // specular: a soft highlight toward the light (glossy only), fainter on light bodies
        this.spec.style.display = glossy ? '' : 'none';
        if (glossy) { const sx = 100 + dx * 0.5 * R, sy = 100 + dy * 0.5 * R; this.spec.setAttribute('cx', sx.toFixed(1)); this.spec.setAttribute('cy', sy.toFixed(1)); this.spec.setAttribute('rx', (0.34 * R).toFixed(1)); this.spec.setAttribute('ry', (0.22 * R).toFixed(1)); this.spec.setAttribute('transform', `rotate(${(a / D2R + 90).toFixed(1)} ${sx.toFixed(1)} ${sy.toFixed(1)})`); this.specGrad.setAttribute('cx', sx.toFixed(1)); this.specGrad.setAttribute('cy', sy.toFixed(1)); this.specGrad.setAttribute('r', (0.34 * R).toFixed(1)); this.spec.setAttribute('opacity', (lum0 > 0.5 ? 0.35 : 0.7) * k); }
        // rim: a light edge on the side away from the light (rim only)
        this.rimEl.style.display = style === 'rim' ? '' : 'none';
        if (style === 'rim') { this.rimGrad.setAttribute('cx', (100 - dx * 0.35 * R).toFixed(1)); this.rimGrad.setAttribute('cy', (100 - dy * 0.35 * R).toFixed(1)); this.rimGrad.setAttribute('r', (1.25 * R).toFixed(1)); this.rimEl.setAttribute('opacity', (lum0 > 0.5 ? 0.5 : 1) * k); }
      }
      const flat = style === 'flat';
      this.sphere.setAttribute('fill', flat ? o.color : `url(#${this.gradId})`);
      const eyeFill = o.eyeColor || (lum(hex2(o.color)) > 0.55 ? '#141416' : '#ffffff');
      const comp = Array.isArray(o.body) ? { c: o.body, sphereR: 0.85, main: 0, head: 0.35, k: 50, d: 13 } : (o.body && o.body.c) ? o.body : COMPOSED[o.body];
      this._comp = comp;
      if (comp) {
        this.sR = o.radius * comp.sphereR; this._surf = Object.assign({ cx: 0, cy: 0, rx: comp.sphereR, ry: comp.sphereR }, comp.surf || {});
        this.sphere.setAttribute('d', ''); this.clipCircle.setAttribute('d', '');
        const head = comp.head == null ? 0.35 : comp.head;
        if (!this._running) { this._hy = this._sy = this.yaw * head; this._hp = this._sp = this.pitch * head; }       // static render: head already turned
        let cs = comp.anim ? comp.anim(comp.c, { t: this._t, dt: this._dt, vel: this._vel, poke: this._pokeS, twitch: this._twitch, mem: this._mem, hy: this._hy, hp: this._hp }) : comp.c;
        if (this._A && this._A.pieces) cs = this._A.pieces(cs);
        if (this._A && this._A.floor) cs = squashFloor(cs, this._A.floor);
        const main = comp.main == null ? 0 : comp.main;
        const lagCtx = { pitch: this.pitch, yaw: this.yaw, pitchT: this.tPitch, yawT: this.tYaw };
        if (!this._lagS || this._lagS.length !== cs.length) this._lagS = cs.map(() => 0);
        const kl = this._running ? 1 - Math.exp(-this._dt / 0.25) : 1;                    // lag weight eases over ~250 ms, never switches
        cs = cs.map((c, i) => {
          if (main === -1 || i === main) return c;
          const target = comp.lag ? comp.lag(i, lagCtx) : 0;
          const l = (this._lagS[i] += (target - this._lagS[i]) * kl);
          return headProject(c, this._hy + (this._sy - this._hy) * l, this._hp + (this._sp - this._hp) * l);
        });
        const sig = cs.map(c => c.length > 3 ? 'e' : 'c').join('');
        if (this._sig !== sig) {
          this._sig = sig; this.goo.innerHTML = ''; this.maskGoo.innerHTML = '';
          for (const t of sig) { const n = t === 'e' ? 'ellipse' : 'circle'; this.goo.append(el(n, {})); this.maskGoo.append(el(n, {})); }
        }
        cs.forEach((p, i) => {
          const cx = (100 + p[0] * o.radius).toFixed(2), cy = (100 + p[1] * o.radius).toFixed(2), rr = (p[2] * o.radius).toFixed(2);
          for (const c of [this.goo.children[i], this.maskGoo.children[i]]) {
            c.setAttribute('cx', cx); c.setAttribute('cy', cy);
            if (p.length > 3) { c.setAttribute('rx', rr); c.setAttribute('ry', (p[3] * o.radius).toFixed(2)); c.setAttribute('transform', `rotate(${(p[4] || 0).toFixed(2)} ${cx} ${cy})`); }
            else c.setAttribute('r', rr);
          }
        });
        this.blur.setAttribute('stdDeviation', (1 + o.round * 13 * (this._A && this._A.roundMul != null ? this._A.roundMul : 1)).toFixed(1));
        for (const c of this.goo.children) c.setAttribute('fill', flat ? o.color : `url(#${this.gradId})`);
      } else {
        const shape = (SHAPES[o.body] || SHAPES.circle)(o.radius);
        this.sR = shape.sphereR; const sr = shape.sphereR / o.radius; this._surf = Object.assign({ cx: 0, cy: 0, rx: sr, ry: sr }, shape.surf || {}); this._sig = ''; this.goo.innerHTML = ''; this.maskGoo.innerHTML = '';
        this.sphere.setAttribute('d', shape.d); this.clipCircle.setAttribute('d', shape.d);
      }
      this.eyeL.setAttribute('fill', eyeFill); this.eyeR.setAttribute('fill', eyeFill);
      this._wireframe();
      { const ov = this._A && this._A.overlay; this.over.innerHTML = '';
        if (ov) for (const [x, y, r] of ov) this.over.append(el('circle', { cx: (100 + x * o.radius).toFixed(2), cy: (100 + y * o.radius).toFixed(2), r: (r * o.radius).toFixed(2), fill: flat ? o.color : `url(#${this.gradId})` })); }
      this.zL = this._eye(this.eyeL, -1);
      this.zR = this._eye(this.eyeR, 1);
      const lx = o.lean ? (this.yaw / o.maxYaw) * 3 : 0, ly = o.lean ? (-this.pitch / o.maxPitch) * 2 : 0, A = this._A;
      let tf = `translate(${(lx + (A ? A.dx : 0)).toFixed(2)} ${(ly + (A ? A.dy : 0)).toFixed(2)})`;
      if (A && (A.rot || A.sx !== 1 || A.sy !== 1)) { const py = 100 + o.radius * (A.pivotY == null ? 1 : A.pivotY); tf += ` translate(100 ${py.toFixed(2)}) rotate(${A.rot.toFixed(2)}) scale(${A.sx.toFixed(3)} ${A.sy.toFixed(3)}) translate(-100 ${(-py).toFixed(2)})`; }
      this.body.setAttribute('transform', tf);
    }

    /* ---------- convenience ---------- */
    look(yaw, pitch) { const o = this.o; this.tYaw = Math.max(-o.maxYaw, Math.min(o.maxYaw, yaw)); this.tPitch = Math.max(-o.maxPitch, Math.min(o.maxPitch, pitch)); }
    snap(yaw, pitch) { this.look(yaw, pitch); this.yaw = this.tYaw; this.pitch = this.tPitch; }
    set(v) { if (v.eyeScale != null) this.tEyeScale = v.eyeScale; if (v.squash != null) this.tSquash = v.squash; if (v.blink != null) this.blinkAmt = v.blink; }
    setNow(v) { this.set(v); this.eyeScale = this.tEyeScale; this.squash = this.tSquash; }

    blink(times = 1) {
      if (this._blinking) return; this._blinking = true;
      const close = 90, hold = 40, open = 150, gap = 110, t0 = performance.now();
      const easeIn = t => t * t, easeOut = t => 1 - (1 - t) * (1 - t);
      const one = close + hold + open, total = one * times + gap * (times - 1);
      const step = now => {
        let t = now - t0;
        if (t >= total) { this.blinkAmt = 0; this._blinking = false; if (!this._running) this.render(); return; }
        const cycle = t % (one + gap);
        let a = 0;
        if (cycle < close) a = easeIn(cycle / close);
        else if (cycle < close + hold) a = 1;
        else if (cycle < one) a = 1 - easeOut((cycle - close - hold) / open);
        this.blinkAmt = a; if (!this._running) this.render();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    // run a scripted act (see ACTS); returns its duration in ms, 0 if the body has no such act
    play(name) {
      const comp = this._comp, act = comp && comp.acts && comp.acts[name]; if (!act) return 0;
      this._act = { def: act, t0: performance.now() }; this.manual = true; this.look(0, 0);
      return act.dur * 1000;
    }
    stopAct() { this._act = null; this._A = null; }
    // run an ad-hoc act definition {dur, run} on any body
    act(def) { this._act = { def, t0: performance.now() }; this.manual = true; this.look(0, 0); return def.dur * 1000; }
    // thinking: the two eyes orbit their midpoint like a spinner, three turns, easing in and out
    think() { return this.act({ dur: 3.2, run: (t, A) => { const u = seg(t, 0, 2.9); A.eyeOrbit = 1080 * E.io(u); A.eyeScale = 1 - 0.15 * S(Math.PI * u); } }); }
    twitch(i = 1) { this._twitch = { i, t0: performance.now(), p: 0 }; }   // one ear wiggle on a body whose anim uses it (bear)
    poke() { this._poke = 1; this.set({ eyeScale: 1.22, squash: 1.1 }); clearTimeout(this._pokeT); this._pokeT = setTimeout(() => { this.set({ eyeScale: 1, squash: 1 }); this.blink(1); }, 420); }

    start() {
      if (this._running) return; this._running = true;
      this._last = performance.now(); this._nextIdle = this._last + 1500; this._nextBlink = this._last + 2200;
      const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._reduce = reduce;
      this._onMove = e => { this._ptr = [e.clientX, e.clientY]; this._ptrT = performance.now(); };
      this._onLeave = () => { this._ptr = null; };
      global.addEventListener('pointermove', this._onMove);
      document.addEventListener('pointerleave', this._onLeave);
      this.svg.addEventListener('pointerdown', () => this.poke());
      const loop = now => {
        if (!this._running) return;
        const dt = Math.min(64, now - this._last); this._last = now; const o = this.o;
        // targets
        if (!this.manual) {
          const followed = o.follow && this._ptr && now - this._ptrT < 4000;
          if (followed) {
            const r = this.svg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const dx = this._ptr[0] - cx, dy = this._ptr[1] - cy, k = Math.max(120, r.width * 0.9);
            this.look(o.maxYaw * (2 / Math.PI) * Math.atan(dx / k), -o.maxPitch * (2 / Math.PI) * Math.atan(dy / k));
            this._nextIdle = now + 1200;
          } else if (o.idle && now > this._nextIdle && !reduce) {
            const home = Math.random() < 0.35;
            const ny = home ? 0 : (Math.random() * 2 - 1) * 22, np = home ? 0 : (Math.random() * 2 - 1) * 11;
            if (Math.abs(ny - this.tYaw) > 28 && Math.random() < 0.5) this.blink();
            this.look(ny, np); this._nextIdle = now + 1200 + Math.random() * 2600;
          }
        }
        if (o.autoBlink && now > this._nextBlink && !reduce && !this._act) { this.blink(Math.random() < 0.2 ? 2 : 1); this._nextBlink = now + 2000 + Math.random() * 4000; }   // no blinking during a scripted act
        // smoothing (fast saccade, exponential ease-out)
        const k = reduce ? 1 : 1 - Math.exp(-dt / 70), k2 = reduce ? 1 : 1 - Math.exp(-dt / 90);
        const prevYaw = this.yaw;
        this.yaw += (this.tYaw - this.yaw) * k; this.pitch += (this.tPitch - this.pitch) * k;
        // scripted act
        if (this._act) {
          const t = (now - this._act.t0) / 1000;
          if (t >= this._act.def.dur) { this._act = null; this._A = null; }
          else { const A = { rot: 0, dx: 0, dy: 0, sx: 1, sy: 1, pivotY: 1, pieces: null, floor: 0, roundMul: 1, eyeScale: 1, eyeSquash: 1, eyeShake: 0, eyeOrbit: 0, eyeMerge: 0, overlay: null, look: null }; this._act.def.run(t, A, { R: o.radius, comp: this._comp, self: this }); if (A.look) this.look(A.look[0], A.look[1]); this._A = A; }
        }
        // signals for the extra pieces
        this._t = now / 1000; this._dt = dt / 1000;
        const instVel = (this.yaw - prevYaw) / (dt / 1000); this._vel += (instVel - this._vel) * (1 - Math.exp(-dt / 120));
        { const c = this._comp, head = c && c.head != null ? c.head : 0.35, k = c && c.k || 50, d = c && c.d || 13, h = Math.min(dt, 40) / 1000;
          const ty = this.yaw * head, tp = this.pitch * head;
          this._hvy += ((ty - this._hy) * k - this._hvy * d) * h; this._hy += this._hvy * h;
          this._hvp += ((tp - this._hp) * k - this._hvp * d) * h; this._hp += this._hvp * h;
          const ks = k * 0.3, ds = d * Math.sqrt(0.3);                                   // slower spring, same damping ratio
          this._svy += ((ty - this._sy) * ks - this._svy * ds) * h; this._sy += this._svy * h;
          this._svp += ((tp - this._sp) * ks - this._svp * ds) * h; this._sp += this._svp * h; }
        this._poke *= Math.exp(-dt / 420); if (this._poke < 0.002) this._poke = 0;
        this._pokeS += (this._poke - this._pokeS) * (1 - Math.exp(-dt / 90));   // eased-in poke signal for the body
        if (this._twitch) { this._twitch.p = (now - this._twitch.t0) / 520; if (this._twitch.p >= 1) this._twitch = null; }
        else if (o.twitch && !reduce && (!this._nextTwitch || now > this._nextTwitch)) { if (this._nextTwitch) this._twitch = { i: 1 + Math.floor(Math.random() * 2), t0: now, p: 0 }; this._nextTwitch = now + 2500 + Math.random() * 4000; }
        this.eyeScale += (this.tEyeScale - this.eyeScale) * k2; this.squash += (this.tSquash - this.squash) * k2;
        if (o.breathe && !reduce) { const s = 1 + 0.012 * Math.sin(now / 3200 * Math.PI * 2); this.root.setAttribute('transform', `translate(100 100) scale(${s.toFixed(4)}) translate(-100 -100)`); }
        else this.root.removeAttribute('transform');
        this.render();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    stop() { this._running = false; global.removeEventListener('pointermove', this._onMove); document.removeEventListener('pointerleave', this._onLeave); }
  }
  global.Mascot = Mascot; Mascot.SHAPES = Object.keys(SHAPES); Mascot.ACTS = ACTS; Mascot.SHADES = ['flat', 'soft', 'glossy', 'rim']; Mascot.COMPOSED = COMPOSED; Mascot.blob = blobBody; Mascot.BODIES = [...Object.keys(SHAPES), ...Object.keys(COMPOSED)]; Mascot.COLORS = { black: '#0a0a0a', blue: '#1E6DF6', olive: '#969640', cyan: '#00CCFF', orchid: '#CF72D9', lime: '#EEF679' };
  // the same six, adapted for a dark ground: black becomes an off-white body, the others are lifted a step
  Mascot.COLORS_DARK = { black: '#ECECEA', blue: '#5A92FF', olive: '#B4B45C', cyan: '#4DDCFF', orchid: '#DD93E4', lime: '#F1F78C' }; Mascot.EYES = Object.keys(EYES);
})(window);
