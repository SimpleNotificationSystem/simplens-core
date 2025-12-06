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
import { Loader2, Send, Mail, MessageCircle, Plus, Trash2 } from "lucide-react";

// Generate a UUIDv4
function generateUUID(): string {
    return crypto.randomUUID();
}

interface Recipient {
    id: string;
    request_id: string;
    user_id: string;
    email: string;
    phone: string;
    variables: string; // JSON string
}

function createNewRecipient(): Recipient {
    return {
        id: generateUUID(),
        request_id: generateUUID(),
        user_id: "",
        email: "",
        phone: "",
        variables: "{}"
    };
}

interface BatchNotificationFormProps {
    onSuccess?: () => void;
}

export function BatchNotificationForm({ onSuccess }: BatchNotificationFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [channels, setChannels] = useState<string[]>(["email"]);
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>();

    // Form fields - use UUID for client_id
    const [clientId] = useState(generateUUID());
    const [emailSubject, setEmailSubject] = useState("");
    const [emailMessage, setEmailMessage] = useState("");
    const [whatsappMessage, setWhatsappMessage] = useState("");
    const [recipients, setRecipients] = useState<Recipient[]>([createNewRecipient()]);

    // Sample variables for preview
    const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

    const toggleChannel = (channel: string) => {
        setChannels((prev) =>
            prev.includes(channel)
                ? prev.filter((c) => c !== channel)
                : [...prev, channel]
        );
    };

    const addRecipient = () => {
        setRecipients([...recipients, createNewRecipient()]);
    };

    const removeRecipient = (id: string) => {
        if (recipients.length > 1) {
            setRecipients(recipients.filter((r) => r.id !== id));
        }
    };

    const updateRecipient = (id: string, field: keyof Recipient, value: string) => {
        setRecipients(
            recipients.map((r) => (r.id === id ? { ...r, [field]: value } : r))
        );

        // Update preview variables from first recipient
        if (field === "variables" && recipients[0].id === id) {
            try {
                setPreviewVariables(JSON.parse(value));
            } catch {
                // Invalid JSON, ignore
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (channels.length === 0) {
            toast.error("Please select at least one channel");
            return;
        }

        const validRecipients = recipients.filter((r) => {
            if (!r.user_id) return false;
            if (channels.includes("email") && !r.email) return false;
            if (channels.includes("whatsapp") && !r.phone) return false;
            return true;
        });

        if (validRecipients.length === 0) {
            toast.error("Please add at least one valid recipient with user_id and required contact info");
            return;
        }

        setIsLoading(true);

        try {
            const payload = {
                type: "batch",
                client_id: clientId,
                channel: channels,
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
                recipients: validRecipients.map((r) => ({
                    request_id: r.request_id,
                    user_id: r.user_id,
                    ...(channels.includes("email") && { email: r.email }),
                    ...(channels.includes("whatsapp") && { phone: r.phone }),
                    variables: (() => {
                        try {
                            return JSON.parse(r.variables);
                        } catch {
                            return {};
                        }
                    })(),
                })),
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

            toast.success(`Batch notification sent to ${validRecipients.length} recipient(s)!`);
            onSuccess?.();

            // Reset form with new recipients
            setRecipients([createNewRecipient()]);
            setEmailSubject("");
            setEmailMessage("");
            setWhatsappMessage("");
            setScheduledDate(undefined);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to send batch notification");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                {/* Left Column - Form */}
                <div className="space-y-6">
                    {/* Channels */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">Channels</CardTitle>
                        </CardHeader>
                        <CardContent className="flex gap-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="batch-email"
                                    checked={channels.includes("email")}
                                    onCheckedChange={() => toggleChannel("email")}
                                />
                                <Label htmlFor="batch-email" className="flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    Email
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="batch-whatsapp"
                                    checked={channels.includes("whatsapp")}
                                    onCheckedChange={() => toggleChannel("whatsapp")}
                                />
                                <Label htmlFor="batch-whatsapp" className="flex items-center gap-2">
                                    <MessageCircle className="h-4 w-4" />
                                    WhatsApp
                                </Label>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recipients */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-medium">Recipients</CardTitle>
                                    <CardDescription>Add multiple recipients with template variables</CardDescription>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={addRecipient}>
                                    <Plus className="h-4 w-4 mr-1" />
                                    Add
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {recipients.map((recipient, index) => (
                                <div key={recipient.id} className="border rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">Recipient {index + 1}</span>
                                        {recipients.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeRecipient(recipient.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                    <Input
                                        placeholder="User ID * (UUID: e.g. a1b2c3d4-e5f6-7890-abcd-ef1234567890)"
                                        value={recipient.user_id}
                                        onChange={(e) => updateRecipient(recipient.id, "user_id", e.target.value)}
                                        className="font-mono text-xs"
                                    />
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {channels.includes("email") && (
                                            <Input
                                                placeholder="Email * (e.g. user@example.com)"
                                                type="email"
                                                value={recipient.email}
                                                onChange={(e) => updateRecipient(recipient.id, "email", e.target.value)}
                                            />
                                        )}
                                        {channels.includes("whatsapp") && (
                                            <Input
                                                placeholder="Phone * (E.164: +15551234567)"
                                                value={recipient.phone}
                                                onChange={(e) => updateRecipient(recipient.id, "phone", e.target.value)}
                                            />
                                        )}
                                    </div>
                                    <Input
                                        placeholder='Variables (optional): {"name": "Alice", "promo_code": "SUMMER20"}'
                                        value={recipient.variables === "{}" ? "" : recipient.variables}
                                        onChange={(e) => updateRecipient(recipient.id, "variables", e.target.value || "{}")}
                                        className="font-mono text-xs"
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Email Content */}
                    {channels.includes("email") && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">Email Template</CardTitle>
                                <CardDescription>Use {"{{variable}}"} for personalization</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="batch-subject">Subject *</Label>
                                    <Input
                                        id="batch-subject"
                                        placeholder="Hello {{name}}!"
                                        value={emailSubject}
                                        onChange={(e) => setEmailSubject(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="batch-message">Message (HTML) *</Label>
                                    <Textarea
                                        id="batch-message"
                                        placeholder="<h1>Hello {{name}}!</h1><p>Your code is {{code}}.</p>"
                                        value={emailMessage}
                                        onChange={(e) => setEmailMessage(e.target.value)}
                                        rows={8}
                                        className="font-mono text-sm"
                                        required
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* WhatsApp Content */}
                    {channels.includes("whatsapp") && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">WhatsApp Template</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Textarea
                                    placeholder="Hi {{name}}, your code is {{code}}."
                                    value={whatsappMessage}
                                    onChange={(e) => setWhatsappMessage(e.target.value)}
                                    rows={4}
                                    required
                                />
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
                                Send Batch ({recipients.length} recipient{recipients.length > 1 ? "s" : ""})
                            </>
                        )}
                    </Button>
                </div>

                {/* Right Column - Preview */}
                <div className="space-y-6">
                    {channels.includes("email") && emailMessage && (
                        <HtmlPreview html={emailMessage} variables={previewVariables} />
                    )}
                    {!channels.includes("email") && (
                        <Card>
                            <CardContent className="pt-6 text-center text-muted-foreground">
                                Select email channel to see preview
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </form>
    );
}
