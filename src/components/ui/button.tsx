import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[transform,background-color,color,border-color,opacity] duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-fg text-ink hover:bg-tan",
        ghost: "bg-transparent text-fg hover:bg-bg-soft",
        line: "border border-line bg-transparent text-fg hover:border-tan",
        danger: "bg-transparent text-bad hover:bg-bg-soft",
      },
      size: {
        md: "h-11 px-4 text-sm",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: Props) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
