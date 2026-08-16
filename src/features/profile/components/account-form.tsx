"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-client";
import { useUpdateProfile } from "../hooks/use-profile";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export function AccountForm() {
  const { data: session } = useSession();
  const updateProfile = useUpdateProfile();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: { name: session?.user.name ?? "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    updateProfile.mutate(values);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your name and email address.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Email</span>
              <Input value={session?.user.email ?? ""} disabled />
            </div>
            <Button type="submit" disabled={updateProfile.isPending} className="self-start">
              Save changes
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
