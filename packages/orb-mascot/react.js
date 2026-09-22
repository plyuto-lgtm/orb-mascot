/* Orb mascot for React. UMD: works with bundlers (require('orb-mascot/react')) and as a <script> after React and core.js (window.OrbReact). */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('react'), require('./core.js'));
  else global.OrbReact = factory(global.React, global.Mascot);
})(typeof window !== 'undefined' ? window : globalThis, function (React, Mascot) {
  const { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, createElement } = React;
  const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

  // props that are plain Mascot options: copied onto the instance whenever they change
  const OPTION_KEYS = ['color', 'shade', 'mouthStroke', 'maxYaw', 'maxPitch', 'follow', 'idle', 'autoBlink', 'lean', 'breathe', 'twitch', 'fit'];

  const pickOptions = props => { const o = {}; for (const k of OPTION_KEYS) if (props[k] !== undefined) o[k] = props[k]; return o; };

  const Orb = forwardRef(function Orb(props, ref) {
    const { body = 'circle', size = 240, active = true, yaw, pitch, onReady, className, style, title, ...rest } = props;
    const svgRef = useRef(null), inst = useRef(null);
    const optsRef = useRef(pickOptions(props)); optsRef.current = pickOptions(props);

    // create (and recreate when the body changes); the animation loop runs while `active`
    useIso(() => {
      const m = new Mascot(svgRef.current, Object.assign({ body }, optsRef.current));
      inst.current = m;
      if (yaw != null || pitch != null) m.snap(yaw || 0, pitch || 0);
      if (active) m.start();
      if (onReady) onReady(m);
      return () => { m.stop(); inst.current = null; };
    }, [JSON.stringify(body)]);

    // option changes: assign onto the live instance and redraw
    useEffect(() => { const m = inst.current; if (!m) return; Object.assign(m.o, optsRef.current); m.render(); });

    // loop on / off
    useEffect(() => { const m = inst.current; if (!m) return; if (active) m.start(); else m.stop(); }, [active]);

    // controlled gaze: when yaw / pitch are given the orb aims there (cursor follow and idle should then be off)
    useEffect(() => { const m = inst.current; if (m && (yaw != null || pitch != null)) { m.manual = true; m.look(yaw || 0, pitch || 0); } }, [yaw, pitch]);

    useImperativeHandle(ref, () => ({
      get mascot() { return inst.current; },
      look: (y, p) => inst.current && inst.current.look(y, p),
      snap: (y, p) => inst.current && inst.current.snap(y, p),
      set: v => inst.current && inst.current.set(v),
      blink: n => inst.current && inst.current.blink(n),
      poke: () => inst.current && inst.current.poke(),
      run: id => inst.current ? inst.current.run(id) : Object.assign(Promise.resolve(), { dur: 0 }),
      scenarios: () => inst.current ? inst.current.scenarios() : [],
      play: name => inst.current ? inst.current.play(name) : 0,
      acts: () => inst.current ? inst.current.acts() : [],
      think: () => inst.current ? inst.current.think() : 0,
      surprise: () => inst.current ? inst.current.surprise() : 0,
      stopAct: () => inst.current && inst.current.stopAct(),
      toSVG: o => inst.current ? inst.current.toSVG(o) : '',
    }), []);

    const px = typeof size === 'number' ? size + 'px' : (Mascot.SIZES && Mascot.SIZES[size] != null) ? Mascot.SIZES[size] + 'px' : size;   // token, number or CSS length
    const domProps = {};
    for (const k in rest) if (!OPTION_KEYS.includes(k)) domProps[k] = rest[k];
    return createElement('svg', Object.assign({ ref: svgRef, className, role: 'img', 'aria-label': title || 'Mascot', style: Object.assign({ width: px, height: px, display: 'block' }, style) }, domProps));
  });

  return { Orb, Mascot, SIZES: Mascot.SIZES, SCENARIOS: Mascot.SCENARIOS };
});
