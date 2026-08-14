import type { ComponentProps } from "react";
import {
  ShieldXIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlacementDecisionAction = "exclude" | "remove";

const actionStyles: Record<PlacementDecisionAction, string> = {
  exclude: "bg-destructive text-white hover:bg-destructive/90",
  remove: "bg-red-600/10 text-red-700 hover:bg-red-600/20 focus-visible:border-red-600/40 focus-visible:ring-red-600/20",
};

const actionIcons = {
  exclude: ShieldXIcon,
  remove: Trash2Icon,
} satisfies Record<PlacementDecisionAction, typeof ShieldXIcon>;

export function PlacementDecisionButton({
  action,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "variant"> & {
  action: PlacementDecisionAction;
}) {
  const Icon = actionIcons[action];

  return (
    <Button
      type="button"
      size="sm"
      className={cn("cursor-pointer gap-2 shadow-none", actionStyles[action], className)}
      {...props}
    >
      {children}
      <Icon className="size-4" />
    </Button>
  );
}
