import { cn } from "@/lib/utils";

interface DocsTableProps {
    headers: string[];
    rows: (string | React.ReactNode)[][];
    className?: string;
}

export function DocsTable({ headers, rows, className }: DocsTableProps) {
    return (
        <div className={cn("my-6 overflow-x-auto rounded-lg border", className)}>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-muted/50">
                        {headers.map((header, index) => (
                            <th
                                key={index}
                                className="px-4 py-3 text-left font-semibold border-b"
                            >
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => (
                        <tr
                            key={rowIndex}
                            className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                        >
                            {row.map((cell, cellIndex) => (
                                <td
                                    key={cellIndex}
                                    className="px-4 py-3 align-top"
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

interface FieldTableProps {
    fields: {
        name: string;
        type: string;
        required: boolean | "conditional";
        description: string;
    }[];
}

export function FieldTable({ fields }: FieldTableProps) {
    return (
        <DocsTable
            headers={["Field", "Type", "Required", "Description"]}
            rows={fields.map((field) => [
                <code key={field.name} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {field.name}
                </code>,
                <span key={`${field.name}-type`} className="text-muted-foreground font-mono text-xs">
                    {field.type}
                </span>,
                field.required === "conditional" ? (
                    <span className="text-yellow-600 dark:text-yellow-400">Conditional</span>
                ) : field.required ? (
                    <span className="text-green-600 dark:text-green-400">✓ Yes</span>
                ) : (
                    <span className="text-muted-foreground">No</span>
                ),
                field.description,
            ])}
        />
    );
}
