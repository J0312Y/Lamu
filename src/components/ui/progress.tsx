import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number; // 0-100
}

function Progress({ value = 0, className, ...props }: ProgressProps) {
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className="h-full bg-primary transition-all duration-300 ease-in-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export { Progress };
