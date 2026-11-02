// Orb Slider: Bear, Lemon, Cloud and Seacow in one Framer code component, each with its own colour.
// Changing slide morphs the body from one shape into the next. One <path> for the body (traced each frame
// from a distance field: no SVG filters or masks), two eyes, a mouth, two hidden star shapes.
// A single requestAnimationFrame loop writes attributes through refs and stops off screen, in a hidden tab,
// on the Framer canvas and under prefers-reduced-motion.
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"

// ---------- shared constants ----------
const R = 96, CX = 100, CY = 100
const MAX_YAW = 20, MAX_PITCH = 15
const EYE_LON = 16, EYE_LAT = 4, EYE_R = 11
const MOUTH_DROP = 22, MOUTH_HW = 14, MOUTH_STROKE = 7.8, SMILE = 0.4
const AUTO_PUSH = 320                    // autoplay's synthetic swipe: how long the push lasts; it reaches the Swipe travel limit
const MORPH_MS = 720, FADE = 380, NEW_EARS = 3250, QUICK_TURNS = 2030, SURPRISE = 1700
const D2R = Math.PI / 180, TAU = Math.PI * 2, S = Math.sin
const r1 = (v: number) => Math.round(v * 10) / 10
const r3 = (v: number) => Math.round(v * 1000) / 1000
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
const pulse = (t: number, a: number, b: number) => Math.sin(Math.PI * seg(t, a, b))
const easeIn = (t: number) => t * t * t
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) }

// ---------- the four bodies (from the catalog) ----------
// pieces: [x, y, r] circles or [x, y, rx, ry, angleDeg] ellipses, in fractions of R, y down.
// main: the piece that stays put; the others ride the head sphere. head/k/d: how the head follows the gaze.
type Piece = number[]
type Def = {
    id: string; name: string; c: Piece[]; sphereR: number; surf: { cx?: number; cy?: number; rx?: number; ry?: number }
    main: number; head: number; k: number; d: number; fitTarget?: number
    anim: (c: Piece[], t: number, poke: number, hy: number, hp: number) => Piece[]
}
const DEFS: Def[] = [
    { id: "bear", name: "Bear", c: [[0, 0.05, 0.9], [-0.6, -0.62, 0.32], [0.6, -0.62, 0.32]], sphereR: 0.88, surf: { cy: 0.05 }, main: 0, head: 0.35, k: 60, d: 14,
      anim: (c, t, poke) => c.map((p, i) => (i === 0 ? p : [p[0], p[1] + poke * 0.02, p[2] * (1 - poke * 0.03)])) },
    { id: "lemon", name: "Lemon", c: [[0, 0, 0.84], [0, -0.72, 0.3], [0, 0.72, 0.3]], sphereR: 0.84, surf: { rx: 0.84, ry: 0.98 }, main: 0, head: 0.4, k: 50, d: 13,
      anim: (c, t, poke) => c.map((p, i) => (i === 0 ? p : [p[0] + S((t * TAU) / 3.1) * 0.012, p[1] + (i === 1 ? -1 : 1) * poke * 0.018, p[2]])) },
    { id: "cloud", name: "Cloud", c: [[0, 0, 0.94, 0.5, -45], [0, 0, 0.94, 0.5, 45]], sphereR: 0.86, surf: {}, fitTarget: 0.86, main: -1, head: 0.3, k: 40, d: 12,
      anim: (c, t, poke, hy, hp) => c.map((p, i) => { const b = S((t * TAU) / 2.8 + i * Math.PI) * 0.015, puff = poke * 0.03
          return [p[0], p[1], p[2] * (1 + b + puff), p[3] * (1 + puff - b), p[4] + hy * 0.35 + (i ? 1 : -1) * hp * 0.15] }) },
    { id: "seacow", name: "Seacow", c: [[0, -0.06, 0.86], [-0.62, 0.6, 0.32], [0.62, 0.6, 0.32]], sphereR: 0.86, surf: { cy: -0.06 }, main: 0, head: 0.35, k: 60, d: 14,
      anim: (c, t, poke) => c.map((p, i) => (i === 0 ? p : [p[0] + S((t * TAU) / 2.9 + i * 2) * 0.006, p[1] - poke * 0.02, p[2] * (1 - poke * 0.03)])) },
]
// how pieces melt together: join softness and edge offset, fitted per body to the catalog's blurred outline
const SHAPE: number[][] = [[0.12, 0], [0.09, 0], [0.15, -0.003], [0.15, 0]]   // matches the catalog to ~1.4% of body area
// every body is scaled to the same visual extent, as in the catalog
const extentOf = (cs: Piece[]) => Math.max(...cs.map(p => {
    if (p.length > 3) { const a = (p[4] || 0) * D2R, c = Math.cos(a), s = Math.sin(a); return Math.max(Math.abs(p[0]) + Math.hypot(p[2] * c, p[3] * s), Math.abs(p[1]) + Math.hypot(p[2] * s, p[3] * c)) }
    return Math.max(Math.abs(p[0]), Math.abs(p[1])) + p[2]
}))
const FIT = DEFS.map(D => (D.fitTarget || 0.95) / extentOf(D.c))
// the face rides this surface: [cx, cy, rx, ry]
const SURF = DEFS.map((D, b) => { const f = FIT[b], s = D.surf; return [(s.cx ?? 0) * f, (s.cy ?? 0) * f, (s.rx ?? D.sphereR) * f, (s.ry ?? D.sphereR) * f] })

// ---------- geometry ----------
const F = new Float64Array(7)
function frame(lonDeg: number, latDeg: number, yawDeg: number, pitchDeg: number, su: ArrayLike<number>) {
    const lon = lonDeg * D2R, lat = latDeg * D2R, y = yawDeg * D2R, p = pitchDeg * D2R
    const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p)
    const sl = Math.sin(lon), cl = Math.cos(lon), sa = Math.sin(lat), ca = Math.cos(lat)
    let vx = sl * ca, vy = sa, vz = cl * ca
    let x = vx * cy + vz * sy, z = -vx * sy + vz * cy
    const px = x, py = vy * cp + z * sp, pz = -vy * sp + z * cp
    vx = cl; vz = -sl
    x = vx * cy + vz * sy; z = -vx * sy + vz * cy
    const ex = x, ey = z * sp
    vx = -sl * sa; vy = ca; vz = -cl * sa
    x = vx * cy + vz * sy; z = -vx * sy + vz * cy
    const nx = x, ny = vy * cp + z * sp
    const avg = (su[2] + su[3]) / 2, kx = su[2] / avg, ky = su[3] / avg
    F[0] = ex * kx; F[1] = -ey * ky; F[2] = -nx * kx; F[3] = ny * ky
    F[4] = CX + R * (su[0] + su[2] * px); F[5] = CY + R * (su[1] - su[3] * py); F[6] = pz
    return F
}
function headProject(p: Piece, hy: number, hp: number): Piece {
    const x = p[0], y = p[1], z0 = Math.sqrt(Math.max(0.02, 1 - x * x - y * y)), a = hy * D2R, b = hp * D2R
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b)
    const vx = x * ca + z0 * sa, z1 = -x * sa + z0 * ca, vy = -y * cb + z1 * sb, vz = y * sb + z1 * cb
    const depth = (z: number) => (z >= 0 ? 0.85 + 0.15 * z : 0.85 * Math.max(0, 1 + z / 0.6))
    return [vx, -vy, p[2] * (depth(vz) / depth(z0))]
}

// ---------- the body outline: a smooth union of the pieces as a distance field, traced with marching squares ----------
const GN = 64, GL = 1.24, GS = (2 * GL) / GN, GP = GN + 1, NE = 2 * GN * GP
const G = new Float32Array(GP * GP)                              // field, negative inside
const NEXT = new Int32Array(NE).fill(-1), EX = new Float32Array(NE), EY = new Float32Array(NE), SEEN = new Uint8Array(NE), USED = new Int32Array(NE)
const PREP = new Float64Array(7 * 6), PX = new Float32Array(4096), PY = new Float32Array(4096)

