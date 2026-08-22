import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    // RTL: text-start, not text-left — the field must follow the document direction.
    className={cn(
      "h-10 w-full rounded-sm border border-outline-variant bg-surface-container px-3 text-start text-sm text-on-surface placeholder:text-outline focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
