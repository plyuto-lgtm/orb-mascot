// Optional. A Framer code override that makes any layer trigger the bear's Surprised moment on hover.
// Use this when the "Surprise on" property control cannot find your layer by name.
// Apply it in Framer: select the button, then Code Overrides > File: BearOrbOverrides > Override: SurpriseBearOnHover.
import type { ComponentType } from "react"

export function SurpriseBearOnHover(Component: ComponentType<any>): ComponentType<any> {
    return (props: any) => (
        <Component
            {...props}
            onMouseEnter={(e: unknown) => {
                window.dispatchEvent(new CustomEvent("bearorb:surprise"))
                props.onMouseEnter?.(e)
            }}
        />
    )
}
