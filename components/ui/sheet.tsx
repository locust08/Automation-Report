"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="app-sheet-overlay"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "app-sheet-content flex flex-col overflow-hidden border-l bg-white outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border bg-white text-neutral-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b px-5 py-5 pr-16", className)} {...props} />;
}

function SheetTitle(props: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className="text-xl font-semibold" {...props} />;
}

function SheetDescription(
  props: React.ComponentProps<typeof SheetPrimitive.Description>,
) {
  return <SheetPrimitive.Description className="mt-1 text-sm text-neutral-500" {...props} />;
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
