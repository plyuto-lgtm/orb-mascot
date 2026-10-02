// Bear Orb: a self-contained Framer code component.
// One <path> for the body (analytic fillets, no SVG filters or masks), two circles and one stroke for the face.
// Animation runs in a single requestAnimationFrame loop that writes attributes through refs: no React re-renders,
// no work while off screen, in a hidden tab, on the Framer canvas, or under prefers-reduced-motion.
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useEffect, useRef } from "react"
import type { CSSProperties } from "react"

// ---------- the bear, fixed ----------
const R = 96, CX = 100, CY = 100                       // body radius and centre in a 200 x 200 box
const HEAD = [0, 0.05, 0.9]                            // core piece: x, y, r in fractions of R, y down
const EARS = [[-0.6, -0.62, 0.32], [0.6, -0.62, 0.32]]
const SPHERE = 0.88, SURF_CY = 0.05                    // inner sphere the face rides on
const HEAD_FOLLOW = 0.35, SPRING_K = 60, SPRING_D = 14 // ears follow the gaze through a spring
const MAX_YAW = 20, MAX_PITCH = 15
const EYE_LON = 16, EYE_LAT = 4, EYE_R = 11
const MOUTH_DROP = 22, MOUTH_HW = 14, MOUTH_STROKE = 7.8, SMILE = 0.4
const FILLET = 20, EAR_TRIM = 60, NECK = 12             // join radius, small-circle shrink (r' = sqrt(r^2 - trim)) and neck reach, fitted to the catalog's blur shape
const D2R = Math.PI / 180, TAU = Math.PI * 2
const r1 = (v: number) => Math.round(v * 10) / 10
const r3 = (v: number) => Math.round(v * 1000) / 1000
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
const pulse = (t: number, a: number, b: number) => Math.sin(Math.PI * seg(t, a, b))
const easeIn = (t: number) => t * t * t
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) }

// ---------- geometry ----------
// tangent frame of a point on the face sphere after the head turn, as an SVG matrix (6 numbers) plus depth
const F = new Float64Array(7)
function frame(lonDeg: number, latDeg: number, yawDeg: number, pitchDeg: number) {
    const lon = lonDeg * D2R, lat = latDeg * D2R, y = yawDeg * D2R, p = pitchDeg * D2R
    const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p)
    const sl = Math.sin(lon), cl = Math.cos(lon), sa = Math.sin(lat), ca = Math.cos(lat)
    // P: the point, E: east, N: north; each rotated by yaw about Y, then pitch about X
    let vx = sl * ca, vy = sa, vz = cl * ca
    let x = vx * cy + vz * sy, z = -vx * sy + vz * cy
    const px = x, py = vy * cp + z * sp, pz = -vy * sp + z * cp
    vx = cl; vz = -sl
    x = vx * cy + vz * sy; z = -vx * sy + vz * cy
    const ex = x, ey = z * sp
    vx = -sl * sa; vy = ca; vz = -cl * sa
    x = vx * cy + vz * sy; z = -vx * sy + vz * cy
    const nx = x, ny = vy * cp + z * sp
    F[0] = ex; F[1] = -ey; F[2] = -nx; F[3] = ny
    F[4] = CX + R * SPHERE * px; F[5] = CY + R * (SURF_CY - SPHERE * py); F[6] = pz
    return F
}

// an ear circle carried around the head sphere by the head angles; writes px x, y, r into out
function projectEar(x: number, y: number, r: number, hyDeg: number, hpDeg: number, out: number[], o: number) {
    const z0 = Math.sqrt(Math.max(0.02, 1 - x * x - y * y)), a = hyDeg * D2R, b = hpDeg * D2R
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b)
    const vx = x * ca + z0 * sa, z1 = -x * sa + z0 * ca, vy = -y * cb + z1 * sb, vz = y * sb + z1 * cb
    const depth = (z: number) => (z >= 0 ? 0.85 + 0.15 * z : 0.85 * Math.max(0, 1 + z / 0.6))
    out[o] = CX + vx * R; out[o + 1] = CY - vy * R; out[o + 2] = r * R * (depth(vz) / depth(z0))
}

