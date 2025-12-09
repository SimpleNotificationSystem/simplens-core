"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, X, Github } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
    { name: "Features", href: "#features" },
    { name: "Architecture", href: "#architecture" },
    { name: "Docs", href: "/docs" },
]

export function HeroHeader() {
    const [isScrolled, setIsScrolled] = React.useState(false)
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)

    React.useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    return (
        <>
            <motion.header
                className={cn(
                    "fixed top-0 left-0 right-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ease-in-out",
                    isScrolled ? "pt-4" : "pt-6"
                )}
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
            >
                <div
                    className={cn(
                        "flex items-center justify-between w-full h-17 transition-all duration-300 ease-in-out",
                        isScrolled
                            ? "max-w-3xl bg-black/80 backdrop-blur-md border border-white/10 rounded-full px-6 py-3 shadow-lg shadow-black/20"
                            : "max-w-7xl bg-transparent px-6 py-2"
                    )}
                >
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2 z-50">
                        <Image
                            src="/SimpleNSLogo.png"
                            alt="SimpleNS Logo"
                            width={32}
                            height={32}
                            className="w-auto h-8"
                        />
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-8">
                        {navItems.map((item) => (
                            <Link
                                key={item.name}
                                href={item.href}
                                className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                            >
                                {item.name}
                            </Link>
                        ))}
                    </nav>

                    {/* Desktop Actions */}
                    <div className="hidden md:flex items-center gap-4">
                        <Button
                            asChild
                            size="sm"
                            className="bg-white text-black hover:bg-zinc-200 rounded-full px-6"
                        >
                            <Link href={process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com"}>
                                <Github/> Github
                            </Link>
                        </Button>
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden text-white z-50 p-2"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    >
                        {isMobileMenuOpen ? (
                            <X className="h-6 w-6" />
                        ) : (
                            <Menu className="h-6 w-6" />
                        )}
                    </button>
                </div>
            </motion.header>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed inset-0 z-40 bg-black/95 backdrop-blur-xl pt-24 px-6 md:hidden"
                    >
                        <nav className="flex flex-col gap-6 items-center">
                            {navItems.map((item) => (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="text-2xl font-medium text-white/80 hover:text-white"
                                >
                                    {item.name}
                                </Link>
                            ))}
                            <div className="h-px w-20 bg-white/10 my-4" />
                            <Link
                                href={process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com"}
                                target="_blank"
                                className="flex items-center gap-2 text-zinc-400 hover:text-white"
                            >
                                <Github className="h-5 w-5" />
                                <span>GitHub</span>
                            </Link>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
