"use client"

import React, { forwardRef, useRef } from "react"
import {
    Monitor,
    Server,
    Database,
    Cog,
    Radio,
    HardDrive,
    Mail,
    MessageCircle,
    Clock,
    Layers,
    Send
} from "lucide-react"

import { cn } from "@/lib/utils"
import { AnimatedBeam } from "@/components/ui/animated-beam"

// Reusable node component
const ArchNode = forwardRef<
    HTMLDivElement,
    {
        className?: string
        children?: React.ReactNode
        label?: string
        sublabel?: string
    }
>(({ className, children, label, sublabel }, ref) => {
    return (
        <div className="flex flex-col items-center gap-2">
            <div
                ref={ref}
                className={cn(
                    "z-10 flex size-12 md:size-14 items-center justify-center rounded-xl",
                    "border border-white/10 bg-white/5 backdrop-blur-sm",
                    "shadow-lg shadow-black/20",
                    "transition-all duration-300 hover:scale-110 hover:bg-white/10",
                    className
                )}
            >
                {children}
            </div>
            {label && (
                <div className="text-center">
                    <p className="text-xs md:text-sm font-medium text-white/90">{label}</p>
                    {sublabel && (
                        <p className="text-[10px] md:text-xs text-white/50">{sublabel}</p>
                    )}
                </div>
            )}
        </div>
    )
})
ArchNode.displayName = "ArchNode"

// Block container component
const Block = forwardRef<
    HTMLDivElement,
    {
        className?: string
        children?: React.ReactNode
        title?: string
    }
>(({ className, children, title }, ref) => {
    return (
        <div
            ref={ref}
            className={cn(
                "flex flex-col items-center gap-4 p-6 rounded-2xl",
                "border border-white/5 bg-white/2",
                className
            )}
        >
            {title && (
                <p className="text-xs uppercase tracking-wider text-white/40 font-medium mb-2">{title}</p>
            )}
            <div className="flex flex-wrap justify-center gap-6">
                {children}
            </div>
        </div>
    )
})
Block.displayName = "Block"

export function ArchitectureSection() {
    const containerRef = useRef<HTMLDivElement>(null)

    // Block refs for beams between blocks
    const block1Ref = useRef<HTMLDivElement>(null)
    const block2Ref = useRef<HTMLDivElement>(null)
    const block3Ref = useRef<HTMLDivElement>(null)
    const block4Ref = useRef<HTMLDivElement>(null)

    return (
        <section id="architecture" className="w-full py-20 px-5 bg-[#030303]">
            {/* Section Header */}
            <div className="mb-16 text-center relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/20 border border-blue-500/20 text-blue-400 text-xs font-medium uppercase tracking-wider mb-4">
                    <Layers size={12} className="fill-blue-400" />
                    <span>Architecture</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
                    How It <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-300 to-blue-600">Works</span>
                </h2>
                <p className="max-w-2xl mx-auto text-lg text-slate-400">
                    A scalable event-driven architecture with Kafka for message routing, Redis for scheduling, and MongoDB for persistence.
                </p>
            </div>

            {/* Architecture Diagram - 4 Blocks */}
            <div
                ref={containerRef}
                className="relative w-full max-w-6xl mx-auto"
            >
                {/* Blocks Container - Horizontal on desktop, Vertical on mobile */}
                <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-4 py-8">

                    {/* Block 1: Client */}
                    <Block ref={block1Ref} title="Client">
                        <ArchNode
                            label="Client Service"
                            className="border-blue-500/30 bg-blue-500/10"
                        >
                            <Monitor className="h-5 w-5 md:h-6 md:w-6 text-blue-400" />
                        </ArchNode>
                    </Block>

                    {/* Block 2: Core Infrastructure */}
                    <Block ref={block2Ref} title="Core Services">
                        <ArchNode
                            label="MongoDB"
                            className="border-green-500/30 bg-green-500/10"
                        >
                            <Database className="h-5 w-5 md:h-6 md:w-6 text-green-400" />
                        </ArchNode>
                        <ArchNode
                            label="Kafka"
                            className="border-orange-500/30 bg-orange-500/10"
                        >
                            <Radio className="h-5 w-5 md:h-6 md:w-6 text-orange-400" />
                        </ArchNode>
                        <ArchNode
                            label="Worker"
                            sublabel="Background"
                            className="border-purple-500/30 bg-purple-500/10"
                        >
                            <Cog className="h-5 w-5 md:h-6 md:w-6 text-purple-400" />
                        </ArchNode>
                        <ArchNode
                            label="Delayed"
                            sublabel="Worker"
                            className="border-amber-500/30 bg-amber-500/10"
                        >
                            <Clock className="h-5 w-5 md:h-6 md:w-6 text-amber-400" />
                        </ArchNode>
                    </Block>

                    {/* Block 3: Processors */}
                    <Block ref={block3Ref} title="Processors">
                        <ArchNode
                            label="Email"
                            sublabel="Processor"
                            className="border-blue-500/30 bg-blue-500/10"
                        >
                            <Mail className="h-5 w-5 md:h-6 md:w-6 text-blue-400" />
                        </ArchNode>
                        <ArchNode
                            label="WhatsApp"
                            sublabel="Processor"
                            className="border-green-500/30 bg-green-500/10"
                        >
                            <MessageCircle className="h-5 w-5 md:h-6 md:w-6 text-green-400" />
                        </ArchNode>
                    </Block>

                    {/* Block 4: External Services */}
                    <Block ref={block4Ref} title="Providers">
                        <ArchNode
                            label="Email"
                            sublabel="Service"
                            className="border-cyan-500/30 bg-cyan-500/10"
                        >
                            <Send className="h-5 w-5 md:h-6 md:w-6 text-cyan-400" />
                        </ArchNode>
                        <ArchNode
                            label="WhatsApp"
                            sublabel="Service"
                            className="border-emerald-500/30 bg-emerald-500/10"
                        >
                            <Server className="h-5 w-5 md:h-6 md:w-6 text-emerald-400" />
                        </ArchNode>
                    </Block>
                </div>

                {/* Animated Beams - Simple Block to Block Flow */}
                {/* Block 1 → Block 2 */}
                <AnimatedBeam
                    containerRef={containerRef}
                    fromRef={block1Ref}
                    toRef={block2Ref}
                    gradientStartColor="#3B82F6"
                    gradientStopColor="#A855F7"
                    pathColor="rgba(59, 130, 246, 0.15)"
                    pathWidth={3}
                    duration={4}
                />

                {/* Block 2 → Block 3 */}
                <AnimatedBeam
                    containerRef={containerRef}
                    fromRef={block2Ref}
                    toRef={block3Ref}
                    gradientStartColor="#A855F7"
                    gradientStopColor="#F97316"
                    pathColor="rgba(168, 85, 247, 0.15)"
                    pathWidth={3}
                    duration={4}
                    delay={1}
                />

                {/* Block 3 → Block 4 */}
                <AnimatedBeam
                    containerRef={containerRef}
                    fromRef={block3Ref}
                    toRef={block4Ref}
                    gradientStartColor="#F97316"
                    gradientStopColor="#22C55E"
                    pathColor="rgba(249, 115, 22, 0.15)"
                    pathWidth={3}
                    duration={4}
                    delay={2}
                />
            </div>
        </section>
    )
}
