# Bear Orb for Framer

`BearOrb.tsx` is the catalog's Bear as a single self-contained Framer code component. It does not
import the `orb-mascot` library; everything it needs is in the one file.

## Add it to a Framer project

1. In Framer open **Assets**, then **Code**, and create a new code file named `BearOrb`.
2. Replace the file's contents with `BearOrb.tsx` and save.
3. Drag **BearOrb** from the Assets panel onto the canvas. Size it like any frame; it stays square
   inside whatever box you give it.

## What it does

The bear from the catalog with these fixed parameters: three pieces (head plus two ears), face on an
inner sphere of 0.88 R, ears following the gaze at 0.35 through a spring with k 60 and d 14, round
eyes, the resting smile. It follows the cursor, wanders when idle, blinks and breathes.

At random intervals it plays one of two moments:

- **New ears**: the ears pull up and off and fade, then fresh ones grow back out of the head (3.25 s).
- **Quick turns**: four fast alternating looks with a smirk toward each (2.0 s).

## Surprised on hover of a button

The bear can play **Surprised** (star eyes, a wider smile, a small start, 1.7 s) whenever the visitor
hovers a specific layer anywhere on the page.

**The simple way.** Select the bear and fill in **Surprise on** with the button's layer name exactly
as it appears in the Layers panel, for example `Button`. Framer writes layer names into the page as
`data-framer-name`, and the bear listens for the pointer entering any element with that name. If
several layers share the name, each of them triggers it. A value starting with `#`, `.` or `[` is
used as a CSS selector instead, for example `#cta` or `[href="/pricing"]`.

**The explicit way.** If the name is not picked up (a renamed variant, a nested component), add
`BearOrbOverrides.tsx` as a second code file and apply its `SurpriseBearOnHover` override to the
button. It fires a `bearorb:surprise` window event, which every bear on the page answers. You can
dispatch the same event from your own code:

```ts
window.dispatchEvent(new CustomEvent("bearorb:surprise"))
```

Behaviour worth knowing:

- It fires on entering the layer, not while moving inside it, and not again until the moment ends.
- It cuts into Quick turns and idle. During New ears it is ignored, so the ears never snap back.
- It does nothing while the bear is off screen.

## Property controls

| Control | Default | Meaning |
|---|---|---|
| Body | `#0A0A0A` | body colour |
| Face | `#FFFFFF` | eyes and mouth colour |
| Animations | Random | play the two moments at random, or never |
| New ears | on | include it in the random pick |
| Quick turns | on | include it in the random pick |
| Every | 7 s | average gap between moments; each gap varies from 0.6x to 1.4x |
| Surprise on | empty | layer name or CSS selector whose hover plays Surprised |
| Follow cursor | on | eyes track the pointer |
| Idle wander | on | glances around when the pointer is still |
| Blink | on | |
| Breathe | on | |
| Lean | on | the body shifts slightly with the gaze |
| Tap reaction | on | eyes pop on tap or click |

## Why it is light

- **One path, no filters.** The catalog merges the head and ears with an SVG blur filter. Here the
  outline is computed directly: arcs of the head and ears joined by concave fillet arcs. The result
  matches the blurred shape to within about 1% of the body area, including the frames where the ears
  detach. No filter means no per-frame re-rasterising and no blurry rendering in Safari.
- **Nine DOM nodes** against the library's sixty-two.
- **No React work per frame.** One `requestAnimationFrame` loop writes attributes through refs and
  skips any attribute whose value has not changed. A frame costs about 4 microseconds of script.
- **Stops when it cannot be seen.** The loop is cancelled, not idled, while the component is off
  screen or the tab is hidden, and never starts on the Framer canvas or under
  `prefers-reduced-motion`. In those cases it shows the resting pose, which is also what the server
  renders, so there is no flash before the script loads.
- **No layout thrash.** The pointer handler only stores coordinates; the component's position is
  re-measured at most every 300 ms and only while the pointer is moving.

## Changing it

The shape lives in the constants at the top of the file (`HEAD`, `EARS`, `SPHERE`, `HEAD_FOLLOW`,
`SPRING_K`, `SPRING_D`). `FILLET`, `EAR_TRIM` and `NECK` were fitted to the catalog's outline; change
them only if you change the pieces.

`test.html` is a development harness that compiles the component in the browser next to the catalog
bear. It is not needed in Framer.
