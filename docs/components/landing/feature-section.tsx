import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Lock, Globe, Zap, Repeat, Clock, Layers, Smartphone, Code, ShieldCheck, BarChart3 } from "lucide-react"

// --- Animation Components (Ported from bento-grid-01.tsx) ---

function LayoutAnimation() {
    const [layout, setLayout] = useState(0)

    useEffect(() => {
        const interval = setInterval(() => {
            setLayout((prev) => (prev + 1) % 3)
        }, 2500)
        return () => clearInterval(interval)
    }, [])

    const layouts = ["grid-cols-2", "grid-cols-3", "grid-cols-1"]

    return (
        <div className="h-full flex items-center justify-center">
            <motion.div
                className={`grid ${layouts[layout]} gap-1.5 w-full max-w-[140px] h-full`}
                layout
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
                {[1, 2, 3].map((i) => (
                    <motion.div
                        key={i}
                        className="bg-white/20 rounded-md h-5 w-full"
                        layout
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    />
                ))}
            </motion.div>
        </div>
    )
}

function GlobalNetwork() {
    const [pulses] = useState([0, 1, 2, 3, 4])

    return (
        <div className="flex items-center justify-center h-full relative">
            <Globe className="w-16 h-16 text-white/80 z-10" />
            {pulses.map((pulse) => (
                <motion.div
                    key={pulse}
                    className="absolute w-16 h-16 border-2 border-white/30 rounded-full"
                    initial={{ scale: 0.5, opacity: 1 }}
                    animate={{ scale: 3, opacity: 0 }}
                    transition={{
                        duration: 3,
                        repeat: Infinity,
                        delay: pulse * 0.8,
                        ease: "easeOut"
                    }}
                />
            ))}
        </div>
    )
}