// union of the head and its ears as one path, with a concave fillet where each ear meets the head.
// An ear that has pulled away keeps a thinning neck for a short distance, then becomes its own circle.
const circle = (x: number, y: number, r: number) => `M${r1(x - r)} ${r1(y)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0Z`
const J: { th: number; al: number; x: number; y: number; r: number; f: number }[] = [
    { th: 0, al: 0, x: 0, y: 0, r: 0, f: 0 }, { th: 0, al: 0, x: 0, y: 0, r: 0, f: 0 },
]
function bodyPath(ears: number[]) {
    const hx = CX + HEAD[0] * R, hy = CY + HEAD[1] * R, hr = HEAD[2] * R
    let n = 0, extra = ""
    for (let i = 0; i < ears.length; i += 3) {
        const x = ears[i], y = ears[i + 1], r = Math.sqrt(Math.max(0, ears[i + 2] * ears[i + 2] - EAR_TRIM))   // the blur eats small circles; so does this
        if (r < 0.6) continue
        const dx = x - hx, dy = y - hy, d = Math.hypot(dx, dy), gap = d - hr - r
        if (d + r <= hr + 0.3) continue                                   // swallowed by the head
        let f = Math.min(FILLET, r * 1.2 + 1.5)                           // small bumps take small fillets
        if (gap > 0) f *= Math.max(0, 1 - gap / NECK)
        if (f < 0.4 || gap >= 2 * f) { extra += circle(x, y, r); continue } // detached
        const a = hr + f, b = r + f, c = (a * a + d * d - b * b) / (2 * a * d)
        if (c >= 1 || c <= -1) { extra += circle(x, y, r); continue }
        const j = J[n++]; j.th = Math.atan2(dy, dx); j.al = Math.acos(c); j.x = x; j.y = y; j.r = r; j.f = f
    }
    if (!n) return circle(hx, hy, hr) + extra
    if (n === 2 && J[0].th > J[1].th) { const t = J[0]; J[0] = J[1]; J[1] = t }
    let cur = J[0].th + J[0].al
    let d = `M${r1(hx + hr * Math.cos(cur))} ${r1(hy + hr * Math.sin(cur))}`
    for (let k = 1; k <= n; k++) {
        const e = J[k % n], a1 = e.th - e.al, a2 = e.th + e.al, q = e.r / (e.r + e.f), hf = hr + e.f
        let span = (a1 - cur) % TAU; if (span < 0) span += TAU
        d += `A${r1(hr)} ${r1(hr)} 0 ${span > Math.PI ? 1 : 0} 1 ${r1(hx + hr * Math.cos(a1))} ${r1(hy + hr * Math.sin(a1))}`
        const t1x = e.x + (hx + hf * Math.cos(a1) - e.x) * q, t1y = e.y + (hy + hf * Math.sin(a1) - e.y) * q
        const t2x = e.x + (hx + hf * Math.cos(a2) - e.x) * q, t2y = e.y + (hy + hf * Math.sin(a2) - e.y) * q
        let es = (Math.atan2(t2y - e.y, t2x - e.x) - Math.atan2(t1y - e.y, t1x - e.x)) % TAU; if (es < 0) es += TAU
        d += `A${r1(e.f)} ${r1(e.f)} 0 0 0 ${r1(t1x)} ${r1(t1y)}`
        d += `A${r1(e.r)} ${r1(e.r)} 0 ${es > Math.PI ? 1 : 0} 1 ${r1(t2x)} ${r1(t2y)}`
        d += `A${r1(e.f)} ${r1(e.f)} 0 0 0 ${r1(hx + hr * Math.cos(a2))} ${r1(hy + hr * Math.sin(a2))}`
        cur = a2
    }
    return d + "Z" + extra
}

// ---------- pose -> attribute strings ----------
type Act = { eyeScale: number; eyeSquash: number; sy: number; dy: number; star: number; curve: number | null; len: number | null; up: number; grow: number; phase: number }
const NO_ACT: Act = { eyeScale: 1, eyeSquash: 1, sy: 1, dy: 0, star: 0, curve: null, len: null, up: 0, grow: 1, phase: 0 }
const EAR_BUF = [0, 0, 0, 0, 0, 0]