function fillField(cs: Piece[], soft: number, grow: number, out: Float32Array) {
    let n = 0
    for (const p of cs) {
        const o = n++ * 7
        if (p.length > 3) { const a = (p[4] || 0) * D2R; PREP[o] = 1; PREP[o + 1] = p[0]; PREP[o + 2] = p[1]; PREP[o + 3] = p[2]; PREP[o + 4] = p[3]; PREP[o + 5] = Math.cos(a); PREP[o + 6] = Math.sin(a) }
        else { PREP[o] = 0; PREP[o + 1] = p[0]; PREP[o + 2] = p[1]; PREP[o + 3] = p[2] }
    }
    const ik = 1 / soft
    for (let j = 0, idx = 0; j < GP; j++) {
        const y = -GL + j * GS
        for (let i = 0; i < GP; i++, idx++) {
            const x = -GL + i * GS
            let d = 0
            for (let q = 0; q < n; q++) {
                const o = q * 7, dx = x - PREP[o + 1], dy = y - PREP[o + 2]
                let sd: number
                if (PREP[o] === 0) sd = Math.sqrt(dx * dx + dy * dy) - PREP[o + 3]
                else {
                    const c = PREP[o + 5], s = PREP[o + 6], lx = dx * c + dy * s, ly = -dx * s + dy * c, rx = PREP[o + 3], ry = PREP[o + 4]
                    const ux = lx / rx, uy = ly / ry, vx = lx / (rx * rx), vy = ly / (ry * ry), k0 = Math.sqrt(ux * ux + uy * uy), k1 = Math.sqrt(vx * vx + vy * vy)
                    sd = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry)
                }
                if (q === 0) d = sd
                else { const h = Math.max(soft - Math.abs(d - sd), 0) * ik; d = Math.min(d, sd) - h * h * soft * 0.25 }
            }
            out[idx] = d - grow
        }
    }
}
const edgeId = (k: number, i: number, j: number) => (k === 0 ? j * GN + i : k === 1 ? GN * GP + j * GP + i + 1 : k === 2 ? (j + 1) * GN + i : GN * GP + j * GP + i)
function edgePoint(id: number, k: number, i: number, j: number, f0: number, f1: number, f2: number, f3: number) {
    if (k === 0) { EX[id] = i + f0 / (f0 - f1); EY[id] = j }
    else if (k === 1) { EX[id] = i + 1; EY[id] = j + f1 / (f1 - f2) }
    else if (k === 2) { EX[id] = i + f3 / (f3 - f2); EY[id] = j + 1 }
    else { EX[id] = i; EY[id] = j + f0 / (f0 - f3) }
}
function contourPath(field: Float32Array) {
    let nu = 0
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
        const a = j * GP + i, f0 = field[a], f1 = field[a + 1], f2 = field[a + GP + 1], f3 = field[a + GP]
        const m = (f0 < 0 ? 1 : 0) | (f1 < 0 ? 2 : 0) | (f2 < 0 ? 4 : 0) | (f3 < 0 ? 8 : 0)
        if (m === 0 || m === 15) continue
        let entry = -1
        for (let e = 0; e < 8; e++) {
            const k0 = e % 4, k1 = (e + 1) % 4, in0 = (m >> k0) & 1, in1 = (m >> k1) & 1
            if (!in0 && in1) entry = k0
            else if (in0 && !in1 && entry >= 0) {
                const s0 = edgeId(entry, i, j), s1 = edgeId(k0, i, j)
                if (NEXT[s0] === -1) { NEXT[s0] = s1; edgePoint(s0, entry, i, j, f0, f1, f2, f3); edgePoint(s1, k0, i, j, f0, f1, f2, f3); USED[nu++] = s0 }
                entry = -1
            }
        }
    }
    let d = ""
    for (let u = 0; u < nu; u++) {
        let cur = USED[u]; if (SEEN[cur]) continue
        let n = 0
        while (cur !== -1 && !SEEN[cur]) {
            SEEN[cur] = 1
            const x = CX + R * (-GL + EX[cur] * GS), y = CY + R * (-GL + EY[cur] * GS)
            if (!n || Math.abs(x - PX[n - 1]) + Math.abs(y - PY[n - 1]) > 0.5) { PX[n] = x; PY[n] = y; n++ }
            cur = NEXT[cur]
        }
        if (n < 6) continue
        d += `M${r1((PX[n - 1] + PX[0]) / 2)} ${r1((PY[n - 1] + PY[0]) / 2)}`              // midpoint-quadratic spline: smooth, tight to the trace
        for (let k = 0; k < n; k++) { const q = k + 1 < n ? k + 1 : 0; d += `Q${r1(PX[k])} ${r1(PY[k])} ${r1((PX[k] + PX[q]) / 2)} ${r1((PY[k] + PY[q]) / 2)}` }
        d += "Z"
    }
    for (let u = 0; u < nu; u++) { NEXT[USED[u]] = -1; SEEN[USED[u]] = 0 }
    return d
}

// ---------- scripted moments ----------
// A: one frame of an act. rot/sx/sy pivot on (centre x, pivotY in R units, 1 = bottom); side/tilt shape the mouth;
// orbit swings the eyes (and mouth) around their midpoint; look holds the gaze; pieces edits the body before fitting;
// overlay draws circles in the body colour over the face (the seacow's flippers covering its eyes).
type Act = { eyeScale: number; eyeSquash: number; rot: number; pivotY: number; sx: number; sy: number; dy: number; star: number
    curve: number | null; len: number | null; side: number; tilt: number; orbit: number; look: number[] | null
    pieces: ((cs: Piece[]) => Piece[]) | null; overlay: number[][] | null; up: number; grow: number; phase: number }
