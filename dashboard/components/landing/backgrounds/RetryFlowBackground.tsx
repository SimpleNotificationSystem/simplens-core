"use client"

import { motion } from "motion/react"
import { RefreshCw, Check } from "lucide-react"

export function RetryFlowBackground() {
    return (
        <div className="absolute inset-0 overflow-hidden opacity-50">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-linear-to-br from-emerald-500/10 via-transparent to-teal-500/5" />

            {/* Retry loop icon */}
            <motion.div
                className="absolute top-[20%] left-1/2 -translate-x-1/2"
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            >
                <RefreshCw className="w-10 h-10 text-emerald-400/60" />
            </motion.div>

            {/* Retry attempt circles (exponential backoff visualization) */}
            <div className="absolute top-[45%] left-[10%] right-[10%] flex items-center justify-between">
                {/* Attempt 1 */}
                <motion.div
                    className="flex flex-col items-center gap-1"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0 }}
                >
                    <motion.div
                        className="w-8 h-8 rounded-full border-2 border-red-400/50 flex items-center justify-center"
                        animate={{ borderColor: ["rgba(248,113,113,0.5)", "rgba(248,113,113,0.8)", "rgba(248,113,113,0.5)"] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <span className="text-xs text-red-400">1</span>
                    </motion.div>
                    <span className="text-[10px] text-slate-500">1s</span>
                </motion.div>

                {/* Connector line 1 */}
                <motion.div
                    className="flex-1 h-0.5 mx-2 bg-linear-to-r from-red-400/30 to-yellow-400/30"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                />

                {/* Attempt 2 */}
                <motion.div
                    className="flex flex-col items-center gap-1"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 1 }}
                >
                    <motion.div
                        className="w-8 h-8 rounded-full border-2 border-yellow-400/50 flex items-center justify-center"
                        animate={{ borderColor: ["rgba(250,204,21,0.5)", "rgba(250,204,21,0.8)", "rgba(250,204,21,0.5)"] }}
                        transition={{ duration: 2, delay: 0.3, repeat: Infinity }}
                    >
                        <span className="text-xs text-yellow-400">2</span>
                    </motion.div>
                    <span className="text-[10px] text-slate-500">2s</span>
                </motion.div>

                {/* Connector line 2 (longer - exponential) */}
                <motion.div
                    className="flex-[1.5] h-0.5 mx-2 bg-linear-to-r from-yellow-400/30 to-emerald-400/30"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5, delay: 1.5 }}
                />

                {/* Attempt 3 */}
                <motion.div
                    className="flex flex-col items-center gap-1"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 2 }}
                >
                    <motion.div
                        className="w-8 h-8 rounded-full border-2 border-emerald-400/50 flex items-center justify-center"
                        animate={{ borderColor: ["rgba(52,211,153,0.5)", "rgba(52,211,153,0.8)", "rgba(52,211,153,0.5)"] }}
                        transition={{ duration: 2, delay: 0.6, repeat: Infinity }}
                    >
                        <span className="text-xs text-emerald-400">3</span>
                    </motion.div>
                    <span className="text-[10px] text-slate-500">4s</span>
                </motion.div>

                {/* Connector line 3 (even longer) */}
                <motion.div
                    className="flex-2 h-0.5 mx-2 bg-linear-to-r from-emerald-400/30 to-green-400/50"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5, delay: 2.5 }}
                />

                {/* Success */}
                <motion.div
                    className="flex flex-col items-center gap-1"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 3 }}
                >
                    <motion.div
                        className="w-10 h-10 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center"
                        animate={{
                            boxShadow: ["0 0 0 0 rgba(34,197,94,0)", "0 0 0 8px rgba(34,197,94,0.2)", "0 0 0 0 rgba(34,197,94,0)"]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <Check className="w-5 h-5 text-green-400" />
                    </motion.div>
                </motion.div>
            </div>

            {/* Exponential backoff label */}
            <motion.div
                className="absolute bottom-[20%] left-1/2 -translate-x-1/2"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 3, repeat: Infinity }}
            >
                <span className="text-xs text-slate-500 font-mono">exponential backoff</span>
            </motion.div>
        </div>
    )
}