function bodyD(hy: number, hp: number, poke: number, A: Act) {
    for (let i = 0; i < 2; i++) {
        let x = EARS[i][0], y = EARS[i][1] + poke * 0.02, r = EARS[i][2] * (1 - poke * 0.03)
        if (A.phase === 1) { x *= 1 + 0.15 * A.up; y -= 0.5 * A.up; r *= 1 - A.up }                                    // pulled up and off
        else if (A.phase === 2) { x *= 0.7 + 0.3 * A.grow; y = -0.3 + (y + 0.3) * A.grow; r *= Math.max(0, A.grow) }   // grown back out of the head
        projectEar(x, y, r, hy, hp, EAR_BUF, i * 3)
    }
    return bodyPath(EAR_BUF)
}
function eyeTf(side: number, yaw: number, pitch: number, sx: number, sy: number, blink: number) {
    const m = frame(side * EYE_LON, EYE_LAT, yaw, pitch), ty = blink * EYE_R * 2 * 0.08
    return `matrix(${r3(m[0] * sx)} ${r3(m[1] * sx)} ${r3(m[2] * sy)} ${r3(m[3] * sy)} ${r1(m[4] + m[2] * ty)} ${r1(m[5] + m[3] * ty)})`
}
function mouthD(curve: number, len: number, side: number, scale: number) {
    const hw = MOUTH_HW * scale * len, hl = hw * (1 - 0.7 * Math.max(0, side)), hr = hw * (1 - 0.7 * Math.max(0, -side))
    return `M${r1(-hl)} 0Q${r1((hr - hl) / 2)} ${r1(curve * (hl + hr) / 2 * 1.15)} ${r1(hr)} 0`
}
function mouthTf(yaw: number, pitch: number, tilt: number) {
    const m = frame(0, EYE_LAT - MOUTH_DROP, yaw, pitch)
    return `matrix(${r3(m[0])} ${r3(m[1])} ${r3(m[2])} ${r3(m[3])} ${r1(m[4])} ${r1(m[5])})` + (tilt ? ` rotate(${r1(tilt)})` : "")
}

function starD(star: number) {
    let px = 0, py = 0, fx = 0, fy = 0, d = ""
    for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i % 10) * Math.PI / 5, rr = EYE_R * (1 + star * ((i % 10) % 2 ? -0.55 : 0.28)), x = Math.cos(a) * rr, y = Math.sin(a) * rr
        if (i === 0) { fx = x; fy = y } else d += `Q${r1(px)} ${r1(py)} ${r1((px + x) / 2)} ${r1((py + y) / 2)}`
        px = x; py = y
    }
    // start on the midpoint of the last edge so the outline closes smoothly through the first vertex
    const lx = Math.cos(-Math.PI / 2 + 9 * Math.PI / 5) * EYE_R * (1 - star * 0.55), ly = Math.sin(-Math.PI / 2 + 9 * Math.PI / 5) * EYE_R * (1 - star * 0.55)
    return `M${r1((lx + fx) / 2)} ${r1((ly + fy) / 2)}` + d + "Z"
}
function starTf(side: number, yaw: number, pitch: number, scale: number) {
    const m = frame(side * EYE_LON, EYE_LAT, yaw, pitch)
    return `translate(${r1(m[4])} ${r1(m[5])}) scale(${r3(scale)})`                // stars stay upright and round
}

// the resting pose, also what the server and the Framer canvas render
const REST = {
    d: bodyD(0, 0, 0, NO_ACT),
    eyeL: eyeTf(-1, 0, 0, 1, 1, 0),
    eyeR: eyeTf(1, 0, 0, 1, 1, 0),
    mouthD: mouthD(SMILE, 1, 0, 1),
    mouthTf: mouthTf(0, 0, 0),
}

