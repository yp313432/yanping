import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none bg-surface-2 text-fg placeholder:text-subtle",
        "rounded-lg px-4 py-3 text-base leading-normal",
        "shadow-[var(--shadow-border)]",
        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-border-hover)]",
        "focus-visible:ring-2 focus-visible:ring-accent/40",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
