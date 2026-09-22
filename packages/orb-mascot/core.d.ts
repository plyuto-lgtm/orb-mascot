/** A composed body: pieces are [x, y, r] circles or [x, y, rx, ry, angle] ellipses, in fractions of the radius, centre 0 0, y down. */
export type BodyPiece = [number, number, number] | [number, number, number, number, number];
export type BodyName = 'circle' | 'squircle' | 'egg' | 'pebble' | 'bear' | 'lemon' | 'ghost' | 'cloud' | 'drop' | 'stack' | 'seacow' | 'flower';
export type Shade = 'flat' | 'gradient' | 'soft' | 'glossy' | 'rim';
export type EyePreset = 'round' | 'pill' | 'square' | 'wide' | 'tall';

export interface MascotOptions {
  /** Built-in body name, or an array of pieces for a custom composed body. Default 'circle'. */
  body?: BodyName | BodyPiece[] | { c: BodyPiece[]; sphereR?: number; main?: number; head?: number; k?: number; d?: number };
  /** Body colour as hex, or two hex colours for a gradient mapped on the head sphere. Default '#0a0a0a'. */
  color?: string | [string, string];
  /** Gradient axis in degrees: 0 = left to right, 90 = top to bottom. Default 45. */
  gradientAngle?: number;
  /** 'gradient' adds the light/shadow shader that follows the gaze. Default 'flat'. */
  shade?: Shade;
  /** Fillet amount for composed bodies, 0..1. Default 0.5. */
  round?: number;
  /** Eye preset; overrides eyeW / eyeH / corner. */
  eye?: EyePreset | null;
  eyeW?: number; eyeH?: number; corner?: number; eyeLon?: number; eyeLat?: number;
  /** null = automatic (white on dark bodies, ink on light ones). */
  eyeColor?: string | null;
  mouth?: boolean;
  /** -1 frown .. 0 flat .. 1 smile. Default 0.4. */
  mouthCurve?: number;
  mouthWidth?: number;
  /** Stroke width in viewBox units, about 1px each at a 240px render. Default 6. */
  mouthStroke?: number;
  mouthDrop?: number;
  /** Gaze limits in degrees. Defaults 20 and 15. */
  maxYaw?: number; maxPitch?: number;
  follow?: boolean; idle?: boolean; autoBlink?: boolean; lean?: boolean; breathe?: boolean;
  wireframe?: boolean; twitch?: boolean; fit?: boolean;
  radius?: number; light?: number; contrast?: number; shaded?: boolean;
}

export interface LiveValues {
  eyeScale?: number; squash?: number; blink?: number;
  /** Mouth curve override; null returns to options.mouthCurve. */
  mouth?: number | null;
  mouthSide?: number; mouthLen?: number; mouthTilt?: number;
}

export interface ActFrame { [key: string]: unknown }
export interface ActDef { dur: number; run: (t: number, A: ActFrame, ctx: { R: number; comp: unknown; self: Mascot }) => void }

export default class Mascot {
  constructor(svg: SVGSVGElement, opts?: MascotOptions);
  /** Live options; assign and call render() (or let the loop pick them up). */
  o: Required<MascotOptions>;
  svg: SVGSVGElement;
  yaw: number; pitch: number;
  /** Suppresses cursor follow and idle wander while true. */
  manual: boolean;
  render(): void;
  /** Smoothly aim at yaw / pitch in degrees, clamped to maxYaw / maxPitch. */
  look(yaw: number, pitch: number): void;
  /** Aim without smoothing. */
  snap(yaw: number, pitch: number): void;
  set(v: LiveValues): void;
  setNow(v: LiveValues): void;
  blink(times?: number): void;
  poke(): void;
  /** Run a named act of the current body; returns its duration in ms, 0 if the body has none. */
  play(name: string): number;
  act(def: ActDef): number;
  think(): number;
  surprise(): number;
  twitch(i?: number): void;
  stopAct(): void;
  /** Start the animation loop: smoothing, idle wander, blinking, cursor follow. */
  start(): void;
  stop(): void;
  /** Standalone SVG string with the body outline baked to a plain path (no filters). */
  toSVG(opts?: { size?: number; id?: string }): string;

  static BODIES: string[];
  static SHAPES: string[];
  static COMPOSED: Record<string, { acts?: Record<string, ActDef> }>;
  static ACTS: Record<string, Record<string, ActDef>>;
  static SHADES: Shade[];
  static EYES: string[];
  static COLORS: Record<'black' | 'blue' | 'olive' | 'cyan' | 'orchid' | 'lime', string>;
  static COLORS_DARK: Record<'black' | 'blue' | 'olive' | 'cyan' | 'orchid' | 'lime', string>;
}
