"use client"

import { motion } from "motion/react"
import { Clock } from "lucide-react"

export function ScheduleClockBackground() {
    return (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden opacity-40">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-linear-to-br from-cyan-500/10 via-transparent to-blue-500/5" />

            {/* Large Clock Icon */}
            <motion.div
                className="relative"
                animate={{
                    scale: [1, 1.05, 1],
                }}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            >
                <Clock className="h-24 w-24 text-cyan-400/60" strokeWidth={1} />

                {/* Pulse ring */}
                <motion.div
                    className="absolute inset-0 rounded-full border-2 border-cyan-400/30"
                    animate={{
                        scale: [1, 1.3, 1.3],
                        opacity: [0.5, 0, 0]
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeOut"
                    }}
                />
            </motion.div>
        </div>
    )
}
