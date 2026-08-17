import * as React from "react"
import { Clock8Icon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type TimePickerInputProps = Omit<React.ComponentProps<typeof Input>, "type">

const TimePickerInput = React.forwardRef<HTMLInputElement, TimePickerInputProps>(
  ({ className, ...props }, ref) => {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground peer-disabled:opacity-50">
        <Clock8Icon className="size-4" aria-hidden="true" />
      </div>
      <Input
        ref={ref}
        type="time"
        className={cn(
          "peer bg-background appearance-none pl-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none",
          className
        )}
        {...props}
      />
    </div>
  )
  }
)

TimePickerInput.displayName = "TimePickerInput"

export { TimePickerInput }
