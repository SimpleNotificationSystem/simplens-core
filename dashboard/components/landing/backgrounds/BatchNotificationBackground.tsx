"use client"

import { motion } from "motion/react"
import { Mail, Users } from "lucide-react"

export function BatchNotificationBackground() {
    return (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden opacity-40">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-linear-to-br from-orange-500/5 via-transparent to-purple-500/5" />

            {/* Stacked notification cards */}
            <div className="relative flex items-center gap-6">
                {/* Single notification */}
                <motion.div
                    className="flex items-center justify-center w-14 h-14 rounded-xl bg-orange-500/20 border border-orange-500/40"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                    <Mail className="w-6 h-6 text-orange-400" />
                </motion.div>

                {/* Arrow */}
                <motion.div
                    className="text-purple-400/60"
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                </motion.div>

                {/* Multiple notifications (batch) */}
                <div className="relative w-16 h-16">
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            className="absolute flex items-center justify-center w-12 h-12 rounded-xl border"
                            style={{
                                top: i * 8,
                                left: i * 8,
                                background: `rgba(168, 85, 247, ${0.2 - i * 0.05})`,
                                borderColor: `rgba(168, 85, 247, ${0.4 - i * 0.1})`,
                                zIndex: 3 - i,
                            }}
                            animate={{ y: [0, -3, 0] }}
                            transition={{
                                duration: 2.5,
                                delay: i * 0.2,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                        >
                            {i === 0 && <Users className="w-5 h-5 text-purple-400" />}
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    )
}
