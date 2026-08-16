"use client"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import z from "zod";
import type { AiToolConfig } from "../../lib/ai-tool";
import type { HttpRequestData } from "./executor";

const aiToolParameterSchema = z.object({
    name: z.string()
        .min(1, "Parameter name is required")
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "Parameter name must start with a letter or an underscore and contain only letters, numbers, and underscores"),
    type: z.enum(["string", "number", "boolean"]),
    description: z.string().min(1, "Description is required"),
});

const formSchema = z.object({
    variableName: z.string()
        .min(1, "variable name is required")
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "variable name must start with a letter or an underscore and contain only letters, numbers, and underscores"),
    endpoint: z.url("Please enter a valid url"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    body: z.string()
        .optional(),
    aiToolEnabled: z.boolean(),
    aiToolDescription: z.string().optional(),
    aiToolParameters: z.array(aiToolParameterSchema),
}).refine(
    (data) => !data.aiToolEnabled || Boolean(data.aiToolDescription?.trim()),
    { message: "Tool description is required when \"Use as AI Tool\" is enabled", path: ["aiToolDescription"] },
)
export type HttpRequestFormValues = z.infer<typeof formSchema>

/** The shape actually persisted onto the node's data — `onSubmit` receives this, not the flat form shape above. */
export interface HttpRequestSubmitValues {
    variableName: string;
    endpoint: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: string;
    aiTool?: AiToolConfig;
}

interface Props {
    open: boolean,
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: HttpRequestSubmitValues) => void;
    defaultValues?: Partial<HttpRequestData>;
};
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form"
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlusIcon, TrashIcon } from "lucide-react";

function toFormDefaults(data: Partial<HttpRequestData> = {}): HttpRequestFormValues {
    return {
        variableName: data.variableName || "",
        endpoint: data.endpoint || "",
        method: data.method || "GET",
        body: data.body || "",
        aiToolEnabled: Boolean(data.aiTool),
        aiToolDescription: data.aiTool?.description || "",
        aiToolParameters: data.aiTool?.parameters || [],
    };
}

export const HttpRequestNodeDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}

}: Props) => {
    const form = useForm<HttpRequestFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: toFormDefaults(defaultValues),
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "aiToolParameters",
    });

    useEffect(() => {
        if (open) {
            form.reset(toFormDefaults(defaultValues))
        }
    }, [open, defaultValues, form])

    const watchVariableName = form.watch("variableName") || "myApiCall"

    const watchMethod = form.watch("method")
    const showBodyField = ["POST", "PUT", "PATCH"].includes(watchMethod)

    const watchAiToolEnabled = form.watch("aiToolEnabled")

    const handleSubmit = (values: HttpRequestFormValues) => {
        const { aiToolEnabled, aiToolDescription, aiToolParameters, ...rest } = values;
        onSubmit({
            ...rest,
            aiTool: aiToolEnabled
                ? { description: aiToolDescription ?? "", parameters: aiToolParameters }
                : undefined,
        });
        onOpenChange(false)
    }


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>HTTP</DialogTitle>
                    <DialogDescription>
                        Configure the settings for HTTP requests.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(handleSubmit)}
                        className="space-y-8 mt-4"
                    >
                        <FormField
                            control={form.control}
                            name="variableName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Variable Name</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="myApiCall"
                                        />
                                    </FormControl>

                                    <FormDescription>
                                        Use this name to reference the result in other nodes: {" "}
                                        {`{{${watchVariableName}.httpResponse.data}}`}

                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="method"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Method</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select a method" />

                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="GET">GET</SelectItem>
                                            <SelectItem value="POST">POST</SelectItem>
                                            <SelectItem value="PUT">PUT</SelectItem>
                                            <SelectItem value="PATCH">PATCH</SelectItem>
                                            <SelectItem value="DELETE">DELETE</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        HTTP method for this request
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="endpoint"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Endpoint URL</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="https://api.example.com/users/{{httpResponse.data.id}}"
                                        />
                                    </FormControl>

                                    <FormDescription>
                                        Define the target API endpoint here. You can enter a static URL directly, or inject dynamic values using {"{ variables }"} for simple strings/numbers, and {"{ json variable }"} when you need to insert or stringify entire objects.

                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {showBodyField && (
                            <FormField
                                control={form.control}
                                name="body"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Body</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                {...field}
                                                placeholder={'{\n  \"name\": \"{{workflowData.userName}}\",\n  \"email\": \"{{workflowData.userEmail}}\",\n  \"role\": \"{{workflowData.userRole}}\",\n  \"status\": \"{{workflowData.userStatus}}\"\n}'}
                                                className="min-h-[120px] font-mono text-sm"
                                            />
                                        </FormControl>

                                        <FormDescription>
                                            Provide the request payload here. You can enter raw JSON, or inject dynamic values using {"{ variables }"} for simple strings/numbers, and {"{ json variable }"} when you need to insert or stringify entire objects.

                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                        <FormField
                            control={form.control}
                            name="aiToolEnabled"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
                                    <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>Use as AI Tool</FormLabel>
                                        <FormDescription>
                                            Let an Agent node call this HTTP Request with arguments it decides at runtime.
                                        </FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />
                        {watchAiToolEnabled && (
                            <>
                                <FormField
                                    control={form.control}
                                    name="aiToolDescription"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tool Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...field}
                                                    placeholder="Looks up the current weather for a city"
                                                    className="min-h-[60px]"
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                Shown to the model so it knows when to call this tool.
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="space-y-3">
                                    <FormLabel>Parameters</FormLabel>
                                    <FormDescription>
                                        Each parameter becomes available in the fields above as {"{{ $fromAI.paramName }}"}. The model fills these in at call time.
                                    </FormDescription>
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="flex items-start gap-2 rounded-md border p-3">
                                            <div className="flex-1 space-y-2">
                                                <FormField
                                                    control={form.control}
                                                    name={`aiToolParameters.${index}.name`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <Input {...field} placeholder="city" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`aiToolParameters.${index}.type`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="string">string</SelectItem>
                                                                    <SelectItem value="number">number</SelectItem>
                                                                    <SelectItem value="boolean">boolean</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`aiToolParameters.${index}.description`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <Input {...field} placeholder="The city to look up" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => remove(index)}
                                                aria-label="Remove parameter"
                                            >
                                                <TrashIcon className="size-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => append({ name: "", type: "string", description: "" })}
                                    >
                                        <PlusIcon className="size-4" />
                                        Add parameter
                                    </Button>
                                </div>
                            </>
                        )}
                        <DialogFooter className="mt-4">
                            <Button className="w-full" type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
