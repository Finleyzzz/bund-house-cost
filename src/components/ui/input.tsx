import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const field =
  "h-11 w-full rounded-md border border-line bg-bg-elev px-3 text-base text-fg outline-none focus:border-tan";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(field, className)} {...props} />;
}
