// Optional code overrides for OrbSlider. Apply one to any layer: select it, then
// Code Overrides > File: OrbSliderOverrides > Override: <name>.
// Each fires a window event that every OrbSlider on the page answers.
import type { ComponentType } from "react"

const fire = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }))
const onClick = (name: string, detail?: unknown) => (Component: ComponentType<any>): ComponentType<any> => (props: any) =>
    <Component {...props} onClick={(e: unknown) => { fire(name, detail); props.onClick?.(e) }} />

export const NextOrb = onClick("orbslider:next")
export const PrevOrb = onClick("orbslider:prev")
export const ShowBear = onClick("orbslider:go", "bear")
export const ShowLemon = onClick("orbslider:go", "lemon")
export const ShowCloud = onClick("orbslider:go", "cloud")
export const ShowSeacow = onClick("orbslider:go", "seacow")
export const ShowGhost = onClick("orbslider:go", "ghost")
export const ShowFlower = onClick("orbslider:go", "flower")

export function SurpriseOrbOnHover(Component: ComponentType<any>): ComponentType<any> {
    return (props: any) => <Component {...props} onMouseEnter={(e: unknown) => { fire("orbslider:surprise"); props.onMouseEnter?.(e) }} />
}