const NO_ACT: Act = { eyeScale: 1, eyeSquash: 1, rot: 0, pivotY: 1, sx: 1, sy: 1, dy: 0, star: 0, curve: null, len: null, side: 0, tilt: 0, orbit: 0, look: null, pieces: null, overlay: null, up: 0, grow: 1, phase: 0 }
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const rotPiece = (p: Piece, deg: number): Piece => { const a = deg * D2R, c = Math.cos(a), sn = Math.sin(a), q = p.slice(); q[0] = p[0] * c - p[1] * sn; q[1] = p[0] * sn + p[1] * c; if (q.length > 3) q[4] = (p[4] || 0) + deg; return q }
function newEars(t: number, A: Act) {                                  // bear: the ears pull up and off, then grow back
    A.eyeScale = 1 + 0.2 * pulse(t, 0, 0.4); A.eyeSquash = 1 - 0.3 * pulse(t, 0.4, 1.4)
    if (t < 1.9) { A.phase = 1; A.up = easeIn(seg(t, 0.4, 1.4)); A.grow = 0; A.curve = 0.4 - 0.9 * pulse(t, 0.3, 1.5); A.len = 1 - 0.25 * pulse(t, 0.3, 1.5) }
    else { A.phase = 2; A.up = 0; A.grow = easeBack(seg(t, 1.9, 3.1)); const g = Math.min(1, A.grow); A.curve = 0.4 + 0.6 * g; A.len = 1 + 0.25 * g; A.sy = 1 - 0.04 * pulse(t, 1.9, 2.5) }
}
function surprised(t: number, A: Act) {                                // any body: star eyes, a wide smile, a small start
    const k = Math.min(easeBack(seg(t, 0, 0.28)), 1 - easeIO(seg(t, 1.2, 1.6))), p = pulse(t, 0, 0.35)
    A.star = clamp01(k); A.eyeScale = 1 + 0.2 * k; A.curve = 0.4 + 0.5 * k; A.len = 1 - 0.25 * k; A.dy = -5 * p; A.sy = 1 + 0.03 * p
}
// Lemon, Bell: swings from its top nub like an old alarm-clock bell, ringing down to rest
function bell(t: number, A: Act) {
    const e = Math.exp(-t / 1.1), lag = 0.05 * S((TAU * t) / 0.85 - 1.2) * e
    A.rot = 18 * S((TAU * t) / 0.85) * e; A.pivotY = -0.98
    A.pieces = cs => cs.map((p, i) => (i === 2 ? [p[0] + lag, p[1], p[2]] : p))
    A.curve = 0.5 + 0.4 * e; A.tilt = -0.35 * A.rot
}
// Lemon, Propeller: eyes bump, then the nubs orbit the core two full turns; the body shrinks with the speed of the spin
function propeller(t: number, A: Act) {
    const b = pulse(t, 0, 0.45); A.eyeScale = 1 + 0.3 * b; A.eyeSquash = 1 - 0.15 * b
    const u = seg(t, 0.45, 2.75), th = 720 * easeIO(u), speed = (u < 0.5 ? 12 * u * u : 12 * (1 - u) * (1 - u)) / 3
    A.pieces = cs => cs.map((p, i) => (i ? rotPiece(p, th) : p))
    A.sx = A.sy = 1 - 0.14 * speed; A.pivotY = 0; A.eyeSquash *= 1 - 0.4 * speed
    A.curve = t < 0.45 ? 0.2 : 0.05 + (1 - speed) * (u >= 1 ? 0.95 : 0.2); A.len = u >= 1 ? 1.2 : 1 - 0.35 * speed
}
// Cloud, Quarter turns: a full circle in four springy 90 degree steps; the eyes start to follow each turn and swing back
function quarterTurns(t: number, A: Act) {
    const step = 0.85, k = Math.min(3, Math.floor(t / step)), u = seg(t, k * step, k * step + 0.62), th = t >= 4 * step ? 360 : 90 * k + 90 * easeBack(u)
    A.pieces = cs => cs.map(p => (p.length > 3 ? [p[0], p[1], p[2], p[3], (p[4] || 0) + th] : p))
    A.dy = -3 * S(Math.PI * u); A.orbit = 14 * S(Math.PI * Math.min(1, u * 1.3))
    A.curve = t >= 4 * step ? 0.9 : 0.1; A.len = t >= 4 * step ? 1.2 : 0.75
}
// Cloud, Hop: two soft hops with a small squash on landing
function hop(t: number, A: Act) {
    const n = 2, P = 1.0, h = 20
    if (t >= n * P) return
    const u = (t % P) / P
    if (u < 0.2) { const c = easeIO(u / 0.2); A.sy = 1 - 0.06 * c; A.sx = 1 + 0.03 * c; A.curve = 0.2 + 0.3 * c; return }
    if (u < 0.66) { const f = (u - 0.2) / 0.46, c = 1 - easeOut(Math.min(1, f * 3)); A.dy = -h * S(Math.PI * f); A.sy = 1 - 0.06 * c; A.sx = 1 + 0.03 * c; A.curve = 0.5 + 0.5 * S(Math.PI * f); A.len = 1 + 0.25 * S(Math.PI * f); return }
    if (u < 0.82) { const c = S((Math.PI * (u - 0.66)) / 0.16); A.sy = 1 - 0.07 * c; A.sx = 1 + 0.05 * c; A.curve = 0.5 - 0.3 * c; return }
    A.sy = 1 + 0.02 * S(((u - 0.82) / 0.18) * Math.PI)
}
// Seacow, Wave: lifts and waves the left flipper, then the right, glancing at each
function wave(t: number, A: Act) {
    const side = t < 1.55 ? 1 : 2, u = side === 1 ? seg(t, 0.1, 1.5) : seg(t, 1.6, 3.0), lift = S(Math.PI * u), wig = S(TAU * u * 3) * 0.06 * lift, d = side === 1 ? -1 : 1
    A.pieces = cs => cs.map((p, i) => (i === side ? [p[0] + 0.12 * d * lift + wig, p[1] - 0.55 * lift, p[2]] : p))
    A.look = [18 * d, 8]; A.rot = 4 * d * lift; A.curve = 0.5 + 0.5 * lift; A.side = d * lift; A.len = 1 + 0.15 * lift; A.tilt = -10 * d * lift
}
// Seacow, Cover eyes: each flipper travels up its own side and in over the eye, holds, then goes back down the same way
function coverEyes(t: number, A: Act) {
    const su = SURF[3], ex = Math.sin(EYE_LON * D2R) * su[2], ey = su[1] - Math.sin(EYE_LAT * D2R) * su[3]
    const u = t < 1.0 ? easeIO(seg(t, 0, 1.0)) : t < 2.1 ? 1 : 1 - easeIO(seg(t, 2.1, 3.2))
    const path = (side: number, k: number) => {                         // corner, up the side, in over the eye
        const x0 = side * 0.62, y0 = 0.6, x1 = side * 0.7, y1 = 0.02, x2 = side * ex, y2 = ey
        if (k < 0.55) { const a = easeIO(k / 0.55); return [x0 + (x1 - x0) * a, y0 + (y1 - y0) * a] }
        const a = easeIO((k - 0.55) / 0.45); return [x1 + (x2 - x1) * a, y1 + (y2 - y1) * a]
    }
    const L = path(-1, u), Rr = path(1, u), r = 0.32 - 0.06 * u
    A.pieces = cs => cs.map((p, i) => (i === 1 ? [L[0], L[1], r] : i === 2 ? [Rr[0], Rr[1], r] : p))
    if (u > 0) A.overlay = [[L[0], L[1], r], [Rr[0], Rr[1], r]]
    A.look = [0, 0]; A.curve = 0.4 - 0.4 * u + (t > 2.8 ? 0.5 * pulse(t, 2.8, 3.4) : 0)
}
// act ids: 1 New ears, 2 Surprised, 3 Bell, 4 Propeller, 5 Quarter turns, 6 Hop, 7 Wave, 8 Cover eyes
const ACT_RUN = [null, newEars, surprised, bell, propeller, quarterTurns, hop, wave, coverEyes]
const ACT_MS = [0, NEW_EARS, SURPRISE, 3000, 2900, 3500, 2050, 3100, 3250]
const BODY_ACTS = [[1], [3, 4], [5, 6], [7, 8]]                       // each mascot's own acts; Quick turns is shared by all

function piecesFor(b: number, t: number, poke: number, hy: number, hp: number, A: Act): Piece[] {
    const D = DEFS[b], f = FIT[b]
    let cs = D.anim(D.c, t, poke, hy, hp)
    if (A.pieces) cs = A.pieces(cs)
    if (b === 0 && A.phase) cs = cs.map((p, i) => {
        if (!i) return p
        if (A.phase === 1) return [p[0] * (1 + 0.15 * A.up), p[1] - 0.5 * A.up, p[2] * (1 - A.up)]
        return [p[0] * (0.7 + 0.3 * A.grow), -0.3 + (p[1] + 0.3) * A.grow, p[2] * Math.max(0, A.grow)]
    })
    cs = cs.map(p => (p.length > 3 ? [p[0] * f, p[1] * f, p[2] * f, p[3] * f, p[4]] : [p[0] * f, p[1] * f, p[2] * f]))
    if (D.main >= 0) cs = cs.map((p, i) => (i === D.main ? p : headProject(p, hy, hp)))
    return cs
}

