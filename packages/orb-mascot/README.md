# orb-mascot

The Orb mascot as a dependency: a vanilla core (`orb-mascot`) and a React component (`orb-mascot/react`).
No build step, no runtime dependencies. React is an optional peer.

## Install

Until it is on npm, install straight from the repository folder:

```bash
npm install github:plyuto-lgtm/orb-mascot#main --workspace packages/orb-mascot
```

or copy `packages/orb-mascot` into your project and `npm install ./packages/orb-mascot`.

## React

```tsx
import { useRef } from 'react';
import { Orb, type OrbHandle } from 'orb-mascot/react';

export function Assistant({ thinking }: { thinking: boolean }) {
  const orb = useRef<OrbHandle>(null);
  return (
    <Orb
      ref={orb}
      body="bear"
      color="#1E6DF6"
      shade="gradient"
      size={160}
      mouthCurve={thinking ? 0.1 : 0.4}
      onReady={m => m.blink(2)}
      onClick={() => orb.current?.surprise()}
    />
  );
}
```

Every option is a prop and updates live; changing `body` recreates the instance. The ref exposes the
imperative API for moments your state cannot express as a value:

| Ref method | What it does |
|---|---|
| `look(yaw, pitch)` / `snap(yaw, pitch)` | aim the eyes, smoothly or instantly |
| `blink(n)` | blink n times |
| `poke()` | the tap reaction |
| `play(name)` | a body's own act: `'twitch'`, `'newEars'` (bear), `'spin'` (flower), ... |
| `think()` / `surprise()` | the shared scenarios; both return their duration in ms |
| `set({ eyeScale, squash, mouth, mouthSide, mouthLen, mouthTilt })` | animate the face directly |
| `stopAct()` | fade the running act back to idle |
| `toSVG({ size })` | a standalone SVG string with the outline baked to a plain path |
| `mascot` | the underlying core instance |

Props beyond the options:

| Prop | Default | Meaning |
|---|---|---|
| `size` | `240` | width and height, px or any CSS length |
| `active` | `true` | run the loop (smoothing, idle wander, blinking, cursor follow) |
| `yaw`, `pitch` | | controlled gaze in degrees; set `follow={false} idle={false}` alongside |
| `onReady` | | receives the instance after mount |
| `title` | `'Mascot'` | accessible label |

Any other prop (`className`, `style`, `onClick`, ...) goes to the `<svg>`.

### Driving it from app state

```tsx
const [mood, setMood] = useState<'idle' | 'busy' | 'happy'>('idle');
const orb = useRef<OrbHandle>(null);

useEffect(() => { if (mood === 'busy') orb.current?.think(); }, [mood]);

<Orb ref={orb} body="cloud" idle={mood === 'idle'} mouthCurve={mood === 'happy' ? 0.9 : 0.4} />
```

### Server rendering

The component renders an empty `<svg>` on the server and builds the mascot in a layout effect on the
client, so it is safe in Next.js and Remix without a dynamic import.

## Vanilla

```js
import Mascot from 'orb-mascot';           // or <script src="core.js"> for window.Mascot

const m = new Mascot(document.querySelector('svg'), { body: 'ghost', color: '#CF72D9' });
m.start();
m.look(20, -5);
```

`core.d.ts` documents every option. Six palette colours are on `Mascot.COLORS` and, for dark grounds,
`Mascot.COLORS_DARK`.

## Keeping the copy current

`core.js` is a copy of the repository's `mascot.js`. After editing the root file run `npm run sync` here.
