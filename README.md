# Orb Mascot

A web mascot: a black orb (or one of several bodies) with two eyes that live on a 3D sphere,
so they foreshorten and converge as it looks around. Blinks, follows the cursor, idles.

- `mascot.js` — standalone library, no dependencies. Exposes a global `Mascot`.
- `index.html` — workbench: live demo, tuning sliders, state sheet, body/colour/eye galleries.

## Use

```html
<svg id="bot" width="120" height="120"></svg>
<script src="mascot.js"></script>
<script>
  const bot = new Mascot(document.getElementById('bot'), { body: 'bear', color: '#1E6DF6', eye: 'round' });
  bot.start();               // smoothing, idle wander, blinking, cursor follow
  bot.look(30, -10);         // yaw, pitch in degrees
  bot.blink(2);
  bot.set({ eyeScale: 1.2, squash: 0.5 });
</script>
```

Bodies: `circle squircle egg blob` (single outlines) and `bear lemon ghost cloud drop stack seacow flower`
(unions of circles/ellipses, filleted by `round`). A body can also be an array of pieces:
`[x, y, r]` or `[x, y, rx, ry, angle]` in fractions of the radius, centre `0 0`, y down.

Open `index.html` from any static server to use the workbench.
