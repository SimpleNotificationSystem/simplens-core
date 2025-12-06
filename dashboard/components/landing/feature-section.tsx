import {
    ClockIcon,
    RocketIcon,
    CodeIcon,
    LayersIcon,
} from "@radix-ui/react-icons"
import { Zap } from "lucide-react"

import { BentoCard, BentoGrid } from "../../components/ui/bento-grid"
import {
    ChannelFlowBackground,
    BatchNotificationBackground,
    ScheduleClockBackground,
    RetryFlowBackground,
} from "./backgrounds"

const features = [
    {
        Icon: LayersIcon,
        name: "Multi-Channel Delivery",
        description: "Single integration, multiple delivery paths.",
        background: <ChannelFlowBackground />,
        className: "lg:row-start-1 lg:row-end-4 lg:col-start-2 lg:col-end-3",
    },
    {
        Icon: RocketIcon,
        name: "Single & Batch Notifications",
        description: "Scale from one recipient to thousands with the same API.",
        background: <BatchNotificationBackground />,
        className: "lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3",
    },
    {
        Icon: ClockIcon,
        name: "Scheduled Delivery",
        description: "Schedule notifications for future delivery with precision timing.",
        background: <ScheduleClockBackground />,
        className: "lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4",
    },

    {
        Icon: CodeIcon,
        name: "Automatic Retries",
        description: "Exponential backoff retries ensure maximum delivery success.",
        background: <RetryFlowBackground />,
        className: "lg:col-start-3 lg:col-end-3 lg:row-start-1 lg:row-end-4",
    }
]

export function FeatureSection() {
    return (
        <div id="features" className="w-full flex flex-col justify-center items-center p-5 gap-5 bg-black">
            <div className="mb-20 text-center relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/20 border border-blue-500/20 text-blue-400 text-xs font-medium uppercase tracking-wider mb-4">
                    <Zap size={12} className="fill-blue-400" />
                    <span>Key Features</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
                    Everything You Need for <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-300 to-blue-600">Notifications</span>
                </h2>
                <p className="max-w-2xl mx-auto text-lg text-slate-400">
                    A lightweight backend notification service for Email and WhatsApp with scheduled delivery, automatic retries, and real-time status updates.
                </p>
            </div>
            <BentoGrid className="lg:grid-rows-3 w-full sm:w-[80%]">
                {features.map((feature) => (
                    <BentoCard key={feature.name} {...feature} />
                ))}
            </BentoGrid>
        </div>
    )
}
