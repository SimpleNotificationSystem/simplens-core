"use client";

import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
    value?: Date;
    onChange: (date: Date | undefined) => void;
    placeholder?: string;
}

export function DateTimePicker({ value, onChange, placeholder = "Pick a date & time" }: DateTimePickerProps) {
    const [date, setDate] = useState<Date | undefined>(value);
    const [hours, setHours] = useState(value ? value.getHours().toString().padStart(2, "0") : "00");
    const [minutes, setMinutes] = useState(value ? value.getMinutes().toString().padStart(2, "0") : "00");
    const [seconds, setSeconds] = useState(value ? value.getSeconds().toString().padStart(2, "0") : "00");
    const [isOpen, setIsOpen] = useState(false);

    // Update time when date changes
    useEffect(() => {
        if (date) {
            const h = parseInt(hours) || 0;
            const m = parseInt(minutes) || 0;
            const s = parseInt(seconds) || 0;

            const newDate = new Date(date);
            newDate.setHours(h, m, s, 0);
            onChange(newDate);
        }
    }, [date, hours, minutes, seconds]);

    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            setDate(selectedDate);
        }
    };

    const handleClear = () => {
        setDate(undefined);
        setHours("00");
        setMinutes("00");
        setSeconds("00");
        onChange(undefined);
    };

    const validateTimeInput = (value: string, max: number): string => {
        const num = parseInt(value);
        if (isNaN(num)) return "00";
        if (num < 0) return "00";
        if (num > max) return max.toString().padStart(2, "0");
        return num.toString().padStart(2, "0");
    };

    const formatDisplay = () => {
        if (!date) return placeholder;
        return format(date, "PPP") + ` at ${hours}:${minutes}:${seconds}`;
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDisplay()}
                    {date && (
                        <X
                            className="ml-auto h-4 w-4 opacity-50 hover:opacity-100"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleClear();
                            }}
                        />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleDateSelect}
                    initialFocus
                />
                <div className="border-t p-3 space-y-3">
                    <Label className="text-sm font-medium">Time (HH:MM:SS)</Label>
                    <div className="flex items-center gap-1">
                        <Input
                            type="number"
                            min="0"
                            max="23"
                            value={hours}
                            onChange={(e) => setHours(validateTimeInput(e.target.value, 23))}
                            onBlur={() => setHours(validateTimeInput(hours, 23))}
                            className="w-16 text-center font-mono"
                            placeholder="HH"
                        />
                        <span className="text-lg font-bold">:</span>
                        <Input
                            type="number"
                            min="0"
                            max="59"
                            value={minutes}
                            onChange={(e) => setMinutes(validateTimeInput(e.target.value, 59))}
                            onBlur={() => setMinutes(validateTimeInput(minutes, 59))}
                            className="w-16 text-center font-mono"
                            placeholder="MM"
                        />
                        <span className="text-lg font-bold">:</span>
                        <Input
                            type="number"
                            min="0"
                            max="59"
                            value={seconds}
                            onChange={(e) => setSeconds(validateTimeInput(e.target.value, 59))}
                            onBlur={() => setSeconds(validateTimeInput(seconds, 59))}
                            className="w-16 text-center font-mono"
                            placeholder="SS"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setIsOpen(false)}
                    >
                        Done
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
