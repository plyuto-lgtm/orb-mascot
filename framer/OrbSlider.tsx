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
type Act = { eyeScale: number; eyeSquash: number; sy: number; dy: number; star: number; curve: number | null; len: number | null; up: number; grow: number; phase: number }
const NO_ACT: Act = { eyeScale: 1, eyeSquash: 1, sy: 1, dy: 0, star: 0, curve: null, len: null, up: 0, grow: 1, phase: 0 }
function newEars(t: number, A: Act) {                                  // bear: the ears pull up and off, then grow back
    A.eyeScale = 1 + 0.2 * pulse(t, 0, 0.4); A.eyeSquash = 1 - 0.3 * pulse(t, 0.4, 1.4)
    if (t < 1.9) { A.phase = 1; A.up = easeIn(seg(t, 0.4, 1.4)); A.grow = 0; A.curve = 0.4 - 0.9 * pulse(t, 0.3, 1.5); A.len = 1 - 0.25 * pulse(t, 0.3, 1.5) }
    else { A.phase = 2; A.up = 0; A.grow = easeBack(seg(t, 1.9, 3.1)); const g = Math.min(1, A.grow); A.curve = 0.4 + 0.6 * g; A.len = 1 + 0.25 * g; A.sy = 1 - 0.04 * pulse(t, 1.9, 2.5) }
}
function surprised(t: number, A: Act) {                                // any body: star eyes, a wide smile, a small start
    const k = Math.min(easeBack(seg(t, 0, 0.28)), 1 - easeIO(seg(t, 1.2, 1.6))), p = pulse(t, 0, 0.35)
    A.star = clamp01(k); A.eyeScale = 1 + 0.2 * k; A.curve = 0.4 + 0.5 * k; A.len = 1 - 0.25 * k; A.dy = -5 * p; A.sy = 1 + 0.03 * p
}
const ACT_RUN = [null, newEars, surprised], ACT_MS = [0, NEW_EARS, SURPRISE]

