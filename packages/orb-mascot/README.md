# orb-mascot

The Orb mascot as a dependency: a framework-free core (`orb-mascot`) and a React component
(`orb-mascot/react`). No build step, no runtime dependencies. React is an optional peer.

Live catalog with every body, scenario and parameter: open `index.html` at the repository root.

## Install

```bash
npm install ./packages/orb-mascot          # from a checkout of the repository
npm install github:plyuto-lgtm/orb-mascot  # straight from GitHub (root package points here)
```

## Quick start (React)

```tsx
import { useRef } from 'react';
import { Orb, type OrbHandle } from 'orb-mascot/react';

export function Assistant({ busy }: { busy: boolean }) {
  const orb = useRef<OrbHandle>(null);
  return (
    <Orb
      ref={orb}
      body="bear"
      color="#1E6DF6"
      shade="gradient"
      size="lg"
      mouthCurve={busy ? 0.1 : 0.4}
      onClick={() => orb.current?.run('surprise')}
    />
  );
}
```

Every option is a prop and updates the running mascot in place. Changing `body` recreates it.
Anything that is not an option (`className`, `style`, `onClick`, ...) goes to the `<svg>`.

## Sizes

`size` takes a token, a number in px, or any CSS length.

| Token | px | Use |
|---|---|---|
| `xs` | 16 | inline icon, the face barely reads |
| `sm` | 24 | inline icon |
| `md` | 32 | avatar, list item |
| `lg` | 48 | avatar, list item |
| `xl` | 64 | card |
| `2xl` | 96 | card, header |
| `3xl` | 128 | header |
| `hero` | 240 | hero, empty state |

The values are on `SIZES` (React entry) and `Mascot.SIZES` (core) if you need them in CSS or layout code.

## Scenarios

One call runs anything: `run(id)` returns a promise that resolves when the scenario ends, with
`.dur` set to its length in ms. Cursor follow and idle wander pause for the run and resume after.

| Id | Length | What happens |
|---|---|---|
| `turn` | 3.0 s | looks to the yaw limit left, then right, then centre |
| `nod` | 3.0 s | looks to the pitch limit up, then down, then centre |
| `quick` | 2.0 s | four fast alternating looks with a smirk toward each |
| `blink` | 0.8 s | double blink |
| `poke` | 0.9 s | eyes pop, then blink; also fires on tap |
| `idle` | 2.2 s | holds centre so the idle motion shows |
| `think` | 3.0 s | eyes orbit like a spinner, three turns, settle |
| `surprise` | 1.7 s | star eyes, small "oh", a start |
| `twitch` | 0.7 s | one ear wiggle (bear) |
| `custom1`, `custom2` | varies | the body's own acts, by position |

Body-specific acts are addressed by position so app code never depends on a body's names:

| Body | custom1 | custom2 |
|---|---|---|
| bear | New ears | |
| lemon | Bell | Propeller |
| ghost | Tuck in | Piano |
| cloud | Quarter turns | Hop |
| drop | Hop | New sprout |
| stack | Deflate | Stretch |
| seacow | Wave | Cover eyes |
| flower | Spin | Inflate |

`scenarios()` returns everything the current body can run as `{ id, label, hint, dur }`, so a menu
or a test harness can be built without hard-coding ids:

```tsx
const [list, setList] = useState([]);
<Orb ref={orb} body="lemon" onReady={m => setList(m.scenarios())} />
{list.map(s => <button key={s.id} title={s.hint} onClick={() => orb.current.run(s.id)}>{s.label}</button>)}
```

Chaining is just `await`:

```ts
await orb.current.run('think');
await orb.current.run('surprise');
```

## Driving it from app state

```tsx
const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
const orb = useRef<OrbHandle>(null);

useEffect(() => {
  if (state === 'loading') orb.current?.run('think');
  if (state === 'done') orb.current?.run('surprise');
  if (state === 'error') orb.current?.set({ mouth: -0.6 });     // a frown until the next state
  if (state === 'idle') orb.current?.set({ mouth: null });      // back to mouthCurve
}, [state]);

<Orb ref={orb} body="cloud" idle={state === 'idle'} follow={state !== 'loading'} />
```