// ---------- scripted moments ----------
const NEW_EARS = 3250, QUICK_TURNS = 2030, SURPRISE = 1700, FADE = 380
const ACT_MS = [0, NEW_EARS, SURPRISE]                 // act ids: 1 new ears, 2 surprised
// New ears: the ears pull up and off and fade, then fresh ones grow back out of the head
function newEars(t: number, A: Act) {
    A.eyeScale = 1 + 0.2 * pulse(t, 0, 0.4)
    A.eyeSquash = 1 - 0.3 * pulse(t, 0.4, 1.4)
    if (t < 1.9) {
        A.phase = 1; A.up = easeIn(seg(t, 0.4, 1.4)); A.grow = 0
        A.curve = 0.4 - 0.9 * pulse(t, 0.3, 1.5); A.len = 1 - 0.25 * pulse(t, 0.3, 1.5); A.sy = 1
    } else {
        A.phase = 2; A.up = 0; A.grow = easeBack(seg(t, 1.9, 3.1))
        const g = Math.min(1, A.grow)
        A.curve = 0.4 + 0.6 * g; A.len = 1 + 0.25 * g; A.sy = 1 - 0.04 * pulse(t, 1.9, 2.5)
    }
}

// Surprised: the eyes flash into stars and grow, the mouth shrinks to a short oh, the body gives a small start
function surprised(t: number, A: Act) {
    const k = Math.min(easeBack(seg(t, 0, 0.28)), 1 - easeIO(seg(t, 1.2, 1.6))), p = pulse(t, 0, 0.35)
    A.star = clamp01(k); A.eyeScale = 1 + 0.2 * k
    A.curve = 0.4 + 0.5 * k; A.len = 1 - 0.25 * k
    A.dy = -5 * p; A.sy = 1 + 0.03 * p
}
const ACTS = [newEars, newEars, surprised]