// ---------- face ----------
// orbit: how far a face point at (x, y) moves when the face swings `deg` around the eyes' midpoint
function orbitOffset(x: number, y: number, yaw: number, pitch: number, su: ArrayLike<number>, deg: number) {
    const l = frame(-EYE_LON, EYE_LAT, yaw, pitch, su), lx = l[4], ly = l[5], r = frame(EYE_LON, EYE_LAT, yaw, pitch, su), mx = (lx + r[4]) / 2, my = (ly + r[5]) / 2
    const a = deg * D2R, c = Math.cos(a), s = Math.sin(a), dx = x - mx, dy = y - my
    return [dx * c - dy * s - dx, dx * s + dy * c - dy]
}
function eyeTf(side: number, yaw: number, pitch: number, sx: number, sy: number, blink: number, su: ArrayLike<number>, orbit = 0) {
    const m = frame(side * EYE_LON, EYE_LAT, yaw, pitch, su), ty = blink * EYE_R * 2 * 0.08
    const a = m[0], b = m[1], c = m[2], d = m[3]
    let x = m[4] + c * ty, y = m[5] + d * ty
    if (orbit) { const o = orbitOffset(m[4], m[5], yaw, pitch, su, orbit); x += o[0]; y += o[1] }
    return `matrix(${r3(a * sx)} ${r3(b * sx)} ${r3(c * sy)} ${r3(d * sy)} ${r1(x)} ${r1(y)})`
}
function mouthD(curve: number, len: number, side: number, scale: number) {
    const hw = MOUTH_HW * scale * len, hl = hw * (1 - 0.7 * Math.max(0, side)), hr = hw * (1 - 0.7 * Math.max(0, -side))
    return `M${r1(-hl)} 0Q${r1((hr - hl) / 2)} ${r1(((curve * (hl + hr)) / 2) * 1.15)} ${r1(hr)} 0`
}
function mouthTf(yaw: number, pitch: number, tilt: number, su: ArrayLike<number>, orbit = 0) {
    const m = frame(0, EYE_LAT - MOUTH_DROP, yaw, pitch, su)
    let x = m[4], y = m[5]
    if (orbit) { const o = orbitOffset(x, y, yaw, pitch, su, orbit); x += o[0]; y += o[1]; tilt += orbit }
    return `matrix(${r3(m[0])} ${r3(m[1])} ${r3(m[2])} ${r3(m[3])} ${r1(x)} ${r1(y)})` + (tilt ? ` rotate(${r1(tilt)})` : "")
}
function starD(star: number) {
    const pt = (i: number) => { const a = -Math.PI / 2 + (i % 10) * Math.PI / 5, rr = EYE_R * (1 + star * (i % 2 ? -0.55 : 0.28)); return [Math.cos(a) * rr, Math.sin(a) * rr] }
    const last = pt(9), first = pt(0)
    let d = `M${r1((last[0] + first[0]) / 2)} ${r1((last[1] + first[1]) / 2)}`
    for (let i = 0; i < 10; i++) { const p = pt(i), q = pt(i + 1); d += `Q${r1(p[0])} ${r1(p[1])} ${r1((p[0] + q[0]) / 2)} ${r1((p[1] + q[1]) / 2)}` }
    return d + "Z"
}
function starTf(side: number, yaw: number, pitch: number, scale: number, su: ArrayLike<number>) {
    const m = frame(side * EYE_LON, EYE_LAT, yaw, pitch, su)
    return `translate(${r1(m[4])} ${r1(m[5])}) scale(${r3(scale)})`
}