function piecesFor(b: number, t: number, poke: number, hy: number, hp: number, A: Act): Piece[] {
    const D = DEFS[b], f = FIT[b]
    let cs = D.anim(D.c, t, poke, hy, hp)
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
function eyeTf(side: number, yaw: number, pitch: number, sx: number, sy: number, blink: number, su: ArrayLike<number>) {
    const m = frame(side * EYE_LON, EYE_LAT, yaw, pitch, su), ty = blink * EYE_R * 2 * 0.08
    return `matrix(${r3(m[0] * sx)} ${r3(m[1] * sx)} ${r3(m[2] * sy)} ${r3(m[3] * sy)} ${r1(m[4] + m[2] * ty)} ${r1(m[5] + m[3] * ty)})`
}
function mouthD(curve: number, len: number, side: number, scale: number) {
    const hw = MOUTH_HW * scale * len, hl = hw * (1 - 0.7 * Math.max(0, side)), hr = hw * (1 - 0.7 * Math.max(0, -side))
    return `M${r1(-hl)} 0Q${r1((hr - hl) / 2)} ${r1(((curve * (hl + hr)) / 2) * 1.15)} ${r1(hr)} 0`
}
function mouthTf(yaw: number, pitch: number, tilt: number, su: ArrayLike<number>) {
    const m = frame(0, EYE_LAT - MOUTH_DROP, yaw, pitch, su)
    return `matrix(${r3(m[0])} ${r3(m[1])} ${r3(m[2])} ${r3(m[3])} ${r1(m[4])} ${r1(m[5])})` + (tilt ? ` rotate(${r1(tilt)})` : "")
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
const faceOf = (rgb: number[]) => ((0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.55 ? [20, 20, 22] : [255, 255, 255])   // ink on light bodies, white on dark
const css = (c: ArrayLike<number>) => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`

// resting pose of each body, also what the server and the Framer canvas render
const REST = DEFS.map((_, b) => {
    const [soft, grow] = SHAPE[b]
    fillField(piecesFor(b, 0, 0, 0, 0, NO_ACT), soft, grow, G)
    const su = SURF[b]
    return { d: contourPath(G), eyeL: eyeTf(-1, 0, 0, 1, 1, 0, su), eyeR: eyeTf(1, 0, 0, 1, 1, 0, su), mouthD: mouthD(SMILE, 1, 0, 1), mouthTf: mouthTf(0, 0, 0, su) }
})

// ---------- frame fit ----------
const SAFE_VIEWBOX = "-4 -8 208 208"
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
    bearColor: string; lemonColor: string; cloudColor: string; seacowColor: string
    controls: boolean; uiColor: string; swipe: boolean
    autoplay: boolean; autoplayEvery: number
    play: boolean; every: number; hoverTarget: string
    follow: boolean; idle: boolean; blink: boolean; breathe: boolean; lean: boolean; tap: boolean
    align: "center" | "top" | "bottom" | "left" | "right"; safeArea: boolean
    sizing: "fill" | "fixed"; orbSize: number
    onChange?: () => void
    style?: CSSProperties
}
const DEFAULTS = {
    start: "bear",
    bearColor: "#1E6DF6", lemonColor: "#EEF679", cloudColor: "#00CCFF", seacowColor: "#CF72D9",
    controls: true, uiColor: "#141416", swipe: true,
    autoplay: false, autoplayEvery: 5,
    play: true, every: 7, hoverTarget: "",
    follow: true, idle: true, blink: true, breathe: true, lean: true, tap: true,
    align: "center" as Props["align"], safeArea: true,
    sizing: "fill" as Props["sizing"], orbSize: 160,
}
const colorOf = (p: Props, b: number) => [p.bearColor, p.lemonColor, p.cloudColor, p.seacowColor][b]

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
    const opts = useRef(props); opts.current = props
    const api = useRef({ go: (_i: number, _dir?: number) => {}, gen: 0 })
    api.current.gen++                                            // a re-render may rewrite colours: the loop repaints them
    const rest = REST[startIdx], startRgb = rgbOf(colorOf(props, startIdx)), startFace = css(faceOf(startRgb))

    useEffect(() => {
        const svg = svgRef.current, wrap = wrapRef.current
        if (!svg || !wrap) return
        const root = rootRef.current!, body = bodyRef.current!, path = pathRef.current!, eyeL = eyeLRef.current!, eyeR = eyeRRef.current!
        const starL = starLRef.current!, starR = starRRef.current!, mouth = mouthRef.current!
        const canvas = RenderTarget.current() === RenderTarget.canvas
        const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
        const SNAP = new Float32Array(GP * GP)                   // the outline being morphed away from
        const LAST = new Float32Array(GP * GP)                   // this instance's last traced field, seeded with the resting shape
        fillField(piecesFor(startIdx, 0, 0, 0, 0, NO_ACT), SHAPE[startIdx][0], SHAPE[startIdx][1], LAST)
        const s = {
            cur: startIdx, morphT0: 0, dir: 1, su: Float64Array.from(SURF[startIdx]), su0: new Float64Array(4),
            rgb: startRgb.slice(), rgb0: startRgb.slice(), face: faceOf(startRgb).slice(), face0: [0, 0, 0],
            yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, hy: 0, hp: 0, hvy: 0, hvp: 0,
            eyeScale: 1, tEyeScale: 1, squash: 1, tSquash: 1,
            mouth: SMILE, tMouth: SMILE, side: 0, tSide: 0, len: 1, tLen: 1, tilt: 0, tTilt: 0,
            blink: 0, blinkT0: 0, blinkN: 0, poke: 0, pokeS: 0,
            manual: false, act: 0, actT0: 0, fadeT0: 0, last: 0,
            nextIdle: 0, nextBlink: 0, nextAct: 0, nextSlide: 0, hold: 0,
            px: 0, py: 0, pT: -1e9, rcx: 0, rcy: 0, rw: 240, rT: -1e9, hover: false,
            drag: 0, dragOn: false, dragX0: 0, dragT0: 0, dragMoved: 0, scale: 1,
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
        const go = (target: number, dir?: number) => {
            const n = DEFS.length, b = ((target % n) + n) % n
            if (b === s.cur && !s.morphT0) return
            const now = performance.now()
            stopAct()
            SNAP.set(LAST)                                                         // freeze the outline we are leaving
            s.su0.set(s.su); s.rgb0 = s.rgb.slice(); s.face0 = s.face.slice()
            s.dir = dir ?? (b > s.cur ? 1 : -1); s.cur = b; s.morphT0 = now; s.hold = now + 4000
            s.nextSlide = now + opts.current.autoplayEvery * 1000
            announce(b); setIndex(b); opts.current.onChange?.()
            wrap.dispatchEvent(new CustomEvent("orbslider:change", { bubbles: true, detail: { index: b, id: DEFS[b].id } }))
            if (!raf) paintStatic()
        }
        api.current.go = go

        // reduced motion and the canvas: no loop, the resting pose of the current slide
        const paintStatic = () => {
            const b = s.cur, c = rgbOf(colorOf(opts.current, b)), fc = css(faceOf(c)), r = REST[b]
            s.morphT0 = 0; s.su.set(SURF[b]); s.rgb = c.slice(); s.face = faceOf(c).slice()
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
                    if (s.cur === 0 && Math.random() < 0.5) playAct(1, now); else playQuickTurns(now)
                }
            }
            if (o.autoplay && !s.dragOn && !s.hover && now > s.hold && now > s.nextSlide && !s.act) go(s.cur + 1, 1)
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
            if (!s.dragOn) s.drag += (0 - s.drag) * (1 - Math.exp(-dt / 140))

            // act frame
            Object.assign(A, NO_ACT)
            if (s.act) {
                const t = now - s.actT0, ms = ACT_MS[s.act], run = ACT_RUN[s.act]!
                if (t >= ms) { Object.assign(FA, NO_ACT); run(ms / 1000, FA); s.act = 0; s.fadeT0 = now; s.manual = false; schedule(now) }
                else run(t / 1000, A)
            }
            if (!s.act && s.fadeT0) {
                const f = (now - s.fadeT0) / FADE
                if (f >= 1) s.fadeT0 = 0
                else { const e = 1 - easeIO(f); A.curve = s.mouth + ((FA.curve ?? s.mouth) - s.mouth) * e; A.len = s.len + ((FA.len ?? s.len) - s.len) * e; A.eyeScale = 1 + (FA.eyeScale - 1) * e; A.eyeSquash = 1 + (FA.eyeSquash - 1) * e; A.sy = 1 + (FA.sy - 1) * e }
            }

            // morph progress
            let e = 1, mb = 0
            if (s.morphT0) {
                const f = reduced ? 1 : (now - s.morphT0) / MORPH_MS
                if (f >= 1) s.morphT0 = 0
                else { e = easeIO(f); mb = clamp01(1 - Math.abs(f - 0.5) / 0.3) }          // the eyes close through the middle of the morph
            }
            const cT = rgbOf(colorOf(o, s.cur)), fT = faceOf(cT), suT = SURF[s.cur]
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
            put(eyeL, "transform", "l", eyeTf(-1, s.yaw, s.pitch, sx, sy, blink, s.su))
            put(eyeR, "transform", "r", eyeTf(1, s.yaw, s.pitch, sx, sy, blink, s.su))
            if (A.star > 0.001) {
                const us = sx * (1 + 0.38 * A.star)
                put(starL, "d", "sd", starD(A.star)); starR.setAttribute("d", cache.sd)
                put(starL, "transform", "sl", starTf(-1, s.yaw, s.pitch, us, s.su)); put(starR, "transform", "sr", starTf(1, s.yaw, s.pitch, us, s.su))
            }
            const sv = A.star > 0.001 ? "visible" : "hidden"
            if (cache.sv !== sv) { cache.sv = sv; const ev = sv === "visible" ? "hidden" : "visible"; starL.setAttribute("visibility", sv); starR.setAttribute("visibility", sv); eyeL.setAttribute("visibility", ev); eyeR.setAttribute("visibility", ev) }
            put(mouth, "d", "md", mouthD(A.curve ?? s.mouth, (A.len ?? s.len) * (1 - 0.5 * mb), s.side, sx))
            put(mouth, "transform", "mt", mouthTf(s.yaw, s.pitch, s.tilt, s.su))
            put(mouth, "stroke-width", "sw", "" + r1(MOUTH_STROKE * s.eyeScale))
            // body transform: lean, act start, morph nudge, drag with a slight tilt, pivoting on the bottom centre
            const nudge = s.morphT0 ? -s.dir * 10 * S(Math.PI * e) : 0, squish = s.morphT0 ? 1 - 0.05 * S(Math.PI * e) : 1
            const tx = (o.lean ? (s.yaw / MAX_YAW) * 3 : 0) + nudge + s.drag * 0.55, ty = (o.lean ? (-s.pitch / MAX_PITCH) * 2 : 0) + A.dy
            const th = Math.max(-8, Math.min(8, s.drag * 0.12)) * D2R, c = Math.cos(th), sn = Math.sin(th), syy = A.sy * squish, pX = CX, pY = CY + R
            const ma = c, mb2 = sn, mc = -sn * syy, md = c * syy
            put(body, "transform", "b", `matrix(${r3(ma)} ${r3(mb2)} ${r3(mc)} ${r3(md)} ${r1(pX - (ma * pX + mc * pY) + tx)} ${r1(pY - (mb2 * pX + md * pY) + ty)})`)
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
        const onMove = (e: PointerEvent) => {
            s.px = e.clientX; s.py = e.clientY; s.pT = performance.now()
            if (s.dragOn) { const dx = (e.clientX - s.dragX0) * toUnits(); s.drag = dx; s.dragMoved = Math.max(s.dragMoved, Math.abs(dx)) }
        }
        const onDown = (e: PointerEvent) => {
            if (opts.current.swipe && e.isPrimary) { s.dragOn = true; s.dragX0 = e.clientX; s.dragT0 = performance.now(); s.dragMoved = 0; s.drag = 0; try { svg.setPointerCapture(e.pointerId) } catch {} }
            else if (opts.current.tap) poke(performance.now())
        }
        const onUp = (e: PointerEvent) => {
            if (!s.dragOn) return
            s.dragOn = false
            const dx = (e.clientX - s.dragX0) * toUnits(), v = dx / Math.max(1, performance.now() - s.dragT0)
            if (s.dragMoved < 4) { if (opts.current.tap) poke(performance.now()); return }
            if (dx < -40 || v < -0.45) go(s.cur + 1, 1)
            else if (dx > 40 || v > 0.45) go(s.cur - 1, -1)
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
        svg.addEventListener("pointerdown", onDown)
        svg.addEventListener("pointerup", onUp); svg.addEventListener("pointercancel", onUp)
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
            svg.removeEventListener("pointerdown", onDown); svg.removeEventListener("pointerup", onUp); svg.removeEventListener("pointercancel", onUp)
            wrap.removeEventListener("keydown", onKey); wrap.removeEventListener("pointerenter", onEnter); wrap.removeEventListener("pointerleave", onLeave)
            document.removeEventListener("visibilitychange", onVis); document.removeEventListener("pointerover", onOver)
            window.removeEventListener("orbslider:next", onNext); window.removeEventListener("orbslider:prev", onPrev)
            window.removeEventListener("orbslider:go", onGo); window.removeEventListener("orbslider:surprise", onSurprise)
        }
    }, [])

    const ui = props.uiColor
    const arrow = (dir: number) => (
        <button type="button" aria-label={dir > 0 ? "Next mascot" : "Previous mascot"} onClick={() => api.current.go(index + dir, dir)}
            style={{ position: "absolute", top: "50%", [dir > 0 ? "right" : "left"]: 4, transform: "translateY(-50%)", width: 32, height: 32, padding: 0, border: 0, borderRadius: 16,
                background: "transparent", color: ui, opacity: 0.55, cursor: "pointer", display: "grid", placeItems: "center" } as CSSProperties}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d={dir > 0 ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
    )
    return (
        <div ref={wrapRef} role="group" aria-roledescription="carousel" aria-label="Mascots" tabIndex={0}
            style={{ position: "relative", width: "100%", height: "100%", aspectRatio: "1 / 1", outline: "none", ...props.style }}>
            <div style={{ position: "absolute", inset: props.controls ? "0 36px 24px 36px" : 0, display: "flex", pointerEvents: "none", ...(STAGE_ALIGN[props.align] || STAGE_ALIGN.center) }}>
            <svg ref={svgRef} viewBox={props.safeArea ? SAFE_VIEWBOX : "0 0 200 200"} preserveAspectRatio={ALIGN[props.align] || ALIGN.center}
                role="img" aria-label={`${DEFS[startIdx].name}, ${startIdx + 1} of ${DEFS.length}`}
                style={{ ...orbBox(props), display: "block", overflow: "visible", pointerEvents: "auto", touchAction: props.swipe ? "pan-y" : "auto", cursor: props.swipe ? "grab" : "default" }}>
                <g ref={rootRef}>
                    <g ref={bodyRef}>
                        <path ref={pathRef} d={rest.d} fill={css(startRgb)} />
                        <circle ref={eyeLRef} r={EYE_R} fill={startFace} transform={rest.eyeL} />
                        <circle ref={eyeRRef} r={EYE_R} fill={startFace} transform={rest.eyeR} />
                        <path ref={starLRef} fill={startFace} visibility="hidden" />
                        <path ref={starRRef} fill={startFace} visibility="hidden" />
                        <path ref={mouthRef} d={rest.mouthD} transform={rest.mouthTf} fill="none" stroke={startFace} strokeWidth={MOUTH_STROKE} strokeLinecap="round" />
                    </g>
                </g>
            </svg>
            </div>
            {props.controls && (<>
                {arrow(-1)}{arrow(1)}
                <div role="tablist" aria-label="Choose a mascot" style={{ position: "absolute", left: 0, right: 0, bottom: 2, display: "flex", justifyContent: "center", gap: 2 }}>
                    {DEFS.map((D, b) => (
                        <button key={D.id} type="button" role="tab" aria-selected={b === index} aria-label={D.name} onClick={() => api.current.go(b)}
                            style={{ width: 20, height: 20, padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}>
                            <span style={{ width: b === index ? 16 : 6, height: 6, borderRadius: 3, background: ui, opacity: b === index ? 0.9 : 0.3, transition: "width .25s, opacity .25s" }} />
                        </button>
                    ))}
                </div>
            </>)}
        </div>
    )
}

addPropertyControls(OrbSlider, {
    start: { type: ControlType.Enum, title: "Start at", options: IDS, optionTitles: DEFS.map(D => D.name), defaultValue: DEFAULTS.start },
    bearColor: { type: ControlType.Color, title: "Bear", defaultValue: DEFAULTS.bearColor },
    lemonColor: { type: ControlType.Color, title: "Lemon", defaultValue: DEFAULTS.lemonColor },
    cloudColor: { type: ControlType.Color, title: "Cloud", defaultValue: DEFAULTS.cloudColor },
    seacowColor: { type: ControlType.Color, title: "Seacow", defaultValue: DEFAULTS.seacowColor },
    controls: { type: ControlType.Boolean, title: "Arrows & dots", defaultValue: DEFAULTS.controls },
    uiColor: { type: ControlType.Color, title: "Arrows color", defaultValue: DEFAULTS.uiColor, hidden: (p: Props) => !p.controls },
    swipe: { type: ControlType.Boolean, title: "Swipe", defaultValue: DEFAULTS.swipe },
    autoplay: { type: ControlType.Boolean, title: "Autoplay", defaultValue: DEFAULTS.autoplay },
    autoplayEvery: { type: ControlType.Number, title: "Next every", min: 2, max: 30, step: 0.5, unit: "s", displayStepper: true, defaultValue: DEFAULTS.autoplayEvery, hidden: (p: Props) => !p.autoplay },
    play: { type: ControlType.Boolean, title: "Animations", enabledTitle: "Random", disabledTitle: "Off", defaultValue: DEFAULTS.play, description: "Quick turns on every body; New ears too on the bear." },
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