type Props = {
    color: string; faceColor: string
    follow: boolean; idle: boolean; blink: boolean; breathe: boolean; lean: boolean; tap: boolean
    play: boolean; newEars: boolean; quickTurns: boolean; every: number
    hoverTarget: string
    style?: CSSProperties
}
const DEFAULTS = {
    hoverTarget: "",
    color: "#0A0A0A", faceColor: "#FFFFFF",
    follow: true, idle: true, blink: true, breathe: true, lean: true, tap: true,
    play: true, newEars: true, quickTurns: true, every: 7,
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 240
 * @framerIntrinsicHeight 240
 */
export default function BearOrb(input: Partial<Props>) {
    const props: Props = { ...DEFAULTS, ...input }
    const { color, faceColor, style } = props
    const svgRef = useRef<SVGSVGElement>(null), rootRef = useRef<SVGGElement>(null), bodyRef = useRef<SVGGElement>(null)
    const pathRef = useRef<SVGPathElement>(null), eyeLRef = useRef<SVGCircleElement>(null), eyeRRef = useRef<SVGCircleElement>(null), mouthRef = useRef<SVGPathElement>(null)
    const starLRef = useRef<SVGPathElement>(null), starRRef = useRef<SVGPathElement>(null)
    const opts = useRef(props); opts.current = props          // live options: toggles apply without restarting the loop

    useEffect(() => {
        const svg = svgRef.current
        if (!svg || RenderTarget.current() === RenderTarget.canvas) return          // static on the canvas
        if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return
        const root = rootRef.current!, body = bodyRef.current!, path = pathRef.current!, eyeL = eyeLRef.current!, eyeR = eyeRRef.current!, mouth = mouthRef.current!, starL = starLRef.current!, starR = starRRef.current!

        // everything that changes lives here, never in React state
        const s = {
            yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, hy: 0, hp: 0, hvy: 0, hvp: 0,
            eyeScale: 1, tEyeScale: 1, squash: 1, tSquash: 1,
            mouth: SMILE, tMouth: SMILE, side: 0, tSide: 0, len: 1, tLen: 1, tilt: 0, tTilt: 0,
            blink: 0, blinkT0: 0, blinkN: 0, poke: 0, pokeS: 0,
            manual: false, act: 0, actT0: 0, fadeT0: 0, last: 0,
            nextIdle: 0, nextBlink: 0, nextAct: 0,
            px: 0, py: 0, pT: -1e9, rcx: 0, rcy: 0, rw: 240, rT: -1e9,
        }
        const A: Act = { ...NO_ACT }, FA: Act = { ...NO_ACT }       // current act frame, and the frame a finished act fades out from
        let tl: { at: number; fn: () => void }[] = []                 // timed steps of the running scenario
        const cache = { d: REST.d, l: REST.eyeL, r: REST.eyeR, md: REST.mouthD, mt: REST.mouthTf, b: "", o: "", sw: "", sd: "", sl: "", sr: "", sv: "hidden" }
        const put = (el: Element, name: string, key: keyof typeof cache, v: string) => { if (cache[key] !== v) { cache[key] = v; el.setAttribute(name, v) } }
        const look = (y: number, p: number) => { s.tYaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, y)); s.tPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p)) }
        const startBlink = (now: number, n: number) => { if (!s.blinkN) { s.blinkN = n; s.blinkT0 = now } }
        const schedule = (now: number) => { s.nextAct = now + opts.current.every * 1000 * (0.6 + 0.8 * Math.random()) }

        const playAct = (id: number, now: number) => { tl = []; s.manual = true; look(0, 0); s.act = id; s.actT0 = now; s.fadeT0 = 0 }
        const playNewEars = (now: number) => playAct(1, now)
        // Surprised cuts into quick turns and idle; it waits out New ears rather than snapping the ears back
        const surprise = (now: number) => {
            if (!raf || s.act) return
            s.tMouth = SMILE; s.tSide = 0; s.tLen = 1; s.tTilt = 0; s.tEyeScale = 1; s.tSquash = 1
            playAct(2, now)
        }
        const playQuickTurns = (now: number) => {
            s.manual = true; s.tMouth = 0.15; s.tLen = 0.8
            const y = 0.9 * MAX_YAW; tl = []
            ;[1, -1, 1, -1].forEach((dir, i) => tl.push({ at: now + i * 420, fn: () => { look(y * dir, 0); s.tSide = dir; s.tTilt = 9 * dir } }))
            tl.push({ at: now + 1680, fn: () => look(0, 0) })
            tl.push({ at: now + QUICK_TURNS - 300, fn: () => { s.tMouth = SMILE; s.tSide = 0; s.tLen = 1; s.tTilt = 0 } })
            tl.push({ at: now + QUICK_TURNS, fn: () => { s.manual = false; schedule(now + QUICK_TURNS) } })
        }
        const poke = (now: number) => {
            if (s.act || s.manual) return
            s.poke = 1; s.tEyeScale = 1.22; s.tSquash = 1.1; s.tMouth = 0.5; s.tLen = 0.55
            tl = [{ at: now + 420, fn: () => { s.tEyeScale = 1; s.tSquash = 1; s.tMouth = SMILE; s.tLen = 1; startBlink(now + 420, 1) } }]
        }

        let raf = 0, visible = true
        const tick = (now: number) => {
            raf = 0
            const o = opts.current, dt = Math.min(64, now - s.last); s.last = now
            while (tl.length && now >= tl[0].at) tl.shift()!.fn()

            // where to look
            if (!s.manual) {
                if (o.follow && now - s.pT < 4000) {
                    if (now - s.rT > 300) { const b = svg.getBoundingClientRect(); s.rcx = b.left + b.width / 2; s.rcy = b.top + b.height / 2; s.rw = b.width; s.rT = now }
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
                    if (o.newEars) pool.push(playNewEars); if (o.quickTurns) pool.push(playQuickTurns)
                    if (pool.length) pool[(Math.random() * pool.length) | 0](now); else schedule(now)
                }
            }
            if (o.blink && now > s.nextBlink && !s.act) { startBlink(now, Math.random() < 0.2 ? 2 : 1); s.nextBlink = now + 2000 + Math.random() * 4000 }

            // blink: 90 ms close, 40 hold, 150 open, 110 between a double
            if (s.blinkN) {
                const t = now - s.blinkT0, one = 280, total = one * s.blinkN + 110 * (s.blinkN - 1)
                if (t >= total) { s.blink = 0; s.blinkN = 0 }
                else { const c = t % 390; s.blink = c < 90 ? (c / 90) * (c / 90) : c < 130 ? 1 : c < 280 ? (1 - (c - 130) / 150) * (1 - (c - 130) / 150) : 0 }
            }

            // smoothing, head spring
            const k = 1 - Math.exp(-dt / 70), k2 = 1 - Math.exp(-dt / 90), h = Math.min(dt, 40) / 1000
            s.yaw += (s.tYaw - s.yaw) * k; s.pitch += (s.tPitch - s.pitch) * k
            s.hvy += ((s.yaw * HEAD_FOLLOW - s.hy) * SPRING_K - s.hvy * SPRING_D) * h; s.hy += s.hvy * h
            s.hvp += ((s.pitch * HEAD_FOLLOW - s.hp) * SPRING_K - s.hvp * SPRING_D) * h; s.hp += s.hvp * h
            s.eyeScale += (s.tEyeScale - s.eyeScale) * k2; s.squash += (s.tSquash - s.squash) * k2
            s.mouth += (s.tMouth - s.mouth) * k2; s.side += (s.tSide - s.side) * k2; s.len += (s.tLen - s.len) * k2; s.tilt += (s.tTilt - s.tilt) * k2
            s.poke *= Math.exp(-dt / 420); if (s.poke < 0.002) s.poke = 0
            s.pokeS += (s.poke - s.pokeS) * (1 - Math.exp(-dt / 90))

            // the act frame, or the fade out of the one that just ended
            Object.assign(A, NO_ACT)
            if (s.act) {
                const t = now - s.actT0, ms = ACT_MS[s.act], run = ACTS[s.act]
                if (t >= ms) { Object.assign(FA, NO_ACT); run(ms / 1000, FA); s.act = 0; s.fadeT0 = now; s.manual = false; schedule(now) }
                else run(t / 1000, A)
            }
            if (!s.act && s.fadeT0) {
                const f = (now - s.fadeT0) / FADE
                if (f >= 1) s.fadeT0 = 0
                else { const e = 1 - easeIO(f); A.curve = s.mouth + ((FA.curve ?? s.mouth) - s.mouth) * e; A.len = s.len + ((FA.len ?? s.len) - s.len) * e; A.eyeScale = 1 + (FA.eyeScale - 1) * e; A.eyeSquash = 1 + (FA.eyeSquash - 1) * e; A.sy = 1 + (FA.sy - 1) * e }
            }

            // write only what changed
            put(path, "d", "d", bodyD(s.hy, s.hp, s.pokeS, A))
            const sx = s.eyeScale * A.eyeScale, sy = s.eyeScale * s.squash * (1 - s.blink * 0.94) * A.eyeSquash
            put(eyeL, "transform", "l", eyeTf(-1, s.yaw, s.pitch, sx, sy, s.blink))
            put(eyeR, "transform", "r", eyeTf(1, s.yaw, s.pitch, sx, sy, s.blink))
            if (A.star > 0.001) {                                                    // star eyes replace the circles for the moment
                const us = sx * (1 + 0.38 * A.star)
                put(starL, "d", "sd", starD(A.star)); starR.setAttribute("d", cache.sd)
                put(starL, "transform", "sl", starTf(-1, s.yaw, s.pitch, us)); put(starR, "transform", "sr", starTf(1, s.yaw, s.pitch, us))
            }
            const sv = A.star > 0.001 ? "visible" : "hidden"
            if (cache.sv !== sv) { cache.sv = sv; const ev = sv === "visible" ? "hidden" : "visible"; starL.setAttribute("visibility", sv); starR.setAttribute("visibility", sv); eyeL.setAttribute("visibility", ev); eyeR.setAttribute("visibility", ev) }
            put(mouth, "d", "md", mouthD(A.curve ?? s.mouth, A.len ?? s.len, s.side, sx))
            put(mouth, "transform", "mt", mouthTf(s.yaw, s.pitch, s.tilt))
            put(mouth, "stroke-width", "sw", "" + r1(MOUTH_STROKE * s.eyeScale))
            const lx = o.lean ? (s.yaw / MAX_YAW) * 3 : 0, ly = o.lean ? (-s.pitch / MAX_PITCH) * 2 : 0, py = CY + R
            put(body, "transform", "b", `matrix(1 0 0 ${r3(A.sy)} ${r1(lx)} ${r1(ly + A.dy + py * (1 - A.sy))})`)
            const br = o.breathe ? 1 + 0.012 * Math.sin((now / 3200) * TAU) : 1
            put(root, "transform", "o", `matrix(${r3(br)} 0 0 ${r3(br)} ${r1(CX * (1 - br))} ${r1(CY * (1 - br))})`)

            if (visible) raf = requestAnimationFrame(tick)
        }

        const start = () => { if (raf || !visible || document.hidden) return; const now = performance.now(); s.last = now; if (!s.nextBlink) { s.nextBlink = now + 1500; s.nextIdle = now + 800; schedule(now) } raf = requestAnimationFrame(tick) }
        const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }
        const onMove = (e: PointerEvent) => { s.px = e.clientX; s.py = e.clientY; s.pT = performance.now() }
        const onDown = () => { if (opts.current.tap) poke(performance.now()) }
        const onVis = () => (document.hidden ? stop() : start())
        // hover target: a Framer layer name, or a CSS selector when it starts with # . or [
        const selector = () => {
            const t = (opts.current.hoverTarget || "").trim(); if (!t) return ""
            if (/^[#.\[]/.test(t)) return t
            return `[data-framer-name="${t.replace(/["\\]/g, "\\$&")}"]`
        }
        const onOver = (e: PointerEvent) => {
            const q = selector(), target = e.target as Element | null; if (!q || !target || !target.closest) return
            let hit: Element | null = null
            try { hit = target.closest(q) } catch { return }                         // a selector typed half way is not an error
            if (!hit || (e.relatedTarget instanceof Node && hit.contains(e.relatedTarget))) return   // only on entering, not moving within
            surprise(performance.now())
        }
        const onEvent = () => surprise(performance.now())
        const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; visible ? start() : stop() }) : null
        io?.observe(svg)
        window.addEventListener("pointermove", onMove, { passive: true })
        svg.addEventListener("pointerdown", onDown)
        document.addEventListener("visibilitychange", onVis)
        document.addEventListener("pointerover", onOver, { passive: true })
        window.addEventListener("bearorb:surprise", onEvent)                          // for code overrides and custom triggers
        start()
        return () => { stop(); io?.disconnect(); window.removeEventListener("pointermove", onMove); svg.removeEventListener("pointerdown", onDown); document.removeEventListener("visibilitychange", onVis); document.removeEventListener("pointerover", onOver); window.removeEventListener("bearorb:surprise", onEvent) }
    }, [])

    return (
        <svg ref={svgRef} viewBox="0 0 200 200" role="img" aria-label="Bear mascot"
            style={{ width: "100%", height: "100%", display: "block", overflow: "visible", ...style }}>
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
    )
}

