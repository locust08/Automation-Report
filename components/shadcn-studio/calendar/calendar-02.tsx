"use client";

import type { ComponentProps } from "react";

import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export function Calendar02({ className, ...props }: ComponentProps<typeof Calendar>) {
  return (
    <Calendar
      numberOfMonths={2}
      showOutsideDays={false}
      className={cn(
        "rounded-lg border bg-background p-2 text-xs [--cell-size:--spacing(7)]",
        className
      )}
      {...props}
    />
  );
}
