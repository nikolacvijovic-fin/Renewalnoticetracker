import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

export function Label({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root className={className ?? "mb-1.5 block text-sm font-medium"} {...props} />
  );
}
