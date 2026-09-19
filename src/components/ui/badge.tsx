import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold break-words transition-colors",
  {
    variants: {
      variant: {
        // 同 Button：小字号徽章白字压在亮底上过不了 AA，实底统一压深一档。
        default: "border-transparent bg-brand-600 text-white hover:bg-brand-600/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive-ink text-white hover:bg-destructive-ink/80",
        outline: "border-ink text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
