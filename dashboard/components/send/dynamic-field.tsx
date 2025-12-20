import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FieldDefinition } from "@/lib/types"; // We'll need to define this interface in dashboard types

interface DynamicFieldProps {
    field: FieldDefinition;
    value: any;
    onChange: (value: any) => void;
    error?: string;
}

export function DynamicField({ field, value, onChange, error }: DynamicFieldProps) {
    const id = `field-${field.name}`;

    if (field.type === 'boolean') {
        return (
            <div className="flex items-center space-x-2">
                <Checkbox
                    id={id}
                    checked={!!value}
                    onCheckedChange={(checked) => onChange(checked)}
                />
                <Label htmlFor={id} className={error ? "text-red-500" : ""}>
                    {field.name} {field.required && "*"}
                </Label>
                {field.description && (
                    <p className="text-xs text-muted-foreground ml-2">{field.description}</p>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <Label htmlFor={id} className={error ? "text-red-500" : ""}>
                {field.name} {field.required && "*"}
            </Label>

            {field.type === 'text' ? (
                <Textarea
                    id={id}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.description}
                    required={field.required}
                    rows={4}
                    className={error ? "border-red-500" : ""}
                />
            ) : (
                <Input
                    id={id}
                    type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : 'text'}
                    value={value || ''}
                    onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
                    placeholder={field.description}
                    required={field.required}
                    className={error ? "border-red-500" : ""}
                />
            )}

            {field.description && field.type !== 'text' && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}

            {error && (
                <p className="text-xs text-red-500">{error}</p>
            )}
        </div>
    );
}
