import * as React from 'react';
import Mascot, { MascotOptions, LiveValues, BodyName, BodyPiece } from './core';

export interface OrbHandle {
  /** The underlying Mascot instance (null before mount). */
  readonly mascot: Mascot | null;
  look(yaw: number, pitch: number): void;
  snap(yaw: number, pitch: number): void;
  set(v: LiveValues): void;
  blink(times?: number): void;
  poke(): void;
  /** One of the body's acts by position: 'custom1', 'custom2', ... (the body's own key works as an alias). Returns duration in ms, 0 if none. */
  play(name: string): number;
  /** The current body's acts, with ids for play(). */
  acts(): { id: string; key: string; label: string; hint: string; dur: number }[];
  think(): number;
  surprise(): number;
  stopAct(): void;
  toSVG(opts?: { size?: number; id?: string }): string;
}

export interface OrbProps extends Omit<MascotOptions, 'body'>, Omit<React.SVGAttributes<SVGSVGElement>, keyof MascotOptions | 'ref'> {
  /** Body name or custom pieces. Changing it recreates the mascot. Default 'circle'. */
  body?: BodyName | BodyPiece[];
  /** Rendered size: number (px) or any CSS length. Default 240. */
  size?: number | string;
  /** Run the animation loop (smoothing, idle, blinking, cursor follow). Default true. */
  active?: boolean;
  /** Controlled gaze in degrees. When given, cursor follow and idle are overridden. */
  yaw?: number; pitch?: number;
  /** Called once with the instance after mount. */
  onReady?: (mascot: Mascot) => void;
  /** Accessible label. Default 'Mascot'. */
  title?: string;
}

export const Orb: React.ForwardRefExoticComponent<OrbProps & React.RefAttributes<OrbHandle>>;
export { Mascot };
