"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;

export function SheetContent({
  className,
  children,
  title,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
      <DialogPrimitive.Content
        // RTL: the drawer slides in from the start edge, which is the right in
        // Hebrew. inset-inline-start is the logical property for that.
        className={cn(
          "fixed inset-y-0 start-0 z-50 w-72 border-e border-outline-variant bg-surface-container-lowest p-4 shadow-elevation-2",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Close className="absolute top-3 end-3 rounded-sm p-1 text-on-surface-variant hover:bg-surface-container">
          <X className="size-4" />
          <span className="sr-only">סגירה</span>
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
