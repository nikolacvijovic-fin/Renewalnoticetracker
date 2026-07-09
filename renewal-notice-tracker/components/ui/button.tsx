import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({
  className,
  variant = "primary",
  asChild,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-60",
        {
          "bg-brand-600 text-white shadow-sm hover:bg-brand-700": variant === "primary",
          "border border-line bg-white text-ink hover:bg-slate-50":
            variant === "secondary",
          "text-ink hover:bg-slate-100": variant === "ghost",
          "bg-critical text-white hover:bg-red-700": variant === "danger"
        },
        className
      )}
      {...props}
    />
  );
}
