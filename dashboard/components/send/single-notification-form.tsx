"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { HtmlPreview } from "./html-preview";
import { toast } from "sonner";
import { Loader2, Send, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Generate a UUIDv4
function generateUUID(): string {
    return crypto.randomUUID();
}

interface SingleNotificationFormProps {
    onSuccess?: () => void;
}

export function SingleNotificationForm({ onSuccess }: SingleNotificationFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [channels, setChannels] = useState<string[]>(["email"]);
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>();

    // Form fields - use UUIDs for IDs
    const [requestId, setRequestId] = useState(generateUUID());
    const [clientId, setClientId] = useState(generateUUID());
    const [userId, setUserId] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [emailSubject, setEmailSubject] = useState("");
    const [emailMessage, setEmailMessage] = useState("");
    const [whatsappMessage, setWhatsappMessage] = useState("");

    const toggleChannel = (channel: string) => {
        setChannels((prev) =>
            prev.includes(channel)
                ? prev.filter((c) => c !== channel)
                : [...prev, channel]
        );
    };

    const regenerateRequestId = () => {
        setRequestId(generateUUID());
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (channels.length === 0) {
            toast.error("Please select at least one channel");
            return;
        }

        if (channels.includes("email") && !email) {
            toast.error("Email is required for email channel");
            return;
        }

        if (channels.includes("whatsapp") && !phone) {
            toast.error("Phone is required for WhatsApp channel");
            return;
        }

        if (!userId) {
            toast.error("User ID is required");
            return;
        }

        setIsLoading(true);

        try {
            const payload = {
                type: "single",
                request_id: requestId,
                client_id: clientId,
                channel: channels,
                recipient: {
                    user_id: userId,
                    ...(channels.includes("email") && { email }),
                    ...(channels.includes("whatsapp") && { phone }),
                },
                content: {
                    ...(channels.includes("email") && {
                        email: {
                            subject: emailSubject,
                            message: emailMessage,
                        },
                    }),
                    ...(channels.includes("whatsapp") && {
                        whatsapp: {
                            message: whatsappMessage,
                        },
                    }),
                },
                ...(scheduledDate && { scheduled_at: scheduledDate.toISOString() }),
            };

            const response = await fetch("/api/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || "Failed to send");
            }

            toast.success("Notification sent successfully!");
            onSuccess?.();

            // Reset form with new UUIDs
            setRequestId(generateUUID());
            setUserId("");
            setEmail("");
            setPhone("");
            setEmailSubject("");
            setEmailMessage("");
            setWhatsappMessage("");
            setScheduledDate(undefined);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to send notification");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full space-y-6">
            {/* Form */}
            <div className="space-y-6">
                {/* Channels */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Channels</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="email"
                                checked={channels.includes("email")}
                                onCheckedChange={() => toggleChannel("email")}
                            />
                            <Label htmlFor="email" className="flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                Email
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="whatsapp"
                                checked={channels.includes("whatsapp")}
                                onCheckedChange={() => toggleChannel("whatsapp")}
                            />
                            <Label htmlFor="whatsapp" className="flex items-center gap-2">
                                <MessageCircle className="h-4 w-4" />
                                WhatsApp
                            </Label>
                        </div>
                    </CardContent>
                </Card>

                {/* Recipient */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Recipient</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="requestId">Request ID (UUID format)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="requestId"
                                        placeholder="e.g. a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                                        value={requestId}
                                        onChange={(e) => setRequestId(e.target.value)}
                                        className="font-mono text-xs"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={regenerateRequestId}
                                        title="Generate new UUID"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="userId">User ID * (string)</Label>
                                <Input
                                    id="userId"
                                    placeholder="user123"
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        {channels.includes("email") && (
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address * (e.g. user@example.com)</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="e.g. john@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        )}
                        {channels.includes("whatsapp") && (
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number * (E.164 format: +CountryCode...)</Label>
                                <Input
                                    id="phone"
                                    type="tel"
                                    placeholder="e.g. +15551234567 or +919876543210"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    required
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Email Content */}
                {channels.includes("email") && (
                    <>
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">Email Content</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="subject">Subject *</Label>
                                    <Input
                                        id="subject"
                                        placeholder="Enter email subject"
                                        value={emailSubject}
                                        onChange={(e) => setEmailSubject(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="message">Message (HTML) *</Label>
                                    <Textarea
                                        id="message"
                                        placeholder="<h1>Hello!</h1><p>Your message here...</p>"
                                        value={emailMessage}
                                        onChange={(e) => setEmailMessage(e.target.value)}
                                        rows={8}
                                        className="font-mono text-sm"
                                        required
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Email Preview - directly under email content */}
                        {emailMessage && (
                            <HtmlPreview html={emailMessage} />
                        )}
                    </>
                )}

                {/* WhatsApp Content */}
                {channels.includes("whatsapp") && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">WhatsApp Content</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <Label htmlFor="whatsappMsg">Message *</Label>
                                <Textarea
                                    id="whatsappMsg"
                                    placeholder="Enter your WhatsApp message..."
                                    value={whatsappMessage}
                                    onChange={(e) => setWhatsappMessage(e.target.value)}
                                    rows={4}
                                    required
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Schedule */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Schedule (Optional)</CardTitle>
                        <CardDescription>Leave empty to send immediately</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DateTimePicker
                            value={scheduledDate}
                            onChange={setScheduledDate}
                            placeholder="Pick a date & time"
                        />
                    </CardContent>
                </Card>

                {/* Submit */}
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                        </>
                    ) : (
                        <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Notification
                        </>
                    )}
                </Button>
            </div>
        </form>
    );
}
