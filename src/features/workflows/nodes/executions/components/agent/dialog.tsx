"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useRef } from "react";
import z from "zod";
import Link from "next/link";
import { AI_PROVIDERS } from "@/features/credentials/lib/ai-providers";
import { useApiKeysByType } from "@/features/credentials/hooks/use-credentials";
import type { AgentNodeData } from "./types";

const formSchema = z.object({
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(
      /^[A-Za-z_$][A-Za-z0-9_$]*$/,
      "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores",
    ),
  provider: z.enum(["OPENAI", "ANTHROPIC", "GEMINI", "GROQ"]),
  credentialId: z.string().min(1, "Credential is required"),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().min(1, "User prompt is required"),
  maxSteps: z.number().int().min(1, "Must be at least 1").max(15, "Must be 15 or fewer"),
});

export type AgentFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AgentFormValues) => void;
  defaultValues?: Partial<AgentNodeData>;
}

function toFormDefaults(data: Partial<AgentNodeData> = {}): AgentFormValues {
  return {
    variableName: data.variableName || "",
    provider: data.provider || "OPENAI",
    credentialId: data.credentialId || "",
    systemPrompt: data.systemPrompt || "",
    userPrompt: data.userPrompt || "",
    maxSteps: data.maxSteps ?? 5,
  };
}

export const AgentNodeDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const form = useForm<AgentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormDefaults(defaultValues),
  });

  // Reset the whole form to the node's saved values every time the dialog
  // opens — but NOT on every keystroke while it's open. Guards against
  // clobbering an in-progress edit if `defaultValues`' object identity
  // happens to change while open (it doesn't today, but matches the same
  // open-gated pattern every other node dialog in this codebase already
  // uses, e.g. ai-dialog.tsx).
  //
  // Tracks the provider value the form was last explicitly set to (by this
  // reset, or by the user's own change below) — NOT a "skip the next
  // change" boolean. A boolean armed on every open and consumed by a
  // *separate* effect keyed on watchProvider is fragile: if reset() doesn't
  // actually change provider's resolved value (the common case — reopening
  // an unedited, already-configured node), that consuming effect never
  // fires this cycle, so the flag stays armed and gets wrongly spent on the
  // user's own first real change instead. Comparing watchProvider directly
  // against "the value we last intentionally set it to" is correct
  // regardless of whether reset() produced a distinct render.
  const lastSyncedProviderRef = useRef(toFormDefaults(defaultValues).provider);
  useEffect(() => {
    if (open) {
      const defaults = toFormDefaults(defaultValues);
      form.reset(defaults);
      lastSyncedProviderRef.current = defaults.provider;
    }
  }, [open, defaultValues, form]);

  const watchProvider = form.watch("provider");
  const watchVariableName = form.watch("variableName") || "myAgent";

  // Switching providers invalidates whatever credential was selected (it
  // belongs to the old provider's type) — clear it. Compares against the
  // ref above rather than the previous render's value, so this only fires
  // for a real, user-driven provider change, not the render where
  // watchProvider merely catches up to what reset() just assigned it.
  useEffect(() => {
    if (watchProvider === lastSyncedProviderRef.current) return;
    lastSyncedProviderRef.current = watchProvider;
    form.setValue("credentialId", "");
  }, [watchProvider, form]);

  const { data: credentials, isLoading: isLoadingCredentials } = useApiKeysByType(watchProvider);
  const hasCredentials = Boolean(credentials?.length);
  const providerLabel = AI_PROVIDERS.find((p) => p.type === watchProvider)?.label ?? watchProvider;

  const handleSubmit = (values: AgentFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Agent</DialogTitle>
          <DialogDescription>
            Configure the model, prompt, and tool-call limit for this agent.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8 mt-4">
            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="myAgent" />
                  </FormControl>
                  <FormDescription>
                    Use this name to reference the result in other nodes:{" "}
                    {`{{${watchVariableName}.text}}`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model Provider</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AI_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.type} value={provider.type}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{providerLabel} Credential</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isLoadingCredentials || !hasCredentials}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            isLoadingCredentials
                              ? "Loading credentials..."
                              : hasCredentials
                                ? "Select a credential"
                                : "No credentials saved yet"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials?.map((credential) => (
                        <SelectItem key={credential.id} value={credential.id}>
                          {credential.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isLoadingCredentials && !hasCredentials && (
                    <FormDescription>
                      <Link href="/credentials" className="underline">
                        Add a {providerLabel} API key
                      </Link>{" "}
                      first.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="systemPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>System Prompt (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="You are a helpful assistant with access to tools."
                      className="min-h-[80px] font-mono text-sm"
                    />
                  </FormControl>
                  <FormDescription>
                    Use {"{{variables}}"} to reference earlier nodes' output.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="userPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="What's the weather in {{myApiCall.httpResponse.data.city}}?"
                      className="min-h-[120px] font-mono text-sm"
                    />
                  </FormControl>
                  <FormDescription>
                    The prompt sent to the model. Use {"{{variables}}"} to reference earlier
                    nodes' output.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxSteps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Steps</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={15}
                      {...field}
                      onChange={(event) => field.onChange(Number(event.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    How many model round-trips this agent can take (including tool calls) before
                    it must return a final answer. 1-15.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="mt-4">
              <Button className="w-full" type="submit">
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