// ---------- colour ----------
const rgbCache = new Map<string, number[]>()
function rgbOf(c: string): number[] {
    let v = rgbCache.get(c); if (v) return v
    const s = (c || "").trim(), m = s.match(/^#([0-9a-f]{3,8})$/i)
    if (m) { let h = m[1]; if (h.length < 6) h = h.split("").map(x => x + x).join(""); v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] }
    else { const n = s.match(/[\d.]+/g); v = n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [10, 10, 10] }
    rgbCache.set(c, v); return v
}
const css = (c: ArrayLike<number>) => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`

// resting pose of each body, also what the server and the Framer canvas render
const REST = DEFS.map((_, b) => {
    const [soft, grow] = SHAPE[b]
    fillField(piecesFor(b, 0, 0, 0, 0, NO_ACT), soft, grow, G)
    const su = SURF[b]
    return { d: contourPath(G), eyeL: eyeTf(-1, 0, 0, 1, 1, 0, su), eyeR: eyeTf(1, 0, 0, 1, 1, 0, su), mouthD: mouthD(SMILE, 1, 0, 1), mouthTf: mouthTf(0, 0, 0, su) }
})

// ---------- frame fit ----------
const SAFE_VIEWBOX = "-28 -28 256 256"        // measured over every act of every mascot: x -24..222, y -6..204 (Seacow's Wave reaches widest)
const ALIGN: Record<string, string> = { center: "xMidYMid meet", top: "xMidYMin meet", bottom: "xMidYMax meet", left: "xMinYMid meet", right: "xMaxYMid meet" }
const IDS = DEFS.map(D => D.id)

// Orb size: "fill" scales the mascot to the space it has; "fixed" keeps it at `orbSize` px (never larger than the space).
const STAGE_ALIGN: Record<string, CSSProperties> = {
    center: { alignItems: "center", justifyContent: "center" }, top: { alignItems: "flex-start", justifyContent: "center" },
    bottom: { alignItems: "flex-end", justifyContent: "center" }, left: { alignItems: "center", justifyContent: "flex-start" },
    right: { alignItems: "center", justifyContent: "flex-end" },
}
const orbBox = (p: { sizing: string; orbSize: number }): CSSProperties =>
    p.sizing === "fixed" ? { width: `min(${p.orbSize}px, 100%)`, height: `min(${p.orbSize}px, 100%)`, flex: "none" } : { width: "100%", height: "100%" }

type Props = {
    start: string
    color: string; faceColor: string
    arrows: boolean; pagination: "dots" | "numbers" | "none"; uiColor: string
    swipe: boolean; swipeTravel: number
    autoplay: boolean; autoplayEvery: number; autoplayMotion: "morph" | "swipe"
    play: boolean; every: number; hoverTarget: string
    follow: boolean; idle: boolean; blink: boolean; breathe: boolean; lean: boolean; tap: boolean
    align: "center" | "top" | "bottom" | "left" | "right"; safeArea: boolean
    sizing: "fill" | "fixed"; orbSize: number
    onChange?: () => void
    style?: CSSProperties
}
const DEFAULTS = {
    start: "bear",
    color: "#1E6DF6", faceColor: "#FFFFFF",
    arrows: true, pagination: "dots" as Props["pagination"], uiColor: "#141416",
    swipe: true, swipeTravel: 80,
    autoplay: false, autoplayEvery: 5, autoplayMotion: "morph" as Props["autoplayMotion"],
    play: true, every: 7, hoverTarget: "",
    follow: true, idle: true, blink: true, breathe: true, lean: true, tap: true,
    align: "center" as Props["align"], safeArea: true,
    sizing: "fill" as Props["sizing"], orbSize: 160,
}
const colorOf = (p: Props, _b: number) => p.color                 // one body colour for every mascot
const faceRgb = (p: Props) => rgbOf(p.faceColor)                     // one colour for eyes and mouth

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 280
 * @framerIntrinsicHeight 280
 */
export default function OrbSlider(input: Partial<Props>) {
    const props: Props = { ...DEFAULTS, ...input }
    const startIdx = Math.max(0, IDS.indexOf(props.start))
    const [index, setIndex] = useState(startIdx)                 // only the dots and labels re-render; the orb never does
    const wrapRef = useRef<HTMLDivElement>(null), svgRef = useRef<SVGSVGElement>(null), rootRef = useRef<SVGGElement>(null), bodyRef = useRef<SVGGElement>(null)
    const pathRef = useRef<SVGPathElement>(null), eyeLRef = useRef<SVGCircleElement>(null), eyeRRef = useRef<SVGCircleElement>(null)
    const starLRef = useRef<SVGPathElement>(null), starRRef = useRef<SVGPathElement>(null), mouthRef = useRef<SVGPathElement>(null)
    const ovLRef = useRef<SVGCircleElement>(null), ovRRef = useRef<SVGCircleElement>(null)
    const opts = useRef(props); opts.current = props
    const api = useRef({ go: (_i: number, _dir?: number) => {}, step: (_dir: number) => {}, gen: 0 })
    api.current.gen++                                            // a re-render may rewrite colours: the loop repaints them
    const rest = REST[startIdx], startRgb = rgbOf(colorOf(props, startIdx)), startFace = css(faceRgb(props))

    useEffect(() => {
        const svg = svgRef.current, wrap = wrapRef.current
        if (!svg || !wrap) return
        const root = rootRef.current!, body = bodyRef.current!, path = pathRef.current!, eyeL = eyeLRef.current!, eyeR = eyeRRef.current!
        const starL = starLRef.current!, starR = starRRef.current!, mouth = mouthRef.current!, ovL = ovLRef.current!, ovR = ovRRef.current!
        const canvas = RenderTarget.current() === RenderTarget.canvas
        const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
        const SNAP = new Float32Array(GP * GP)                   // the outline being morphed away from
        const LAST = new Float32Array(GP * GP)                   // this instance's last traced field, seeded with the resting shape
        fillField(piecesFor(startIdx, 0, 0, 0, 0, NO_ACT), SHAPE[startIdx][0], SHAPE[startIdx][1], LAST)
        const s = {
            cur: startIdx, morphT0: 0, dir: 1, push: true, su: Float64Array.from(SURF[startIdx]), su0: new Float64Array(4),
            rgb: startRgb.slice(), rgb0: startRgb.slice(), face: faceRgb(props).slice(), face0: [0, 0, 0],
            yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, hy: 0, hp: 0, hvy: 0, hvp: 0,
            eyeScale: 1, tEyeScale: 1, squash: 1, tSquash: 1,
            mouth: SMILE, tMouth: SMILE, side: 0, tSide: 0, len: 1, tLen: 1, tilt: 0, tTilt: 0,
            blink: 0, blinkT0: 0, blinkN: 0, poke: 0, pokeS: 0,
            manual: false, act: 0, actT0: 0, fadeT0: 0, last: 0,
            nextIdle: 0, nextBlink: 0, nextAct: 0, nextSlide: 0, hold: 0,
            px: 0, py: 0, pT: -1e9, rcx: 0, rcy: 0, rw: 240, rT: -1e9, hover: false,
            drag: 0, dragOn: false, dragX0: 0, dragT0: 0, dragMoved: 0, dragPx: 0, onOrb: false, autoT0: 0, travel: 100, scale: 1,
            lastPieces: "", gen: -1,
        }
        const A: Act = { ...NO_ACT }, FA: Act = { ...NO_ACT }
        let tl: { at: number; fn: () => void }[] = []
        const cache: Record<string, string> = { d: rest.d, l: rest.eyeL, r: rest.eyeR, md: rest.mouthD, mt: rest.mouthTf }
        const put = (el: Element, name: string, key: string, v: string) => { if (cache[key] !== v) { cache[key] = v; el.setAttribute(name, v) } }
        const look = (y: number, p: number) => { s.tYaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, y)); s.tPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p)) }
        const startBlink = (now: number, n: number) => { if (!s.blinkN) { s.blinkN = n; s.blinkT0 = now } }
        const schedule = (now: number) => { s.nextAct = now + opts.current.every * 1000 * (0.6 + 0.8 * Math.random()) }
        const resetFace = () => { s.tMouth = SMILE; s.tSide = 0; s.tLen = 1; s.tTilt = 0; s.tEyeScale = 1; s.tSquash = 1 }
        const stopAct = () => { tl = []; s.act = 0; s.actT0 = 0; s.fadeT0 = 0; s.manual = false; resetFace() }
        const playAct = (id: number, now: number) => { tl = []; s.manual = true; look(0, 0); s.act = id; s.actT0 = now; s.fadeT0 = 0 }
        const playQuickTurns = (now: number) => {
            s.manual = true; s.tMouth = 0.15; s.tLen = 0.8; tl = []
            const y = 0.9 * MAX_YAW
            ;[1, -1, 1, -1].forEach((dir, i) => tl.push({ at: now + i * 420, fn: () => { look(y * dir, 0); s.tSide = dir; s.tTilt = 9 * dir } }))
            tl.push({ at: now + 1680, fn: () => look(0, 0) })
            tl.push({ at: now + QUICK_TURNS - 300, fn: () => resetFace() })
            tl.push({ at: now + QUICK_TURNS, fn: () => { s.manual = false; schedule(now + QUICK_TURNS) } })
        }
        const poke = (now: number) => {
            if (s.act || s.manual || s.morphT0) return
            s.poke = 1; s.tEyeScale = 1.22; s.tSquash = 1.1; s.tMouth = 0.5; s.tLen = 0.55
            tl = [{ at: now + 420, fn: () => { resetFace(); startBlink(now + 420, 1) } }]
        }
        const surprise = (now: number) => { if (!raf || s.act || s.morphT0) return; resetFace(); playAct(2, now) }

        // ---------- slide change ----------
        const announce = (b: number) => svg.setAttribute("aria-label", `${DEFS[b].name}, ${b + 1} of ${DEFS.length}`)
        const go = (target: number, dir?: number, push = true) => {
            const n = DEFS.length, b = ((target % n) + n) % n
            if (b === s.cur && !s.morphT0) return
            const now = performance.now()
            stopAct()
            SNAP.set(LAST)                                                         // freeze the outline we are leaving
            s.su0.set(s.su); s.rgb0 = s.rgb.slice(); s.face0 = s.face.slice()
            s.dir = dir ?? (b > s.cur ? 1 : -1); s.push = push; s.cur = b; s.morphT0 = now; s.hold = now + 4000
            s.nextSlide = now + opts.current.autoplayEvery * 1000
            announce(b); setIndex(b); opts.current.onChange?.()
            wrap.dispatchEvent(new CustomEvent("orbslider:change", { bubbles: true, detail: { index: b, id: DEFS[b].id } }))
            if (!raf) paintStatic()
        }
        api.current.go = go
        api.current.step = (dir: number) => go(s.cur + dir, dir)            // arrows use the live position, never a stale render

        // reduced motion and the canvas: no loop, the resting pose of the current slide
        const paintStatic = () => {
            const b = s.cur, c = rgbOf(colorOf(opts.current, b)), fc = css(faceRgb(opts.current)), r = REST[b]
            s.morphT0 = 0; s.su.set(SURF[b]); s.rgb = c.slice(); s.face = faceRgb(opts.current).slice()
            put(path, "d", "d", r.d); put(eyeL, "transform", "l", r.eyeL); put(eyeR, "transform", "r", r.eyeR)
            put(mouth, "d", "md", r.mouthD); put(mouth, "transform", "mt", r.mouthTf)
            path.setAttribute("fill", css(c)); for (const e of [eyeL, eyeR, starL, starR]) e.setAttribute("fill", fc); mouth.setAttribute("stroke", fc)
        }

        let raf = 0, visible = true
        const tick = (now: number) => {
            raf = 0
            const o = opts.current, dt = Math.min(64, now - s.last); s.last = now
            while (tl.length && now >= tl[0].at) tl.shift()!.fn()
            const D = DEFS[s.cur]

            // gaze
            if (!s.manual) {
                if (o.follow && now - s.pT < 4000) {
                    if (now - s.rT > 300) {
                        const m = svg.getScreenCTM()
                        if (m) { s.rcx = m.a * CX + m.e; s.rcy = m.d * CY + m.f; s.rw = m.a * 200; s.scale = m.a }
                        s.rT = now
                    }
                    const k = Math.max(120, s.rw * 0.9)
                    look(MAX_YAW * (2 / Math.PI) * Math.atan((s.px - s.rcx) / k), -MAX_PITCH * (2 / Math.PI) * Math.atan((s.py - s.rcy) / k))
                    s.nextIdle = now + 1200
                } else if (o.idle && now > s.nextIdle) {
                    const home = Math.random() < 0.35
                    look(home ? 0 : (Math.random() * 2 - 1) * MAX_YAW * 0.55, home ? 0 : (Math.random() * 2 - 1) * MAX_PITCH * 0.4)
                    s.nextIdle = now + 1200 + Math.random() * 2600
                }
                if (o.play && !s.act && !s.morphT0 && now > s.nextAct) {
                    const own = BODY_ACTS[s.cur], pick = Math.floor(Math.random() * (own.length + 1))   // the mascot's own acts and Quick turns, equally likely
                    if (pick < own.length) playAct(own[pick], now); else playQuickTurns(now)
                }
            }
            // autoplay plays a swipe: the orb is pushed aside as if dragged, then released into the morph, exactly like a hand swipe
            if (o.autoplay && !s.dragOn && !s.autoT0 && !s.hover && !s.morphT0 && now > s.hold && now > s.nextSlide && !s.act) {
                if (o.autoplayMotion === "swipe") { stopAct(); s.manual = true; look(-MAX_YAW * 0.5, 0); s.autoT0 = now; s.travel = travelOf() }   // played as a swipe: pushed aside, then released
                else go(s.cur + 1, 1, false)                                                                                    // morph in place: no push, no sideways nudge
            }
            if (s.autoT0) {
                const u = (now - s.autoT0) / AUTO_PUSH
                if (s.dragOn || s.hover) { s.autoT0 = 0; s.manual = false; s.nextSlide = now + o.autoplayEvery * 1000 }     // a hand takes over
                else if (u >= 1) { s.autoT0 = 0; s.manual = false; go(s.cur + 1, 1) }
                else s.drag = -s.travel * Math.tanh(1.6 * easeIn(u))                      // the same rubber band as a hand swipe
            }
            if (o.blink && now > s.nextBlink && !s.act) { startBlink(now, Math.random() < 0.2 ? 2 : 1); s.nextBlink = now + 2000 + Math.random() * 4000 }
            if (s.blinkN) {
                const t = now - s.blinkT0, total = 280 * s.blinkN + 110 * (s.blinkN - 1)
                if (t >= total) { s.blink = 0; s.blinkN = 0 }
                else { const c = t % 390; s.blink = c < 90 ? (c / 90) * (c / 90) : c < 130 ? 1 : c < 280 ? (1 - (c - 130) / 150) * (1 - (c - 130) / 150) : 0 }
            }

            // springs and easing
            const k = 1 - Math.exp(-dt / 70), k2 = 1 - Math.exp(-dt / 90), h = Math.min(dt, 40) / 1000
            s.yaw += (s.tYaw - s.yaw) * k; s.pitch += (s.tPitch - s.pitch) * k
            s.hvy += ((s.yaw * D.head - s.hy) * D.k - s.hvy * D.d) * h; s.hy += s.hvy * h
            s.hvp += ((s.pitch * D.head - s.hp) * D.k - s.hvp * D.d) * h; s.hp += s.hvp * h
            s.eyeScale += (s.tEyeScale - s.eyeScale) * k2; s.squash += (s.tSquash - s.squash) * k2
            s.mouth += (s.tMouth - s.mouth) * k2; s.side += (s.tSide - s.side) * k2; s.len += (s.tLen - s.len) * k2; s.tilt += (s.tTilt - s.tilt) * k2
            s.poke *= Math.exp(-dt / 420); if (s.poke < 0.002) s.poke = 0
            s.pokeS += (s.poke - s.pokeS) * (1 - Math.exp(-dt / 90))
            if (!s.dragOn && !s.autoT0) s.drag += (0 - s.drag) * (1 - Math.exp(-dt / 190))            // spring back to its place, arriving as the new mascot

            // act frame
            Object.assign(A, NO_ACT)
            if (s.act) {
                const t = now - s.actT0, ms = ACT_MS[s.act], run = ACT_RUN[s.act]!
                if (t >= ms) { Object.assign(FA, NO_ACT); run(ms / 1000, FA); s.act = 0; s.fadeT0 = now; s.manual = false; schedule(now) }
                else { run(t / 1000, A); if (A.look) look(A.look[0], A.look[1]) }
            }
            if (!s.act && s.fadeT0) {
                const f = (now - s.fadeT0) / FADE
                if (f >= 1) s.fadeT0 = 0
                else { const e = 1 - easeIO(f); A.curve = s.mouth + ((FA.curve ?? s.mouth) - s.mouth) * e; A.len = s.len + ((FA.len ?? s.len) - s.len) * e; A.eyeScale = 1 + (FA.eyeScale - 1) * e; A.eyeSquash = 1 + (FA.eyeSquash - 1) * e; A.sy = 1 + (FA.sy - 1) * e
                    A.sx = 1 + (FA.sx - 1) * e; A.rot = FA.rot * e; A.pivotY = FA.pivotY; A.dy = FA.dy * e; A.side = FA.side * e; A.tilt = FA.tilt * e; A.orbit = FA.orbit * e }
            }

            // morph progress
            let e = 1, mb = 0
            if (s.morphT0) {
                const f = reduced ? 1 : (now - s.morphT0) / MORPH_MS
                if (f >= 1) s.morphT0 = 0
                else { e = easeIO(f); mb = clamp01(1 - Math.abs(f - 0.5) / 0.3) }          // the eyes close through the middle of the morph
            }
            const cT = rgbOf(colorOf(o, s.cur)), fT = faceRgb(o), suT = SURF[s.cur]
            for (let q = 0; q < 3; q++) { s.rgb[q] = s.rgb0[q] + (cT[q] - s.rgb0[q]) * e; s.face[q] = s.face0[q] + (fT[q] - s.face0[q]) * e }
            for (let q = 0; q < 4; q++) s.su[q] = s.su0[q] + (suT[q] - s.su0[q]) * e

            // body outline: traced again only when the pieces moved or a morph is running
            const cs = piecesFor(s.cur, now / 1000, s.pokeS, s.hy, s.hp, A), key = cs.map(p => p.map(v => v.toFixed(4)).join(",")).join(";")
            if (key !== s.lastPieces || s.morphT0 || e < 1) {
                const [soft, grow] = SHAPE[s.cur]
                fillField(cs, soft, grow, G)
                if (e < 1) for (let q = 0; q < G.length; q++) G[q] = SNAP[q] + (G[q] - SNAP[q]) * e
                LAST.set(G); s.lastPieces = s.morphT0 ? "" : key
                put(path, "d", "d", contourPath(G))
            }

            // paint
            if (s.gen !== api.current.gen) { s.gen = api.current.gen; cache.fill = ""; cache.face = "" }
            const fill = css(s.rgb), face = css(s.face)
            if (cache.fill !== fill) { cache.fill = fill; path.setAttribute("fill", fill) }
            if (cache.face !== face) { cache.face = face; for (const el of [eyeL, eyeR, starL, starR]) el.setAttribute("fill", face); mouth.setAttribute("stroke", face) }
            const blink = Math.max(s.blink, mb)
            const sx = s.eyeScale * A.eyeScale, sy = s.eyeScale * s.squash * (1 - blink * 0.94) * A.eyeSquash
            put(eyeL, "transform", "l", eyeTf(-1, s.yaw, s.pitch, sx, sy, blink, s.su, A.orbit))
            put(eyeR, "transform", "r", eyeTf(1, s.yaw, s.pitch, sx, sy, blink, s.su, A.orbit))
            if (A.star > 0.001) {
                const us = sx * (1 + 0.38 * A.star)
                put(starL, "d", "sd", starD(A.star)); starR.setAttribute("d", cache.sd)
                put(starL, "transform", "sl", starTf(-1, s.yaw, s.pitch, us, s.su)); put(starR, "transform", "sr", starTf(1, s.yaw, s.pitch, us, s.su))
            }
            const sv = A.star > 0.001 ? "visible" : "hidden"
            if (cache.sv !== sv) { cache.sv = sv; const ev = sv === "visible" ? "hidden" : "visible"; starL.setAttribute("visibility", sv); starR.setAttribute("visibility", sv); eyeL.setAttribute("visibility", ev); eyeR.setAttribute("visibility", ev) }
            put(mouth, "d", "md", mouthD(A.curve ?? s.mouth, (A.len ?? s.len) * (1 - 0.5 * mb), A.side || s.side, sx))
            put(mouth, "transform", "mt", mouthTf(s.yaw, s.pitch, s.tilt + A.tilt, s.su, A.orbit))
            // overlay: the seacow's flippers drawn over its eyes, in the body colour
            const ov = A.overlay
            for (let q = 0; q < 2; q++) {
                const el = q ? ovR : ovL, p = ov && ov[q]
                if (p) { el.setAttribute("cx", "" + r1(CX + p[0] * R)); el.setAttribute("cy", "" + r1(CY + p[1] * R)); el.setAttribute("r", "" + r1(p[2] * R)); el.setAttribute("fill", fill) }
                const v = p ? "visible" : "hidden"; if (cache["ov" + q] !== v) { cache["ov" + q] = v; el.setAttribute("visibility", v) }
            }
            put(mouth, "stroke-width", "sw", "" + r1(MOUTH_STROKE * s.eyeScale))
            // body transform: lean, act start, morph nudge, drag with a slight tilt, pivoting on the bottom centre
            const nudge = s.morphT0 && s.push ? -s.dir * 10 * S(Math.PI * e) : 0, squish = s.morphT0 ? 1 - 0.05 * S(Math.PI * e) : 1
            const tx = (o.lean ? (s.yaw / MAX_YAW) * 3 : 0) + nudge + s.drag, ty = (o.lean ? (-s.pitch / MAX_PITCH) * 2 : 0) + A.dy
            const th = Math.max(-10, Math.min(10, (s.drag / Math.max(1, s.travel)) * 14)) * D2R, c = Math.cos(th), sn = Math.sin(th), syy = A.sy * squish, pX = CX, pY = CY + R
            const ma = c, mb2 = sn, mc = -sn * syy, md = c * syy
            const tiltShift = sn * syy * R                                                  // the tilt about the bottom moves the centre sideways; cancel it so travel is exact
            // outer: drag tilt and the moves (T1); inner: the act's own rotation and scale about its pivot (T2)
            const T1 = [ma, mb2, mc, md, pX - (ma * pX + mc * pY) + tx - tiltShift, pY - (mb2 * pX + md * pY) + ty]
            const ar = A.rot * D2R, ac = Math.cos(ar), as = Math.sin(ar), qY = CY + R * A.pivotY
            const n0 = ac * A.sx, n1 = as * A.sx, n2 = -as * A.sy, n3 = ac * A.sy, T2 = [n0, n1, n2, n3, CX - (n0 * CX + n2 * qY), qY - (n1 * CX + n3 * qY)]
            const M = [T1[0] * T2[0] + T1[2] * T2[1], T1[1] * T2[0] + T1[3] * T2[1], T1[0] * T2[2] + T1[2] * T2[3], T1[1] * T2[2] + T1[3] * T2[3],
                T1[0] * T2[4] + T1[2] * T2[5] + T1[4], T1[1] * T2[4] + T1[3] * T2[5] + T1[5]]
            put(body, "transform", "b", `matrix(${r3(M[0])} ${r3(M[1])} ${r3(M[2])} ${r3(M[3])} ${r1(M[4])} ${r1(M[5])})`)
            const br = o.breathe ? 1 + 0.012 * Math.sin((now / 3200) * TAU) : 1
            put(root, "transform", "o", `matrix(${r3(br)} 0 0 ${r3(br)} ${r1(CX * (1 - br))} ${r1(CY * (1 - br))})`)

            if (visible) raf = requestAnimationFrame(tick)
        }

        const start = () => {
            if (canvas || reduced || raf || !visible || document.hidden) return
            const now = performance.now(); s.last = now
            if (!s.nextBlink) { s.nextBlink = now + 1500; s.nextIdle = now + 800; s.nextSlide = now + opts.current.autoplayEvery * 1000; schedule(now) }
            raf = requestAnimationFrame(tick)
        }
        const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }

        // ---------- input ----------
        const toUnits = () => { const m = svg.getScreenCTM(); return m ? 1 / m.a : 1 }
        const travelOf = () => Math.min(wrap.getBoundingClientRect().width / 2, Math.max(0, opts.current.swipeTravel)) * toUnits()   // the farthest the orb may slide, in its own units
        const onMove = (e: PointerEvent) => {
            s.px = e.clientX; s.py = e.clientY; s.pT = performance.now()
            if (s.dragOn) {
                const px = e.clientX - s.dragX0; s.dragMoved = Math.max(s.dragMoved, Math.abs(px))
                const u = px * toUnits(), lim = Math.max(1e-3, s.travel)        // rubber band: follows the finger at first, slows steadily, never passes the limit
                s.drag = lim * Math.tanh(u / lim)
            }
        }
        // the whole component is the swipe area; the orb keeps its own size. Taps poke only when they land on the orb.
        const onDown = (e: PointerEvent) => {
            if (!e.isPrimary || (e.target as Element).closest?.("button")) return
            const onOrb = svg.contains(e.target as Node)
            if (opts.current.swipe) { s.dragOn = true; s.onOrb = onOrb; s.travel = travelOf(); s.dragX0 = e.clientX; s.dragT0 = performance.now(); s.dragMoved = 0; s.drag = 0; try { wrap.setPointerCapture(e.pointerId) } catch {} }
            else if (onOrb && opts.current.tap) poke(performance.now())
        }
        const onUp = (e: PointerEvent) => {
            if (!s.dragOn) return
            s.dragOn = false
            const px = e.clientX - s.dragX0, v = px / Math.max(1, performance.now() - s.dragT0), need = Math.max(30, wrap.getBoundingClientRect().width * 0.12)   // in screen pixels, so the orb's size does not change the feel
            if (s.dragMoved < 6) { if (s.onOrb && opts.current.tap) poke(performance.now()); return }
            if (px < -need || v < -0.5) go(s.cur + 1, 1)
            else if (px > need || v > 0.5) go(s.cur - 1, -1)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") { go(s.cur + 1, 1); e.preventDefault() }
            else if (e.key === "ArrowLeft") { go(s.cur - 1, -1); e.preventDefault() }
        }
        const onEnter = () => { s.hover = true }, onLeave = () => { s.hover = false }
        const onVis = () => (document.hidden ? stop() : start())
        const selector = () => {
            const t = (opts.current.hoverTarget || "").trim(); if (!t) return ""
            return /^[#.\[]/.test(t) ? t : `[data-framer-name="${t.replace(/["\\]/g, "\\$&")}"]`
        }
        const onOver = (e: PointerEvent) => {
            const q = selector(), target = e.target as Element | null; if (!q || !target || !target.closest) return
            let hit: Element | null = null
            try { hit = target.closest(q) } catch { return }
            if (!hit || (e.relatedTarget instanceof Node && hit.contains(e.relatedTarget))) return
            surprise(performance.now())
        }
        // window events, for code overrides and custom buttons
        const onNext = () => go(s.cur + 1, 1), onPrev = () => go(s.cur - 1, -1)
        const onGo = (e: Event) => { const d = (e as CustomEvent).detail; const b = typeof d === "number" ? d : IDS.indexOf(String(d)); if (b >= 0) go(b) }
        const onSurprise = () => surprise(performance.now())

        const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; visible ? start() : stop() }) : null
        io?.observe(svg)
        window.addEventListener("pointermove", onMove, { passive: true })
        wrap.addEventListener("pointerdown", onDown)
        wrap.addEventListener("pointerup", onUp); wrap.addEventListener("pointercancel", onUp)
        wrap.addEventListener("keydown", onKey); wrap.addEventListener("pointerenter", onEnter); wrap.addEventListener("pointerleave", onLeave)
        document.addEventListener("visibilitychange", onVis)
        document.addEventListener("pointerover", onOver, { passive: true })
        window.addEventListener("orbslider:next", onNext); window.addEventListener("orbslider:prev", onPrev)
        window.addEventListener("orbslider:go", onGo); window.addEventListener("orbslider:surprise", onSurprise)
        announce(s.cur)
        if (canvas || reduced) paintStatic(); else start()
        return () => {
            stop(); io?.disconnect()
            window.removeEventListener("pointermove", onMove)
            wrap.removeEventListener("pointerdown", onDown); wrap.removeEventListener("pointerup", onUp); wrap.removeEventListener("pointercancel", onUp)
            wrap.removeEventListener("keydown", onKey); wrap.removeEventListener("pointerenter", onEnter); wrap.removeEventListener("pointerleave", onLeave)
            document.removeEventListener("visibilitychange", onVis); document.removeEventListener("pointerover", onOver)
            window.removeEventListener("orbslider:next", onNext); window.removeEventListener("orbslider:prev", onPrev)
            window.removeEventListener("orbslider:go", onGo); window.removeEventListener("orbslider:surprise", onSurprise)
        }
    }, [])

    const ui = props.uiColor
    const arrow = (dir: number) => (
        <button type="button" aria-label={dir > 0 ? "Next mascot" : "Previous mascot"} onClick={() => api.current.step(dir)}
            style={{ position: "absolute", top: "50%", [dir > 0 ? "right" : "left"]: 4, transform: "translateY(-50%)", width: 32, height: 32, padding: 0, border: 0, borderRadius: 16,
                background: "transparent", color: ui, opacity: 0.55, cursor: "pointer", display: "grid", placeItems: "center" } as CSSProperties}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d={dir > 0 ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
    )
    return (
        <div ref={wrapRef} role="group" aria-roledescription="carousel" aria-label="Mascots" tabIndex={0}
            style={{ position: "relative", width: "100%", height: "100%", aspectRatio: "1 / 1", outline: "none", userSelect: "none",
                touchAction: props.swipe ? "pan-y" : "auto", cursor: props.swipe ? "grab" : "default", ...props.style }}>
            <div style={{ position: "absolute", inset: `0 ${props.arrows ? 36 : 0}px ${props.pagination !== "none" ? 24 : 0}px ${props.arrows ? 36 : 0}px`, display: "flex", pointerEvents: "none", ...(STAGE_ALIGN[props.align] || STAGE_ALIGN.center) }}>
            <svg ref={svgRef} viewBox={props.safeArea ? SAFE_VIEWBOX : "0 0 200 200"} preserveAspectRatio={ALIGN[props.align] || ALIGN.center}
                role="img" aria-label={`${DEFS[startIdx].name}, ${startIdx + 1} of ${DEFS.length}`}
                style={{ ...orbBox(props), display: "block", overflow: "visible", pointerEvents: "auto" }}>
                <g ref={rootRef}>
                    <g ref={bodyRef}>
                        <path ref={pathRef} d={rest.d} fill={css(startRgb)} />
                        <circle ref={eyeLRef} r={EYE_R} fill={startFace} transform={rest.eyeL} />
                        <circle ref={eyeRRef} r={EYE_R} fill={startFace} transform={rest.eyeR} />
                        <path ref={starLRef} fill={startFace} visibility="hidden" />
                        <path ref={starRRef} fill={startFace} visibility="hidden" />
                        <path ref={mouthRef} d={rest.mouthD} transform={rest.mouthTf} fill="none" stroke={startFace} strokeWidth={MOUTH_STROKE} strokeLinecap="round" />
                        <circle ref={ovLRef} r={0} visibility="hidden" />
                        <circle ref={ovRRef} r={0} visibility="hidden" />
                    </g>
                </g>
            </svg>
            </div>
            {props.arrows && (<>{arrow(-1)}{arrow(1)}</>)}
            {props.pagination === "dots" && (
                <div role="tablist" aria-label="Choose a mascot" style={{ position: "absolute", left: 0, right: 0, bottom: 2, display: "flex", justifyContent: "center", gap: 2 }}>
                    {DEFS.map((D, b) => (
                        <button key={D.id} type="button" role="tab" aria-selected={b === index} aria-label={D.name} onClick={() => api.current.go(b)}
                            style={{ width: 20, height: 20, padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}>
                            <span style={{ width: b === index ? 16 : 6, height: 6, borderRadius: 3, background: ui, opacity: b === index ? 0.9 : 0.3, transition: "width .25s, opacity .25s" }} />
                        </button>
                    ))}
                </div>
            )}
            {props.pagination === "numbers" && (
                <div aria-live="polite" style={{ position: "absolute", left: 0, right: 0, bottom: 2, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                    font: "500 12px/1 system-ui, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em", color: ui }}>
                    <span style={{ opacity: 0.9 }}>{index + 1}</span><span style={{ opacity: 0.35, margin: "0 5px" }}>/</span><span style={{ opacity: 0.35 }}>{DEFS.length}</span>
                </div>
            )}
        </div>
    )
}

addPropertyControls(OrbSlider, {
    start: { type: ControlType.Enum, title: "Start at", options: IDS, optionTitles: DEFS.map(D => D.name), defaultValue: DEFAULTS.start },
    color: { type: ControlType.Color, title: "Body", defaultValue: DEFAULTS.color, description: "One colour for every mascot." },
    faceColor: { type: ControlType.Color, title: "Face", defaultValue: DEFAULTS.faceColor, description: "Eyes and mouth." },
    arrows: { type: ControlType.Boolean, title: "Arrows", defaultValue: DEFAULTS.arrows },
    pagination: { type: ControlType.Enum, title: "Pagination", options: ["dots", "numbers", "none"], optionTitles: ["Dots", "1 / 4", "None"], displaySegmentedControl: true, defaultValue: DEFAULTS.pagination },
    uiColor: { type: ControlType.Color, title: "Controls color", defaultValue: DEFAULTS.uiColor, hidden: (p: Props) => !p.arrows && p.pagination === "none" },
    swipe: { type: ControlType.Boolean, title: "Swipe", defaultValue: DEFAULTS.swipe },
    swipeTravel: { type: ControlType.Number, title: "Swipe travel", min: 0, max: 600, step: 4, unit: "px", displayStepper: true, defaultValue: DEFAULTS.swipeTravel, hidden: (p: Props) => !p.swipe,
        description: "How far the orb may slide while swiping or on autoplay. The swipe still works across the whole component." },
    autoplay: { type: ControlType.Boolean, title: "Autoplay", defaultValue: DEFAULTS.autoplay },
    autoplayMotion: { type: ControlType.Enum, title: "Motion", options: ["morph", "swipe"], optionTitles: ["Morph", "Swipe"], displaySegmentedControl: true, defaultValue: DEFAULTS.autoplayMotion, hidden: (p: Props) => !p.autoplay,
        description: "Morph: changes in place. Swipe: the mascot is pushed aside first, like a hand swipe." },
    autoplayEvery: { type: ControlType.Number, title: "Next every", min: 2, max: 30, step: 0.5, unit: "s", displayStepper: true, defaultValue: DEFAULTS.autoplayEvery, hidden: (p: Props) => !p.autoplay },
    play: { type: ControlType.Boolean, title: "Animations", enabledTitle: "Random", disabledTitle: "Off", defaultValue: DEFAULTS.play, description: "Each mascot plays its own acts at random: Bear New ears; Lemon Bell, Propeller; Cloud Quarter turns, Hop; Seacow Wave, Cover eyes. Plus Quick turns on all." },
    every: { type: ControlType.Number, title: "Every", min: 3, max: 60, step: 1, unit: "s", displayStepper: true, defaultValue: DEFAULTS.every, hidden: (p: Props) => !p.play },
    hoverTarget: { type: ControlType.String, title: "Surprise on", placeholder: "Layer name", defaultValue: DEFAULTS.hoverTarget, description: "Hovering this layer plays Surprised. A layer name, or a CSS selector starting with # . or [" },
    follow: { type: ControlType.Boolean, title: "Follow cursor", defaultValue: DEFAULTS.follow },
    idle: { type: ControlType.Boolean, title: "Idle wander", defaultValue: DEFAULTS.idle },
    blink: { type: ControlType.Boolean, title: "Blink", defaultValue: DEFAULTS.blink },
    breathe: { type: ControlType.Boolean, title: "Breathe", defaultValue: DEFAULTS.breathe },
    lean: { type: ControlType.Boolean, title: "Lean", defaultValue: DEFAULTS.lean },
    tap: { type: ControlType.Boolean, title: "Tap reaction", defaultValue: DEFAULTS.tap },
    sizing: { type: ControlType.Enum, title: "Orb size", options: ["fill", "fixed"], optionTitles: ["Fill", "Fixed"], displaySegmentedControl: true, defaultValue: DEFAULTS.sizing, description: "Fill: as large as the component allows. Fixed: a set size in pixels." },
    orbSize: { type: ControlType.Number, title: "Size", min: 16, max: 1200, step: 1, unit: "px", displayStepper: true, defaultValue: DEFAULTS.orbSize, hidden: (p: Props) => p.sizing !== "fixed" },
    align: { type: ControlType.Enum, title: "Align", options: ["center", "top", "bottom", "left", "right"], optionTitles: ["Center", "Top", "Bottom", "Left", "Right"], defaultValue: DEFAULTS.align },
    safeArea: { type: ControlType.Boolean, title: "Safe area", defaultValue: DEFAULTS.safeArea, description: "Room for every pose, so a clipping Frame never cuts the mascot." },
    onChange: { type: ControlType.EventHandler },
})
