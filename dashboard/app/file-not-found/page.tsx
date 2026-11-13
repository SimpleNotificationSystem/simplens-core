"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import { FileX, CircleX, Clock } from "lucide-react";

function FileContentNotFound() {
    const searchParams = useSearchParams();
    const errorMsg = searchParams.get("error");

    return (

        <Card className="border-dashed mt-5">
            <div className="w-full max-w-2xl mx-auto py-8">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 dark:bg-destructive/20 text-destructive flex items-center justify-center mb-4 ring-8 ring-destructive/5">
                        <FileX className="w-7 h-7" />
                    </div>
                    <CardTitle className="text-xl font-semibold tracking-tight mb-2">
                        File Attachment Not Found
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6 pt-2">
                    <div className="rounded-lg border border-red-500/20 bg-red-200/50 dark:bg-red-500/10 p-3 flex gap-2.5 items-start text-xs text-red-600 dark:text-red-400">
                        <CircleX className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                            <span>
                                { errorMsg || "The requested file attachment could not be located in storage."}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 p-3 flex gap-2.5 items-start text-xs text-amber-600 dark:text-amber-400">
                        <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                            <span>
                                Attachments are retained according to the retention policy.
                                Expired files are automatically cleaned up to save storage.
                            </span>
                        </div>
                    </div>
                </CardContent>
            </div>
        </Card>

    );
}

export default function FileNotFoundPage() {
    return (
        <DashboardLayout title="File Not Found" description="The requested attachment is missing or expired">
            <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
                <FileContentNotFound />
            </Suspense>
        </DashboardLayout>
    );
}
