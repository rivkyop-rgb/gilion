import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Latin metadata inside an RTL flow — invoice ids, amounts, dates, dimensions
 * (conventions.md §1). Without the isolation the shekel sign and the digits
 * reorder and the value reads wrong.
 */
export function Ltr({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span dir="ltr" className={cn("ltr-isolate", className)} {...props} />;
}
