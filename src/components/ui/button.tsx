import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // 对比度门槛：白字压在亮底上，#007aff 只有 4.02:1、#ff3b30 只有 3.54:1，
        // 都够不到小字号 AA。实底按钮统一压深一档（brand-600 ≈ 5.8:1、
        // destructive-ink ≈ 5:1）；hover 仍走同色 alpha，不引入第三色。
        default: "bg-brand-600 text-white hover:bg-brand-600/90",
        destructive: "bg-destructive-ink text-white hover:bg-destructive-ink/90",
        outline: "border-2 border-ink bg-white hover:bg-brand-50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        // 小/大号按钮比默认档少一档圆角（10px vs 12px）。
        // 这不是死代码：cn 走 twMerge，同组里靠后的胜出，所以调用处再写
        // rounded-xl / rounded-full 仍然能盖住它。
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