function RetryAnimation() {
    const [shields, setShields] = useState([
        { id: 1, active: false },
        { id: 2, active: false },
        { id: 3, active: false }
    ])

    useEffect(() => {
        const interval = setInterval(() => {
            setShields(prev => {
                const nextIndex = prev.findIndex(s => !s.active)
                if (nextIndex === -1) {
                    return prev.map(() => ({ id: Math.random(), active: false }))
                }
                return prev.map((s, i) => i === nextIndex ? { ...s, active: true } : s)
            })
        }, 800)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="flex items-center justify-center h-full gap-2">
            {shields.map((shield) => (
                <motion.div
                    key={shield.id}
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${shield.active ? 'bg-white/20' : 'bg-white/5'
                        }`}
                    animate={{ scale: shield.active ? 1.1 : 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <Repeat className={`w-5 h-5 ${shield.active ? 'text-white' : 'text-gray-600'}`} />
                </motion.div>
            ))}
        </div>
    )
}

function GuaranteeAnimation() {
    return (
        <div className="flex items-center justify-center h-full relative">
            <motion.div
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1, boxShadow: "0 0 20px rgba(59, 130, 246, 0.5)" }}
                transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
                className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-blue-500/30"
            >
                <ShieldCheck className="w-8 h-8 text-blue-400" />
            </motion.div>
        </div>
    )
}

function ClockAnimation() {
    return (
        <div className="flex items-center justify-center h-full relative">
            <div className="w-15 h-15 border border-white/10 rounded-full flex items-center justify-center relative bg-zinc-900/50 backdrop-blur-sm">
                {/* Hour Marks */}
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
                    <div
                        key={i}
                        className={`absolute w-0.5 bg-white/30 rounded-full ${i % 3 === 0 ? 'h-3' : 'h-1.5'}`}
                        style={{
                            transform: `rotate(${i * 30}deg) translateY(-42px)`
                        }}
                    />
                ))}

                {/* Hands */}
                <motion.div
                    className="absolute w-1 h-6 bg-white/60 rounded-full origin-bottom"
                    style={{ bottom: "50%", left: "calc(50% - 2px)" }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 12, ease: "linear", repeat: Infinity }}
                />
                <motion.div
                    className="absolute w-0.5 h-10 bg-blue-500 rounded-full origin-bottom"
                    style={{ bottom: "50%", left: "calc(50% - 1px)" }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, ease: "linear", repeat: Infinity }}
                />

                {/* Center Point */}
                <div className="absolute w-2 h-2 bg-blue-400 rounded-full z-10 p-0.5">
                    <div className="w-full h-full bg-black rounded-full" />
                </div>
            </div>
        </div>
    )
}

function DashboardAnimation() {
    return (
        <div className="flex items-center justify-center h-full w-full relative overflow-hidden">
            <div className="w-full max-w-md h-32 bg-zinc-900/50 border border-white/10 rounded-lg p-3 flex gap-3 backdrop-blur-sm relative">
                {/* Sidebar */}
                <div className="w-16 h-full bg-white/5 rounded flex flex-col gap-2 p-1.5">
                    <div className="w-8 h-2 bg-white/20 rounded-sm mb-1" />
                    <div className="w-full h-1.5 bg-white/10 rounded-sm" />
                    <div className="w-full h-1.5 bg-white/10 rounded-sm" />
                    <div className="w-full h-1.5 bg-white/10 rounded-sm" />
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex justify-between items-center">
                        <div className="w-24 h-2 bg-white/20 rounded-sm" />
                        <div className="w-6 h-6 rounded-full bg-white/10" />
                    </div>

                    {/* Charts Grid */}
                    <div className="flex gap-2 h-full items-end pb-1">
                        {[40, 70, 50, 90, 60, 80].map((h, i) => (
                            <motion.div
                                key={i}
                                className="flex-1 bg-blue-500/80 rounded-sm"
                                initial={{ height: "10%" }}
                                animate={{ height: `${h}%` }}
                                transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    repeatType: "reverse",
                                    delay: i * 0.1,
                                    ease: "easeInOut"
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Overlay Gradient for depth */}
            <div className="absolute inset-0 bg-linear-to-t from-zinc-900 via-transparent to-transparent opacity-50" />
        </div>
    )
}

// --- Main Feature Section ---

export function FeatureSection() {
    return (
        <section id="features" className="bg-black px-6 py-24 min-h-screen flex items-center justify-center">
            <div className="max-w-7xl w-full mx-auto">
                <div className="mb-20 text-center relative z-10">
                    <motion.div
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/20 border border-blue-500/20 text-blue-400 text-xs font-medium uppercase tracking-wider mb-4"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <Zap size={12} className="fill-blue-400" />
                        <span>Key Features</span>
                    </motion.div>
                    <motion.h2
                        className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                    >
                        Everything You Need for <br className="hidden md:block" />
                        <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-300 to-blue-600">Notifications</span>
                    </motion.h2>
                    <motion.p
                        className="max-w-2xl mx-auto text-lg text-slate-400"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        A lightweight backend notification service for Email and WhatsApp with scheduled delivery, automatic retries, and real-time status updates.
                    </motion.p>
                </div>

                {/* Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 auto-rows-auto md:auto-rows-[200px]">

                    {/* 1. Multi-Channel Delivery - Tall (2x2) */}
                    <motion.div
                        className="md:col-span-2 md:row-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden group min-h-[200px]"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        whileHover={{ scale: 1.02, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)" }}
                    >
                        <div className="flex-1 flex items-center justify-center">
                            <div className="relative">
                                <GlobalNetwork />
                            </div>
                        </div>
                        <div className="mt-auto relative z-20 bg-zinc-900/50 backdrop-blur-sm rounded-lg p-2">
                            <h3 className="text-xl text-white flex items-center gap-2 font-bold">
                                <Globe className="w-5 h-5" />
                                Multi-Channel Delivery
                            </h3>
                            <p className="text-gray-400 text-sm mt-1">Unified API for Email and WhatsApp. Reach users wherever they are.</p>
                        </div>
                    </motion.div>

                    {/* 2. Single & Batch (Layouts) - Standard (2x1) */}
                    <motion.div
                        className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-8 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden min-h-[200px]"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        whileHover={{ scale: 0.98 }}
                    >
                        <div className="flex-1">
                            <LayoutAnimation />
                        </div>
                        <div className="mt-4">
                            <h3 className="text-xl text-white font-bold flex items-center gap-2">
                                <Layers className="w-5 h-5" />
                                Single & Batch
                            </h3>
                            <p className="text-gray-400 text-sm mt-1">Scale from one to thousands easily.</p>
                        </div>
                    </motion.div>

                    {/* 3. Automatic Retries - (Repeated Shields) - Standard (2x1) */}
                    <motion.div
                        className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-8 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden min-h-[200px]"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        whileHover={{ scale: 0.98 }}
                    >
                        <div className="flex-1">
                            <RetryAnimation />
                        </div>
                        <div className="mt-4">
                            <h3 className="text-xl text-white font-bold flex items-center gap-2">
                                <Repeat className="w-5 h-5" />
                                Automatic Retries
                            </h3>
                            <p className="text-gray-400 text-sm mt-1">Exponential backoff ensures success.</p>
                        </div>
                    </motion.div>

                    {/* 4. Scheduled Delivery - Standard (2x1) */}
                    <motion.div
                        className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-8 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden min-h-[200px]"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        whileHover={{ scale: 0.98 }}
                    >
                        <div className="flex-1">
                            <ClockAnimation />
                        </div>
                        <div className="mt-4">
                            <h3 className="text-xl text-white flex items-center gap-2 font-bold">
                                <Clock className="w-5 h-5" />
                                Scheduled Delivery
                            </h3>
                            <p className="text-gray-400 text-sm mt-1">Time-sensitive notifications delivered exactly when needed.</p>
                        </div>
                    </motion.div>
                    {/* 5. Max Delivery Guarantee - Standard (2x1) */}
                    <motion.div
                        className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-8 flex flex-col hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden min-h-[200px]"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4 }}
                        whileHover={{ scale: 0.98 }}
                    >
                        <div className="flex-1">
                            <GuaranteeAnimation />
                        </div>
                        <div className="mt-4">
                            <h3 className="text-xl text-white flex items-center gap-2 font-bold">
                                <ShieldCheck className="w-5 h-5" />
                                Max Delivery Guarantee
                            </h3>
                            <p className="text-gray-400 text-sm mt-1">Built-in redundancy and DLQs ensure no message is ever lost.</p>
                        </div>
                    </motion.div>

                    {/* 6. Admin Dashboard - Wide (6x1) */}
                    <motion.div
                        className="md:col-span-6 bg-zinc-900 border border-zinc-800 rounded-xl p-8 flex flex-col md:flex-row items-center justify-between hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden min-h-[200px] gap-8"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5 }}
                        whileHover={{ scale: 0.98 }}
                    >
                        <div className="flex-1 text-left relative z-10 order-2 md:order-1">
                            <h3 className="text-2xl text-white font-bold flex items-center gap-2">
                                <BarChart3 className="w-6 h-6" />
                                Admin Dashboard
                            </h3>
                            <p className="text-gray-400 mt-2 max-w-lg">
                                Visual analytics, events explorer, and failed notification management.
                            </p>
                        </div>
                        <div className="flex-1 w-full flex items-center justify-center md:justify-end order-1 md:order-2">
                            <div className="w-full max-w-md transform scale-90 md:scale-100 origin-center md:origin-right">
                                <DashboardAnimation />
                            </div>
                        </div>
                    </motion.div>

                </div>
            </div>
        </section>
    )
}
