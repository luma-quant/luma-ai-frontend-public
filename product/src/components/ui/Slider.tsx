import apiClient from '@/src/api/apiClient';
import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "./Dialog"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
  const values = props.value || props.defaultValue || [0];
  return (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center cursor-pointer py-2",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-white/10">
      <SliderPrimitive.Range className="absolute h-full bg-accent-cyan shadow-[0_0_10px_rgba(0,240,255,0.5)]" />
    </SliderPrimitive.Track>
    {values.map((_, index) => (
      <SliderPrimitive.Thumb key={index} className="block h-5 w-5 rounded-full border-2 border-accent-cyan bg-white ring-offset-background transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-[0_0_10px_rgba(0,240,255,0.8)] cursor-pointer hover:scale-110 active:scale-95" />
    ))}
  </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
