"use client"

import React, { forwardRef, useRef } from "react"
import Image from "next/image"
import { Mail, MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { AnimatedBeam } from "@/components/ui/animated-beam"

const Circle = forwardRef<
    HTMLDivElement,
    { className?: string; children?: React.ReactNode }
>(({ className, children }, ref) => {
    return (
        <div
            ref={ref}
            className={cn(
                "z-10 flex size-12 items-center justify-center rounded-full border-2 p-3",
                className
            )}
        >
            {children}
        </div>
    )
})

Circle.displayName = "Circle"

export function ChannelFlowBackground() {
    const containerRef = useRef<HTMLDivElement>(null)
    const emailRef = useRef<HTMLDivElement>(null)
    const whatsappRef = useRef<HTMLDivElement>(null)
    const centerRef = useRef<HTMLDivElement>(null)

    return (
        <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
            ref={containerRef}
        >
            <div className="relative flex h-[160px] w-[280px] items-center justify-center">
                {/* Left side icons */}
                <div className="absolute left-0 flex flex-col gap-10">
                    <Circle ref={emailRef} className="border-blue-500/50 bg-blue-500/20">
                        <Mail className="h-5 w-5 text-blue-400" />
                    </Circle>
                    <Circle ref={whatsappRef} className="border-green-500/50 bg-green-500/20">
                        <MessageCircle className="h-5 w-5 text-green-400" />
                    </Circle>
                </div>

                {/* Center icon */}
                <Circle ref={centerRef} className="absolute right-0 size-14 border bg-white/20">
                    <Image
                        src="/icon.png"
                        alt="SimpleNS"
                        width={32}
                        height={32}
                        className="rounded-full"
                    />
                </Circle>
            </div>

            {/* Animated beams */}
            <AnimatedBeam
                containerRef={containerRef}
                fromRef={emailRef}
                toRef={centerRef}
                curvature={-30}
                gradientStartColor="#3B82F6"
                gradientStopColor="#8B5CF6"
                pathColor="rgba(59, 130, 246, 0.3)"
                duration={4}
            />
            <AnimatedBeam
                containerRef={containerRef}
                fromRef={whatsappRef}
                toRef={centerRef}
                curvature={30}
                gradientStartColor="#22C55E"
                gradientStopColor="#8B5CF6"
                pathColor="rgba(34, 197, 94, 0.3)"
                duration={4}
                delay={1}
            />
        </div>
    )
}
