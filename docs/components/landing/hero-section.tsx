import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AnimatedGroup } from '@/components/ui/animated-group'
import Image from 'next/image'

const transitionVariants = {
    item: {
        hidden: {
            opacity: 0,
            filter: 'blur(12px)',
            y: 12,
        },
        visible: {
            opacity: 1,
            filter: 'blur(0px)',
            y: 0,
            transition: {
                type: 'spring' as const,
                bounce: 0.3,
                duration: 1.5,
            },
        },
    },
}

export function HeroSection() {
    return (
        <div className="bg-black text-white relative">
            {/* Grid pattern background */}
            <div
                className="absolute inset-0 bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)]"
                style={{ backgroundSize: '40px 40px' }}
            />
            {/* Radial gradient overlay for faded look */}
            <div className="pointer-events-none absolute inset-0 bg-black mask-[radial-gradient(ellipse_at_center,transparent_20%,black)]" />
            <main className="overflow-hidden relative">
                <section className="relative">
                    <div className="relative pt-24 md:pt-36">
                        {/* Inner radial gradient */}
                        <div
                            aria-hidden
                            className="absolute inset-0 -z-10 size-full"
                            style={{ background: 'radial-gradient(125% 125% at 50% 100%, rgba(0,0,0,0.7) 0%, black 75%)' }}
                        />
                        <div className="mx-auto max-w-7xl px-6">
                            <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                                <AnimatedGroup variants={transitionVariants}>
                                    <h1 className="mt-8 w-full mx-auto font-bold text-5xl md:text-7xl lg:mt-16 xl:text-[5.25rem] flex flex-col md:flex-row md:justify-center md:gap-4">
                                        <span className="text-white">Simple.</span>
                                        <span className="text-white">Scalable.</span>
                                        <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-300 to-blue-600">Notifications.</span>
                                    </h1>
                                    <p className="mx-auto mt-8 w-full text-balance text-2xl text-zinc-400">
                                        Deliver Email & WhatsApp messages at scale
                                    </p>
                                </AnimatedGroup>

                                <AnimatedGroup
                                    variants={{
                                        container: {
                                            visible: {
                                                transition: {
                                                    staggerChildren: 0.05,
                                                    delayChildren: 0.75,
                                                },
                                            },
                                        },
                                        ...transitionVariants,
                                    }}
                                    className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row">
                                    <div
                                        key={1}
                                        className="bg-white/10 rounded-[14px] border border-zinc-700 p-0.5">
                                        <Button
                                            asChild
                                            size="lg"
                                            className="rounded-xl px-5 text-base bg-white text-black hover:bg-zinc-200">
                                            <Link href={process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/"}>
                                                <span className="text-nowrap">Get Started</span>
                                            </Link>
                                        </Button>
                                    </div>
                                    <Button
                                        key={2}
                                        asChild
                                        size="lg"
                                        className="h-10.5 rounded-xl px-5 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white">
                                        <Link href="/docs">
                                            <span className="text-nowrap">Documentation</span>
                                        </Link>
                                    </Button>
                                </AnimatedGroup>
                            </div>
                        </div>

                        <AnimatedGroup
                            variants={{
                                container: {
                                    visible: {
                                        transition: {
                                            staggerChildren: 0.05,
                                            delayChildren: 0.75,
                                        },
                                    },
                                },
                                ...transitionVariants,
                            }}>
                            <div className="relative -mr-56 mt-8 overflow-hidden px-2 sm:mr-0 sm:mt-12 md:mt-20">
                                <div
                                    aria-hidden
                                    className="absolute inset-0 z-10 bg-linear-to-b from-transparent from-35% to-black"
                                />
                                <div className="bg-zinc-900 relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-zinc-800 p-4 shadow-lg shadow-black/50">
                                    <Image
                                        src="/DashboardUI.png"
                                        alt="app screen"
                                        width="2700"
                                        height="1440"
                                    />
                                </div>
                            </div>
                        </AnimatedGroup>
                    </div>
                </section>
            </main>
        </div>
    )
}