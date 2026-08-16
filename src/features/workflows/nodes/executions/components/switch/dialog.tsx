"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import z from "zod";
import { createId } from "@paralleldrive/cuid2";

const caseSchema = z.object({
  id: z.string(),
  value: z.string().min(1, "Case value is required"),
});

const formSchema = z.object({
  value: z.string().min(1, "Value is required"),
  cases: z.array(caseSchema),
});

export type SwitchFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SwitchFormValues) => void;
  defaultValues?: Partial<SwitchFormValues>;
}

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlusIcon, TrashIcon } from "lucide-react";

export const SwitchNodeDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<SwitchFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: defaultValues.value || "",
      cases: defaultValues.cases || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "cases",
  });

  useEffect(() => {
    if (open) {
      form.reset({
        value: defaultValues.value || "",
        cases: defaultValues.cases || [],
      });
    }
  }, [open, defaultValues, form]);

  const handleSubmit = (values: SwitchFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch</DialogTitle>
          <DialogDescription>
            Route the workflow to a matching case, or Default if nothing matches.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8 mt-4">
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="{{myApiCall.httpResponse.data.status}}" />
                  </FormControl>
                  <FormDescription>
                    The value to match against each case below. Reference an earlier
                    node&apos;s output with {"{{variableName.path.to.value}}"}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <FormLabel>Cases</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-2">
                  <FormField
                    control={form.control}
                    name={`cases.${index}.value`}
                    render={({ field: caseField }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...caseField} placeholder="active" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ id: createId(), value: "" })}
              >
                <PlusIcon className="size-4" />
                Add case
              </Button>
              <FormDescription>
                Anything that doesn&apos;t match a case routes to the Default output.
                Case values also support {"{{variables}}"}.
              </FormDescription>
            </div>

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
