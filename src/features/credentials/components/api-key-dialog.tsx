"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState, type ReactNode } from "react";
import z from "zod";
import { AI_PROVIDERS, AI_PROVIDER_TYPES } from "../lib/ai-providers";
import { useCreateApiKey } from "../hooks/use-credentials";

const formSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(AI_PROVIDER_TYPES),
    value: z.string().optional(),
    baseUrl: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.type === "OLLAMA") {
      if (!input.baseUrl) {
        ctx.addIssue({ code: "custom", path: ["baseUrl"], message: "Base URL is required" });
      }
    } else if (!input.value) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "API key is required" });
    }
  });

type FormValues = z.infer<typeof formSchema>;

export const ApiKeyDialog = ({ children }: { children?: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const createApiKey = useCreateApiKey();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", type: "OPENAI", value: "", baseUrl: "" },
  });

  const watchType = form.watch("type");
  const isOllama = watchType === "OLLAMA";

  const handleSubmit = (values: FormValues) => {
    createApiKey.mutate(
      {
        name: values.name,
        type: values.type,
        value: values.value || undefined,
        config: values.baseUrl ? { baseUrl: values.baseUrl } : undefined,
      },
      {
        onSuccess: () => {
          form.reset({ name: "", type: "OPENAI", value: "", baseUrl: "" });
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm">
            <PlusIcon className="size-4" />
            Add API key
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add API Key</DialogTitle>
          <DialogDescription>
            Stored encrypted. The key is never shown again after saving — delete
            and re-add it to rotate.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8 mt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="My OpenAI key" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AI_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.type} value={provider.type}>
                          <div className="flex items-center gap-2">
                            <Image src={provider.icon} alt="" width={16} height={16} />
                            {provider.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isOllama ? (
              <>
                <FormField
                  control={form.control}
                  name="baseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base URL</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="http://localhost:11434" />
                      </FormControl>
                      <FormDescription>
                        The address of your Ollama server. Only reachable Ollama instances —
                        localhost only works if Relay itself is running on the same machine.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" placeholder="Only needed for Ollama Cloud" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" placeholder="sk-..." />
                    </FormControl>
                    <FormDescription>
                      Encrypted before it's stored. Never shown again after saving.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter className="mt-4">
              <Button className="w-full" type="submit" disabled={createApiKey.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
