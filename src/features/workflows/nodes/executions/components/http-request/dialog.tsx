"use client"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import z from "zod";

const formSchema = z.object({
    endpoint: z.url("Please enter a valid url"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    body: z.string()
        .optional()
    // .refine()
})
export type HttpRequestFormValues = z.infer<typeof formSchema>

interface Props {
    open: boolean,
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: z.infer<typeof formSchema>) => void;
    defaultValues?: Partial<HttpRequestFormValues>;
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
import { useForm } from "react-hook-form"
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const HttpRequestNodeDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}

}: Props) => {
    const form = useForm<HttpRequestFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            endpoint: defaultValues.endpoint || "",
            method: defaultValues.method || "GET",
            body: defaultValues.body || ""
        }
    })

    useEffect(() => {
        if (open) {
            form.reset({
                endpoint: defaultValues.endpoint || "",
                method: defaultValues.method || "GET",
                body: defaultValues.body || ""
            })
        }
    }, [open, defaultValues, form])

    const watchMethod = form.watch("method")
    const showBodyField = ["POST", "PUT", "PATCH"].includes(watchMethod)

    const handleSubmit = (values: HttpRequestFormValues) => {
        onSubmit(values);
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
                        <DialogFooter className="mt-4">
                            <Button className="w-full" type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
