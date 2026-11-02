// Ghost Orb: the catalog's Ghost, a rounded head with three tail bumps, as a self-contained Framer code component, in the BearOrb family.
// One <path> for the body (traced each frame from a distance field fitted to the catalog's outline:
// no SVG filters or masks), two eyes, a mouth, two hidden star shapes. A single requestAnimationFrame loop writes
// attributes through refs and stops off screen, in a hidden tab, on the Framer canvas and under reduced motion.
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useEffect, useRef } from "react"
import type { CSSProperties } from "react"

// ---------- the ghost, fixed ----------
const R = 96, CX = 100, CY = 100
const PIECES = [[0, -0.12, 0.84], [-0.48, 0.62, 0.3], [0, 0.7, 0.3], [0.48, 0.62, 0.3]]   // head and three tail bumps: x, y, r in fractions of R, y down
const HEAD_FOLLOW = 0.32, SPRING_K = 30, SPRING_D = 10              // a lazy spring: the tail trails the turn
const SOFT = 0.18, GROW = -0.003                                    // join softness and edge offset, fitted to the catalog outline
const FIT = 0.95                                                    // catalog size normalisation (extent of the pieces is 1.0 R)
const SU = [0, -0.12 * FIT, 0.84 * FIT, 0.84 * FIT]                // the face rides this sphere: cx, cy, rx, ry
const MAX_YAW = 20, MAX_PITCH = 15
const EYE_LON = 16, EYE_LAT = 4, EYE_R = 11
const MOUTH_DROP = 22, MOUTH_HW = 14, MOUTH_STROKE = 7.8, SMILE = 0.4
const A1_MS = 2500, A2_MS = 3300, SURPRISE = 1700, QUICK_TURNS = 2030, FADE = 380
const D2R = Math.PI / 180, TAU = Math.PI * 2, S = Math.sin
const r1 = (v: number) => Math.round(v * 10) / 10
const r3 = (v: number) => Math.round(v * 1000) / 1000
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
const pulse = (t: number, a: number, b: number) => Math.sin(Math.PI * seg(t, a, b))
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) }

// ---------- geometry ----------
const F = new Float64Array(7)
function frame(lonDeg: number, latDeg: number, yawDeg: number, pitchDeg: number) {
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
    const avg = (SU[2] + SU[3]) / 2, kx = SU[2] / avg, ky = SU[3] / avg
    F[0] = ex * kx; F[1] = -ey * ky; F[2] = -nx * kx; F[3] = ny * ky
    F[4] = CX + R * (SU[0] + SU[2] * px); F[5] = CY + R * (SU[1] - SU[3] * py); F[6] = pz
    return F
}
function headProject(p: number[], hy: number, hp: number) {
    const x = p[0], y = p[1], z0 = Math.sqrt(Math.max(0.02, 1 - x * x - y * y)), a = hy * D2R, b = hp * D2R
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b)
    const vx = x * ca + z0 * sa, z1 = -x * sa + z0 * ca, vy = -y * cb + z1 * sb, vz = y * sb + z1 * cb
    const depth = (z: number) => (z >= 0 ? 0.85 + 0.15 * z : 0.85 * Math.max(0, 1 + z / 0.6))
    return [vx, -vy, p[2] * (depth(vz) / depth(z0))]
}

