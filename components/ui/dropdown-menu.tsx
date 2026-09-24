"use client";

import * as React from "react";
import * as Primitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={6}
        // RTL: "end" aligns to the left edge in Hebrew, which is what a menu
        // hanging off a right-hand trigger needs.
        align="end"
        className={cn(
          "z-50 min-w-56 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-1 shadow-elevation-1",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm text-on-surface outline-none select-none data-[highlighted]:bg-surface-container-low",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={cn("px-3 py-1.5 text-xs font-medium text-on-surface-variant", className)}
      {...props}
    />
  );
}

export const DropdownMenuSeparator = () => (
  <Primitive.Separator className="my-1 h-px bg-outline-variant" />
);
