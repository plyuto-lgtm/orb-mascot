# Orb mascots for Framer

Two self-contained code components: **BearOrb** (the bear alone) and **OrbSlider** (Bear, Lemon,
Cloud and Seacow in one slider). Neither imports the `orb-mascot` library.

# Orb Slider

`OrbSlider.tsx` shows one mascot at a time and morphs between them: the outline melts from one
shape into the next while the eyes blink through the middle of the change. All four share one body
colour and one face colour.

## Add it

In Framer open Assets, Code, create a code file named `OrbSlider`, paste the file, and drag it onto
the canvas or into a Frame. It sizes like BearOrb: any Frame shape, with Align and Safe area.

## Changing slide

- **Arrows** on both sides (Arrows) and **Pagination** at the bottom (Pagination: Dots, `1 / 4`, or
  None). They are independent; each reserves its own room so it never covers the mascot. Controls color
  styles both.
- **Swipe or drag** sideways anywhere on the component (Swipe). The sliding area is the whole
  component, larger than the orb. The orb moves like a rubber band: it follows the finger at first,
  slows steadily as it goes, and never passes **Swipe travel** (80 px by default), then springs back to
  its place as the next mascot morphs in. At 0 the
  orb stays still and the swipe only changes the mascot.
  A tap on the mascot is a poke; a tap elsewhere does nothing.
- **Arrow keys** when the slider has focus.
- **Autoplay** every few seconds, played as a swipe: the mascot is pushed aside to the Swipe travel
  limit, then released into the morph. It pauses while the pointer is over the slider and for 4 s after any manual change.
- **Your own buttons**: add `OrbSliderOverrides.tsx` as a code file and apply `NextOrb`, `PrevOrb`,
  `ShowBear`, `ShowLemon`, `ShowCloud` or `ShowSeacow` to any layer. Or dispatch the events yourself:
  `orbslider:next`, `orbslider:prev`, `orbslider:go` (detail: `"cloud"` or an index).
- **On change** appears under Interactions, so a slide change can drive other layers. The component
  also dispatches a bubbling `orbslider:change` event with `{ index, id }`.

## Controls

| Control | Default | Meaning |
|---|---|---|
| Start at | Bear | first slide |
| Body | `#1E6DF6` | one colour for every mascot |
| Face | `#FFFFFF` | one colour for the eyes and mouth of every mascot |
| Arrows | on | previous and next buttons at the sides |
| Pagination | Dots | Dots, `1 / 4`, or None |
| Controls color | `#141416` | arrows and pagination |
| Swipe, Swipe travel | on, 80 px | how far the orb slides while swiping or on autoplay |
| Autoplay, Next every | off, 5 s | |
| Animations, Every | Random, 7 s | Quick turns on every mascot, New ears too on the bear |
| Surprise on | empty | layer name or CSS selector whose hover plays Surprised (or apply `SurpriseOrbOnHover`) |
| Follow cursor, Idle wander, Blink, Breathe, Lean, Tap reaction | on | |
| Orb size, Size | Fill, 160 px | Fill: as large as the component allows. Fixed: a set pixel size, never larger than the space |
| Align, Safe area | Center, on | as in BearOrb |

## How it stays light

Each body is a smooth union of circles and ellipses written as a distance field on a 65 x 65 grid,
traced into one path each frame. That is what lets Cloud's crossed ellipses and the bear's ears share
one method, and what makes the morph trivial: the two fields are blended. The joins were fitted to the
catalog's outlines and match them to about 1.4% of body area. A frame costs about 0.2 ms of script;
the outline is only retraced when the pieces actually moved. No React renders per frame, no filters,
and the loop stops off screen, in hidden tabs, on the canvas and under reduced motion.

`slider-test.html` is the development harness.

# Lemon Orb

`LemonOrb.tsx` is the catalog's Lemon as its own component, the sibling of BearOrb, with the same
controls: Body and Face colours, Follow cursor, Idle wander, Blink, Breathe, Lean, Tap reaction,
Surprise on (hover a layer), Orb size, Align and Safe area. Add it the same way, as a code file named
`LemonOrb`.

Its random animations are the lemon's own, each with its own switch:

- **Bell**: swings from its top nub like an old alarm-clock bell, ringing down to rest (3.0 s).
- **Propeller**: the eyes bump, then the nubs orbit the core two full turns while the body shrinks with
  the speed of the spin (2.9 s).
- **Quick turns**: four fast alternating looks (2.0 s).

The outline uses the slider's distance-field method and matches the catalog lemon to about 1.4% of its
area. Its safe area is slightly larger than the bear's because Bell swings wide; every act was measured
inside it. Surprised can also be triggered with `window.dispatchEvent(new CustomEvent("lemonorb:surprise"))`.
`lemon-test.html` is the development harness.

# Bear Orb

`BearOrb.tsx` is the catalog's Bear as a single self-contained Framer code component. It does not
import the `orb-mascot` library; everything it needs is in the one file.

## Add it to a Framer project

1. In Framer open **Assets**, then **Code**, and create a new code file named `BearOrb`.
2. Replace the file's contents with `BearOrb.tsx` and save.
3. Drag **BearOrb** from the Assets panel onto the canvas, or into a Frame.

## Inside a Frame

The component fills its box and keeps the bear's proportions, so any Frame shape works.

- **Size.** Fixed, Fill and Relative sizing all work. If only the width is set (Fit or Auto height),
  the height follows as a square. New instances start at 240 x 240.
- **Align.** When the Frame is not square, the bear sits at the centre by default. Set **Align** to
  Top, Bottom, Left or Right to pin it to one side, for example Bottom in a tall card.
- **Safe area.** On by default. It leaves room for every pose: the ears lifting off in New ears,
  the start in Surprised, breathing, lean, and the full gaze range. I measured the extremes over all
  of them, so a Frame with **Clip Content** never cuts the bear. Turn it off to have the bear fill the
  Frame edge to edge (4% larger); then leave Clip Content off on the Frame, or the ears can be
  clipped during New ears.
- **Cursor follow** measures where the bear actually is on screen, so it aims correctly whatever
  the alignment or Frame shape.

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
| Orb size, Size | Fill, 160 px | Fill: the bear fills the component. Fixed: a set pixel size inside it, placed by Align |
| Align | Center | where the bear sits in a non-square Frame |
| Safe area | on | room for every pose, so a clipping Frame never cuts it |
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