// ---------- outline: smooth union of the pieces as a distance field, traced with marching squares ----------
const GN = 64, GL = 1.24, GS = (2 * GL) / GN, GP = GN + 1, NE = 2 * GN * GP
const G = new Float32Array(GP * GP)
const NEXT = new Int32Array(NE).fill(-1), EX = new Float32Array(NE), EY = new Float32Array(NE), SEEN = new Uint8Array(NE), USED = new Int32Array(NE)
const PX = new Float32Array(4096), PY = new Float32Array(4096)
function fillField(cs: number[][]) {
    const ik = 1 / SOFT, n = cs.length
    for (let j = 0, idx = 0; j < GP; j++) {
        const y = -GL + j * GS
        for (let i = 0; i < GP; i++, idx++) {
            const x = -GL + i * GS
            let d = 0
            for (let q = 0; q < n; q++) {
                const c = cs[q], dx = x - c[0], dy = y - c[1], sd = Math.sqrt(dx * dx + dy * dy) - c[2]
                if (q === 0) d = sd
                else { const h = Math.max(SOFT - Math.abs(d - sd), 0) * ik; d = Math.min(d, sd) - h * h * SOFT * 0.25 }
            }
            G[idx] = d - GROW
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
function contourPath() {
    let nu = 0
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
        const a = j * GP + i, f0 = G[a], f1 = G[a + 1], f2 = G[a + GP + 1], f3 = G[a + GP]
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
        d += `M${r1((PX[n - 1] + PX[0]) / 2)} ${r1((PY[n - 1] + PY[0]) / 2)}`
        for (let k = 0; k < n; k++) { const q = k + 1 < n ? k + 1 : 0; d += `Q${r1(PX[k])} ${r1(PY[k])} ${r1((PX[k] + PX[q]) / 2)} ${r1((PY[k] + PY[q]) / 2)}` }
        d += "Z"
    }
    for (let u = 0; u < nu; u++) { NEXT[USED[u]] = -1; SEEN[USED[u]] = 0 }
    return d
}

// ---------- scripted moments ----------
type Piece = number[]
type Act = { eyeScale: number; eyeSquash: number; rot: number; pivotY: number; sx: number; sy: number; dy: number; star: number; curve: number | null; len: number | null; tilt: number; orbit: number; look: number[] | null; pieces: ((cs: Piece[]) => Piece[]) | null }
const NO_ACT: Act = { eyeScale: 1, eyeSquash: 1, rot: 0, pivotY: 1, sx: 1, sy: 1, dy: 0, star: 0, curve: null, len: null, tilt: 0, orbit: 0, look: null, pieces: null }
// Tuck in: draws its tail up into the body, the skirt flattens while it holds, then the bumps snap back out
function act1(t: number, A: Act) {
    const sOf = (d: number) => { const tt = t - d; return tt < 0.9 ? easeIO(seg(tt, 0, 0.9)) : tt < 1.5 ? 1 : 1 - easeBack(seg(tt, 1.5, 2.3)) }
    const delay = [0, 0.08, 0, 0.08], held = Math.max(0, sOf(0))
    A.pieces = cs => cs.map((p, i) => { if (!i) return p; const sv = sOf(delay[i]), sp = Math.max(0, sv); return [p[0] * (1 - 0.3 * sp), p[1] - 0.55 * sv, p[2] * (1 - 0.45 * sp)] })
    A.sy = 1 - 0.07 * held; A.sx = 1 + 0.05 * held; A.eyeSquash = 1 - 0.35 * held
    A.curve = 0.4 - 0.9 * held + (t > 1.5 ? 0.6 * pulse(t, 1.5, 2.5) : 0)
}
// Piano: presses its tail bumps one after another like piano keys; the idle keys shrink and lean away
function act2(t: number, A: Act) {
    const order = [1, 2, 3, 2, 1, 2, 3, 3, 2], step = 0.36, k = Math.min(order.length - 1, Math.floor(t / step)), u = (t % step) / step, pr = t < order.length * step ? S(Math.PI * u) : 0, key = order[k]
    A.pieces = cs => { const kx = cs[key][0]; return cs.map((p, i) => { if (!i) return p; if (i === key) return [p[0], p[1] + 0.09 * pr, p[2] * (1 - 0.12 * pr)]; const away = Math.sign(p[0] - kx) || (i < key ? -1 : 1); return [p[0] + away * 0.06 * pr, p[1] - 0.03 * pr, p[2] * (1 - 0.15 * pr)] }) }
    A.look = [0, -14]; A.dy = 1.5 * pr; A.curve = 0.5 + 0.35 * pr; A.len = 0.7 + 0.2 * pr; A.tilt = (key - 2) * 7 * pr
}
// Surprised: star eyes, a wide smile, a small start
function surprised(t: number, A: Act) {
    const k = Math.min(easeBack(seg(t, 0, 0.28)), 1 - easeIO(seg(t, 1.2, 1.6))), p = pulse(t, 0, 0.35)
    A.star = clamp01(k); A.eyeScale = 1 + 0.2 * k; A.curve = 0.4 + 0.5 * k; A.len = 1 - 0.25 * k; A.dy = -5 * p; A.sy = 1 + 0.03 * p
}
const ACT_RUN = [null, act1, act2, surprised], ACT_MS = [0, A1_MS, A2_MS, SURPRISE]

function piecesFor(t: number, poke: number, hy: number, hp: number, A: Act, vel = 0) {
    const amp = 0.025 + Math.min(0.03, Math.abs(vel) / 2500)              // the tail waves, harder when the head moves
    let cs: Piece[] = PIECES.map((p, i) => (i === 0 ? p : [p[0], p[1] + S((t * TAU) / 1.7 + i * 1.2) * amp + poke * 0.012, p[2] * (1 + poke * 0.02)]))
    if (A.pieces) cs = A.pieces(cs)
    return cs.map((p, i) => { const q = [p[0] * FIT, p[1] * FIT, p[2] * FIT]; return i === 0 ? q : headProject(q, hy, hp) })
}

// ---------- face ----------
function eyeTf(side: number, yaw: number, pitch: number, sx: number, sy: number, blink: number) {
    const m = frame(side * EYE_LON, EYE_LAT, yaw, pitch), ty = blink * EYE_R * 2 * 0.08
    return `matrix(${r3(m[0] * sx)} ${r3(m[1] * sx)} ${r3(m[2] * sy)} ${r3(m[3] * sy)} ${r1(m[4] + m[2] * ty)} ${r1(m[5] + m[3] * ty)})`
}
function mouthD(curve: number, len: number, side: number, scale: number) {
    const hw = MOUTH_HW * scale * len, hl = hw * (1 - 0.7 * Math.max(0, side)), hr = hw * (1 - 0.7 * Math.max(0, -side))
    return `M${r1(-hl)} 0Q${r1((hr - hl) / 2)} ${r1(((curve * (hl + hr)) / 2) * 1.15)} ${r1(hr)} 0`
}
function mouthTf(yaw: number, pitch: number, tilt: number) {
    const m = frame(0, EYE_LAT - MOUTH_DROP, yaw, pitch)
    return `matrix(${r3(m[0])} ${r3(m[1])} ${r3(m[2])} ${r3(m[3])} ${r1(m[4])} ${r1(m[5])})` + (tilt ? ` rotate(${r1(tilt)})` : "")
}
function starD(star: number) {
    const pt = (i: number) => { const a = -Math.PI / 2 + (i % 10) * Math.PI / 5, rr = EYE_R * (1 + star * (i % 2 ? -0.55 : 0.28)); return [Math.cos(a) * rr, Math.sin(a) * rr] }
    const last = pt(9), first = pt(0)
    let d = `M${r1((last[0] + first[0]) / 2)} ${r1((last[1] + first[1]) / 2)}`
    for (let i = 0; i < 10; i++) { const p = pt(i), q = pt(i + 1); d += `Q${r1(p[0])} ${r1(p[1])} ${r1((p[0] + q[0]) / 2)} ${r1((p[1] + q[1]) / 2)}` }
    return d + "Z"
}
function starTf(side: number, yaw: number, pitch: number, scale: number) {
    const m = frame(side * EYE_LON, EYE_LAT, yaw, pitch)
    return `translate(${r1(m[4])} ${r1(m[5])}) scale(${r3(scale)})`
}

// the resting pose, also what the server and the Framer canvas render
fillField(piecesFor(0, 0, 0, 0, NO_ACT))
const REST = { d: contourPath(), eyeL: eyeTf(-1, 0, 0, 1, 1, 0), eyeR: eyeTf(1, 0, 0, 1, 1, 0), mouthD: mouthD(SMILE, 1, 0, 1), mouthTf: mouthTf(0, 0, 0) }

// ---------- frame fit ----------
const SAFE_VIEWBOX = "-11 -11 222 222"
const ALIGN: Record<string, string> = { center: "xMidYMid meet", top: "xMidYMin meet", bottom: "xMidYMax meet", left: "xMinYMid meet", right: "xMaxYMid meet" }
const STAGE_ALIGN: Record<string, CSSProperties> = {
    center: { alignItems: "center", justifyContent: "center" }, top: { alignItems: "flex-start", justifyContent: "center" },
    bottom: { alignItems: "flex-end", justifyContent: "center" }, left: { alignItems: "center", justifyContent: "flex-start" },
    right: { alignItems: "center", justifyContent: "flex-end" },
}
const orbBox = (p: { sizing: string; orbSize: number }): CSSProperties =>
    p.sizing === "fixed" ? { width: `min(${p.orbSize}px, 100%)`, height: `min(${p.orbSize}px, 100%)`, flex: "none" } : { width: "100%", height: "100%" }

type Props = {
    color: string; faceColor: string
    follow: boolean; idle: boolean; blink: boolean; breathe: boolean; lean: boolean; tap: boolean
    play: boolean; tuck: boolean; piano: boolean; quickTurns: boolean; every: number
    hoverTarget: string
    sizing: "fill" | "fixed"; orbSize: number
    align: "center" | "top" | "bottom" | "left" | "right"; safeArea: boolean
    style?: CSSProperties
}
const DEFAULTS = {
    color: "#CF72D9", faceColor: "#141416",
    follow: true, idle: true, blink: true, breathe: true, lean: true, tap: true,
    play: true, tuck: true, piano: true, quickTurns: true, every: 7,
    hoverTarget: "",
    sizing: "fill" as Props["sizing"], orbSize: 160,
    align: "center" as Props["align"], safeArea: true,
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 240
 * @framerIntrinsicHeight 240
 */
export default function GhostOrb(input: Partial<Props>) {
    const props: Props = { ...DEFAULTS, ...input }
    const { color, faceColor, style } = props
    const svgRef = useRef<SVGSVGElement>(null), rootRef = useRef<SVGGElement>(null), bodyRef = useRef<SVGGElement>(null)
    const pathRef = useRef<SVGPathElement>(null), eyeLRef = useRef<SVGCircleElement>(null), eyeRRef = useRef<SVGCircleElement>(null), mouthRef = useRef<SVGPathElement>(null)
    const starLRef = useRef<SVGPathElement>(null), starRRef = useRef<SVGPathElement>(null)
    const opts = useRef(props); opts.current = props

    useEffect(() => {
        const svg = svgRef.current
        if (!svg || RenderTarget.current() === RenderTarget.canvas) return
        if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return
        const root = rootRef.current!, body = bodyRef.current!, path = pathRef.current!, eyeL = eyeLRef.current!, eyeR = eyeRRef.current!, mouth = mouthRef.current!, starL = starLRef.current!, starR = starRRef.current!

        const s = {
            yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, hy: 0, hp: 0, hvy: 0, hvp: 0,
            eyeScale: 1, tEyeScale: 1, squash: 1, tSquash: 1,
            mouth: SMILE, tMouth: SMILE, side: 0, tSide: 0, len: 1, tLen: 1, tilt: 0, tTilt: 0,
            blink: 0, blinkT0: 0, blinkN: 0, poke: 0, pokeS: 0,
            manual: false, act: 0, actT0: 0, fadeT0: 0, last: 0,
            nextIdle: 0, nextBlink: 0, nextAct: 0, lastKey: "",
            px: 0, py: 0, pT: -1e9, rcx: 0, rcy: 0, rw: 240, rT: -1e9,
        }
        const A: Act = { ...NO_ACT }, FA: Act = { ...NO_ACT }
        let tl: { at: number; fn: () => void }[] = []
        const cache: Record<string, string> = { d: REST.d, l: REST.eyeL, r: REST.eyeR, md: REST.mouthD, mt: REST.mouthTf, sv: "hidden" }
        const put = (el: Element, name: string, key: string, v: string) => { if (cache[key] !== v) { cache[key] = v; el.setAttribute(name, v) } }
        const look = (y: number, p: number) => { s.tYaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, y)); s.tPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p)) }
        const startBlink = (now: number, n: number) => { if (!s.blinkN) { s.blinkN = n; s.blinkT0 = now } }
        const schedule = (now: number) => { s.nextAct = now + opts.current.every * 1000 * (0.6 + 0.8 * Math.random()) }
        const resetFace = () => { s.tMouth = SMILE; s.tSide = 0; s.tLen = 1; s.tTilt = 0; s.tEyeScale = 1; s.tSquash = 1 }
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
            if (s.act || s.manual) return
            s.poke = 1; s.tEyeScale = 1.22; s.tSquash = 1.1; s.tMouth = 0.5; s.tLen = 0.55
            tl = [{ at: now + 420, fn: () => { resetFace(); startBlink(now + 420, 1) } }]
        }
        // Surprised cuts into quick turns and idle; it waits out Tuck in and Piano
        const surprise = (now: number) => { if (!raf || s.act) return; resetFace(); playAct(3, now) }

        let raf = 0, visible = true
        const tick = (now: number) => {
            raf = 0
            const o = opts.current, dt = Math.min(64, now - s.last); s.last = now
            while (tl.length && now >= tl[0].at) tl.shift()!.fn()

            if (!s.manual) {
                if (o.follow && now - s.pT < 4000) {
                    if (now - s.rT > 300) { const m = svg.getScreenCTM(); if (m) { s.rcx = m.a * CX + m.e; s.rcy = m.d * CY + m.f; s.rw = m.a * 200 } s.rT = now }
                    const k = Math.max(120, s.rw * 0.9)
                    look(MAX_YAW * (2 / Math.PI) * Math.atan((s.px - s.rcx) / k), -MAX_PITCH * (2 / Math.PI) * Math.atan((s.py - s.rcy) / k))
                    s.nextIdle = now + 1200
                } else if (o.idle && now > s.nextIdle) {
                    const home = Math.random() < 0.35
                    look(home ? 0 : (Math.random() * 2 - 1) * MAX_YAW * 0.55, home ? 0 : (Math.random() * 2 - 1) * MAX_PITCH * 0.4)
                    s.nextIdle = now + 1200 + Math.random() * 2600
                }
                if (o.play && !s.act && now > s.nextAct) {
                    const pool: ((n: number) => void)[] = []
                    if (o.tuck) pool.push(n => playAct(1, n)); if (o.piano) pool.push(n => playAct(2, n)); if (o.quickTurns) pool.push(playQuickTurns)
                    if (pool.length) pool[(Math.random() * pool.length) | 0](now); else schedule(now)
                }
            }
            if (o.blink && now > s.nextBlink && !s.act) { startBlink(now, Math.random() < 0.2 ? 2 : 1); s.nextBlink = now + 2000 + Math.random() * 4000 }
            if (s.blinkN) {
                const t = now - s.blinkT0, total = 280 * s.blinkN + 110 * (s.blinkN - 1)
                if (t >= total) { s.blink = 0; s.blinkN = 0 }
                else { const c = t % 390; s.blink = c < 90 ? (c / 90) * (c / 90) : c < 130 ? 1 : c < 280 ? (1 - (c - 130) / 150) * (1 - (c - 130) / 150) : 0 }
            }

            const k = 1 - Math.exp(-dt / 70), k2 = 1 - Math.exp(-dt / 90), h = Math.min(dt, 40) / 1000
            s.yaw += (s.tYaw - s.yaw) * k; s.pitch += (s.tPitch - s.pitch) * k
            s.hvy += ((s.yaw * HEAD_FOLLOW - s.hy) * SPRING_K - s.hvy * SPRING_D) * h; s.hy += s.hvy * h
            s.hvp += ((s.pitch * HEAD_FOLLOW - s.hp) * SPRING_K - s.hvp * SPRING_D) * h; s.hp += s.hvp * h
            s.eyeScale += (s.tEyeScale - s.eyeScale) * k2; s.squash += (s.tSquash - s.squash) * k2
            s.mouth += (s.tMouth - s.mouth) * k2; s.side += (s.tSide - s.side) * k2; s.len += (s.tLen - s.len) * k2; s.tilt += (s.tTilt - s.tilt) * k2
            s.poke *= Math.exp(-dt / 420); if (s.poke < 0.002) s.poke = 0
            s.pokeS += (s.poke - s.pokeS) * (1 - Math.exp(-dt / 90))

            Object.assign(A, NO_ACT)
            if (s.act) {
                const t = Math.max(0, now - s.actT0), ms = ACT_MS[s.act], run = ACT_RUN[s.act]!
                if (t >= ms) { Object.assign(FA, NO_ACT); run(ms / 1000, FA); s.act = 0; s.fadeT0 = now; s.manual = false; schedule(now) }
                else { run(t / 1000, A); if (A.look) look(A.look[0], A.look[1]) }
            }
            if (!s.act && s.fadeT0) {
                const f = (now - s.fadeT0) / FADE
                if (f >= 1) s.fadeT0 = 0
                else { const e = 1 - easeIO(f); A.curve = s.mouth + ((FA.curve ?? s.mouth) - s.mouth) * e; A.len = s.len + ((FA.len ?? s.len) - s.len) * e; A.eyeScale = 1 + (FA.eyeScale - 1) * e; A.eyeSquash = 1 + (FA.eyeSquash - 1) * e; A.sy = 1 + (FA.sy - 1) * e; A.sx = 1 + (FA.sx - 1) * e }
            }

            // outline: traced again only when the pieces moved
            const cs = piecesFor(now / 1000, s.pokeS, s.hy, s.hp, A, s.hvy / HEAD_FOLLOW), key = cs.map(p => p.map(v => v.toFixed(4)).join(",")).join(";")
            if (key !== s.lastKey) { s.lastKey = key; fillField(cs); put(path, "d", "d", contourPath()) }

            const sx = s.eyeScale * A.eyeScale, sy = s.eyeScale * s.squash * (1 - s.blink * 0.94) * A.eyeSquash
            put(eyeL, "transform", "l", eyeTf(-1, s.yaw, s.pitch, sx, sy, s.blink))
            put(eyeR, "transform", "r", eyeTf(1, s.yaw, s.pitch, sx, sy, s.blink))
            if (A.star > 0.001) {
                const us = sx * (1 + 0.38 * A.star)
                put(starL, "d", "sd", starD(A.star)); starR.setAttribute("d", cache.sd)
                put(starL, "transform", "sl", starTf(-1, s.yaw, s.pitch, us)); put(starR, "transform", "sr", starTf(1, s.yaw, s.pitch, us))
            }
            const sv = A.star > 0.001 ? "visible" : "hidden"
            if (cache.sv !== sv) { cache.sv = sv; const ev = sv === "visible" ? "hidden" : "visible"; starL.setAttribute("visibility", sv); starR.setAttribute("visibility", sv); eyeL.setAttribute("visibility", ev); eyeR.setAttribute("visibility", ev) }
            put(mouth, "d", "md", mouthD(A.curve ?? s.mouth, A.len ?? s.len, s.side, sx))
            put(mouth, "transform", "mt", mouthTf(s.yaw, s.pitch, s.tilt + A.tilt))
            put(mouth, "stroke-width", "sw", "" + r1(MOUTH_STROKE * s.eyeScale))
            // body: lean and the start, then the act's squash about its pivot
            const tx = o.lean ? (s.yaw / MAX_YAW) * 3 : 0, ty = (o.lean ? (-s.pitch / MAX_PITCH) * 2 : 0) + A.dy
            const th = A.rot * D2R, c = Math.cos(th), sn = Math.sin(th), pX = CX, pY = CY + R * A.pivotY
            const ma = c * A.sx, mb = sn * A.sx, mc = -sn * A.sy, md = c * A.sy
            put(body, "transform", "b", `matrix(${r3(ma)} ${r3(mb)} ${r3(mc)} ${r3(md)} ${r1(pX - (ma * pX + mc * pY) + tx)} ${r1(pY - (mb * pX + md * pY) + ty)})`)
            const br = o.breathe ? 1 + 0.012 * Math.sin((now / 3200) * TAU) : 1
            put(root, "transform", "o", `matrix(${r3(br)} 0 0 ${r3(br)} ${r1(CX * (1 - br))} ${r1(CY * (1 - br))})`)

            if (visible) raf = requestAnimationFrame(tick)
        }

        const start = () => { if (raf || !visible || document.hidden) return; const now = performance.now(); s.last = now; if (!s.nextBlink) { s.nextBlink = now + 1500; s.nextIdle = now + 800; schedule(now) } raf = requestAnimationFrame(tick) }
        const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }
        const onMove = (e: PointerEvent) => { s.px = e.clientX; s.py = e.clientY; s.pT = performance.now() }
        const onDown = () => { if (opts.current.tap) poke(performance.now()) }
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
        const onEvent = () => surprise(performance.now())
        const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; visible ? start() : stop() }) : null
        io?.observe(svg)
        window.addEventListener("pointermove", onMove, { passive: true })
        svg.addEventListener("pointerdown", onDown)
        document.addEventListener("visibilitychange", onVis)
        document.addEventListener("pointerover", onOver, { passive: true })
        window.addEventListener("ghostorb:surprise", onEvent)
        start()
        return () => { stop(); io?.disconnect(); window.removeEventListener("pointermove", onMove); svg.removeEventListener("pointerdown", onDown); document.removeEventListener("visibilitychange", onVis); document.removeEventListener("pointerover", onOver); window.removeEventListener("ghostorb:surprise", onEvent) }
    }, [])

    return (
        <div style={{ width: "100%", height: "100%", aspectRatio: "1 / 1", display: "flex", ...(STAGE_ALIGN[props.align] || STAGE_ALIGN.center), ...style }}>
        <svg ref={svgRef} viewBox={props.safeArea ? SAFE_VIEWBOX : "0 0 200 200"} preserveAspectRatio={ALIGN[props.align] || ALIGN.center}
            role="img" aria-label="Ghost mascot"
            style={{ ...orbBox(props), display: "block", overflow: "visible" }}>
            <g ref={rootRef}>
                <g ref={bodyRef}>
                    <path ref={pathRef} d={REST.d} fill={color} />
                    <circle ref={eyeLRef} r={EYE_R} fill={faceColor} transform={REST.eyeL} />
                    <circle ref={eyeRRef} r={EYE_R} fill={faceColor} transform={REST.eyeR} />
                    <path ref={starLRef} fill={faceColor} visibility="hidden" />
                    <path ref={starRRef} fill={faceColor} visibility="hidden" />
                    <path ref={mouthRef} d={REST.mouthD} transform={REST.mouthTf} fill="none" stroke={faceColor} strokeWidth={MOUTH_STROKE} strokeLinecap="round" />
                </g>
            </g>
        </svg>
        </div>
    )
}

addPropertyControls(GhostOrb, {
    color: { type: ControlType.Color, title: "Body", defaultValue: DEFAULTS.color },
    faceColor: { type: ControlType.Color, title: "Face", defaultValue: DEFAULTS.faceColor },
    play: { type: ControlType.Boolean, title: "Animations", enabledTitle: "Random", disabledTitle: "Off", defaultValue: DEFAULTS.play },
    tuck: { type: ControlType.Boolean, title: "Tuck in", defaultValue: DEFAULTS.tuck, hidden: (p: Props) => !p.play },
    piano: { type: ControlType.Boolean, title: "Piano", defaultValue: DEFAULTS.piano, hidden: (p: Props) => !p.play },
    quickTurns: { type: ControlType.Boolean, title: "Quick turns", defaultValue: DEFAULTS.quickTurns, hidden: (p: Props) => !p.play },
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
    safeArea: { type: ControlType.Boolean, title: "Safe area", defaultValue: DEFAULTS.safeArea, description: "Room for every pose, so a clipping Frame never cuts the ghost." },
})