For a fixed gaze (a mascot looking at a form field, say) pass `yaw` and `pitch` and turn the
automatic motion off: `<Orb yaw={12} pitch={-4} follow={false} idle={false} />`.

## Props

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `body` | name or pieces | `'circle'` | `bear lemon ghost cloud drop stack seacow flower`, or an array of `[x, y, r]` / `[x, y, rx, ry, angle]` pieces in fractions of the radius |
| `color` | hex or `[hex, hex]` | `'#0a0a0a'` | any colour; two colours make a gradient |
| `gradientAngle` | degrees | `45` | 0 left to right, 90 top to bottom |
| `shade` | `'flat'` `'gradient'` | `'flat'` | light and shadow that follow the gaze, derived from the colour |
| `round` | 0..1 | `0.5` | fillet where pieces meet |
| `eye` | `'round'` `'pill'` `'square'` `'wide'` `'tall'` | round | eye preset |
| `eyeColor` | hex | auto | white on dark bodies, ink on light ones |
| `mouth` | boolean | `true` | draw the mouth |
| `mouthCurve` | -1..1 | `0.4` | frown to smile |
| `mouthStroke` | number | `6` | stroke width, about 1px each at 240px |
| `mouthWidth` | number | `1` | relative mouth length |
| `maxYaw`, `maxPitch` | degrees | `20`, `15` | gaze limits |
| `follow` | boolean | `true` | eyes follow the cursor |
| `idle` | boolean | `true` | idle wander |
| `autoBlink` | boolean | `true` | blinks on its own |
| `lean` | boolean | `true` | body leans with the gaze |
| `breathe` | boolean | `true` | slow breathing |
| `twitch` | boolean | `false` | bear: occasional ear wiggle |
| `size` | token, number, CSS length | `240` | see Sizes |
| `active` | boolean | `true` | run the loop; `false` freezes the frame |
| `yaw`, `pitch` | degrees | | controlled gaze |
| `onReady` | `(mascot) => void` | | receives the instance after mount |
| `title` | string | `'Mascot'` | accessible label |

## Ref methods

| Method | Returns | Meaning |
|---|---|---|
| `run(id)` | promise with `.dur` | any scenario, see above |
| `scenarios()` | list | what this body can run |
| `look(yaw, pitch)` | | aim, smoothed and clamped |
| `snap(yaw, pitch)` | | aim instantly |
| `set({ eyeScale, squash, mouth, mouthSide, mouthLen, mouthTilt })` | | animate the face directly; `mouth: null` returns to `mouthCurve` |
| `blink(n)` | | blink n times |
| `poke()` | | the tap reaction |
| `play(id)` / `acts()` | ms / list | body acts only; `run` covers them too |
| `think()` / `surprise()` | ms | the shared acts; `run` covers them too |
| `stopAct()` | | fade a running act back to idle |
| `toSVG({ size, id })` | string | standalone SVG, outline baked to a plain path, for Figma or Illustrator |
| `mascot` | instance | the core object |

## Colour

`color` is any hex value, or a pair of hex values for a gradient across the body with
`gradientAngle`. Eye contrast and the `shade="gradient"` light and shadow are derived from the
colour you pass, so any brand colour works without tuning. The catalog's six swatches are only
examples; they are on `Mascot.COLORS` and, for dark grounds, `Mascot.COLORS_DARK`.

## Server rendering

The component renders an empty `<svg>` on the server and builds the mascot in a layout effect on
the client, so it is safe in Next.js and Remix without a dynamic import.

## Without React

```js
import Mascot from 'orb-mascot';           // or <script src="core.js"> for window.Mascot

const m = new Mascot(document.querySelector('svg'), { body: 'ghost', color: '#CF72D9' });
m.start();
await m.run('think');
```

`core.d.ts` documents every option and method.

## Keeping the copy current

`core.js` is a copy of the repository's `mascot.js`. After editing the root file run `npm run sync`
here.
