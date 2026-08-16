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

const OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "lessThan",
  "isEmpty",
  "isNotEmpty",
] as const;

const OPERATORS_WITHOUT_COMPARE_VALUE = new Set(["isEmpty", "isNotEmpty"]);

const formSchema = z
  .object({
    value: z.string().min(1, "Value is required"),
    operator: z.enum(OPERATORS),
    compareValue: z.string().optional(),
  })
  .refine(
    (data) => OPERATORS_WITHOUT_COMPARE_VALUE.has(data.operator) || !!data.compareValue,
    { message: "Compare value is required for this operator", path: ["compareValue"] },
  );

export type IfFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: IfFormValues) => void;
  defaultValues?: Partial<IfFormValues>;
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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const OPERATOR_LABELS: Record<(typeof OPERATORS)[number], string> = {
  equals: "Equals",
  notEquals: "Does not equal",
  contains: "Contains",
  notContains: "Does not contain",
  startsWith: "Starts with",
  endsWith: "Ends with",
  greaterThan: "Greater than",
  lessThan: "Less than",
  isEmpty: "Is empty",
  isNotEmpty: "Is not empty",
};

export const IfNodeDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const form = useForm<IfFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: defaultValues.value || "",
      operator: defaultValues.operator || "equals",
      compareValue: defaultValues.compareValue || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        value: defaultValues.value || "",
        operator: defaultValues.operator || "equals",
        compareValue: defaultValues.compareValue || "",
      });
    }
  }, [open, defaultValues, form]);

  const watchOperator = form.watch("operator");
  const showCompareValue = !OPERATORS_WITHOUT_COMPARE_VALUE.has(watchOperator);

  const handleSubmit = (values: IfFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>IF</DialogTitle>
          <DialogDescription>
            Branch the workflow based on a condition.
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
                    The value to check. Reference an earlier node&apos;s output with{" "}
                    {"{{variableName.path.to.value}}"}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="operator"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condition</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a condition" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {OPERATORS.map((operator) => (
                        <SelectItem key={operator} value={operator}>
                          {OPERATOR_LABELS[operator]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showCompareValue && (
              <FormField
                control={form.control}
                name="compareValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compare To</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="200" />
                    </FormControl>
                    <FormDescription>
                      The value to compare against. Also supports {"{{variables}}"}.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
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
