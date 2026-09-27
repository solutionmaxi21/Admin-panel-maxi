import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const containerVariants = cva(
    "w-full mx-auto",
    {
        variants: {
            size: {
                content: "container",
                sm: "max-w-screen-md",
                lg: "max-w-screen-2xl",
                full: "max-w-none",
            },
            padding: {
                default: "px-4 sm:px-6 lg:px-8",
                none: "px-0",
            },
        },
        defaultVariants: {
            size: "content",
            padding: "default",
        },
    }
)

export interface ContainerProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> { }

const Container = ({
    className,
    size,
    padding,
    ...props
}: ContainerProps) => {
    return (
        <div
            className={cn(containerVariants({ size, padding }), className)}
            {...props}
        />
    )
}

export default Container