addPropertyControls(BearOrb, {
    color: { type: ControlType.Color, title: "Body", defaultValue: DEFAULTS.color },
    faceColor: { type: ControlType.Color, title: "Face", defaultValue: DEFAULTS.faceColor },
    play: { type: ControlType.Boolean, title: "Animations", enabledTitle: "Random", disabledTitle: "Off", defaultValue: DEFAULTS.play },
    newEars: { type: ControlType.Boolean, title: "New ears", defaultValue: DEFAULTS.newEars, hidden: (p: Props) => !p.play },
    quickTurns: { type: ControlType.Boolean, title: "Quick turns", defaultValue: DEFAULTS.quickTurns, hidden: (p: Props) => !p.play },
    every: { type: ControlType.Number, title: "Every", min: 3, max: 60, step: 1, unit: "s", displayStepper: true, defaultValue: DEFAULTS.every, hidden: (p: Props) => !p.play },
    hoverTarget: { type: ControlType.String, title: "Surprise on", placeholder: "Layer name", defaultValue: DEFAULTS.hoverTarget, description: "Hovering this layer plays Surprised. Type the layer's name as it appears in the Layers panel, or a CSS selector starting with # . or [" },
    follow: { type: ControlType.Boolean, title: "Follow cursor", defaultValue: DEFAULTS.follow },
    idle: { type: ControlType.Boolean, title: "Idle wander", defaultValue: DEFAULTS.idle },
    blink: { type: ControlType.Boolean, title: "Blink", defaultValue: DEFAULTS.blink },
    breathe: { type: ControlType.Boolean, title: "Breathe", defaultValue: DEFAULTS.breathe },
    lean: { type: ControlType.Boolean, title: "Lean", defaultValue: DEFAULTS.lean },
    tap: { type: ControlType.Boolean, title: "Tap reaction", defaultValue: DEFAULTS.tap },
})
