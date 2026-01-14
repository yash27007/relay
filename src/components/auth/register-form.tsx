"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Circle, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const registerSchema = z
  .object({
    name: z.string("Please enter your name"),
    email: z.email("Please enter a valid email"),
    password: z
      .string()
      .min(6, "Password should be minimum 6 characters long")
      .regex(/[A-Z]/, "Password should have atleast one upper case")
      .regex(/[a-z]/, "Password should have atleast one lower case")
      .regex(/[0-9]/, "Password should have atleast one number from 0-9")
      .regex(
        /[^a-zA-Z0-9]/,
        "Password should have atleast one special character",
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type registerFormType = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const form = useForm<registerFormType>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: registerFormType) => {
    await signUp.email(
      {
        name: values.name,
        email: values.email,
        password: values.confirmPassword,
        callbackURL: "/",
      },
      {
        onSuccess: () => {
          router.push("/");
        },
        onError: (ctx) => {
          toast.error(ctx.error.message);
        },
      },
    );
  };

  const passwordValue = form.watch("password") || "";

  const passwordCriteria = [
    { label: "At least 6 characters", met: passwordValue.length >= 6 },
    { label: "One uppercase letter", met: /[A-Z]/.test(passwordValue) },
    { label: "One lowercase letter", met: /[a-z]/.test(passwordValue) },
    { label: "One number", met: /[0-9]/.test(passwordValue) },
    { label: "One special character", met: /[^a-zA-Z0-9]/.test(passwordValue) },
  ];

  const isPending = form.formState.isSubmitting;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold">Get Started</CardTitle>
          <CardDescription>Sign up to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-6">
                <div className="flex flex-col gap-4">
                  <Button
                    variant={"outline"}
                    className="w-full"
                    disabled={isPending}
                  >
                    <Image
                      alt="Google Logo"
                      src="/google.svg"
                      width={20}
                      height={20}
                    />
                    Sign up with Google
                  </Button>
                  <Button
                    className="w-full"
                    variant={"outline"}
                    disabled={isPending}
                  >
                    <Image
                      alt="Github Logo"
                      src="/github.svg"
                      width={20}
                      height={20}
                    />
                    Sign up with Github
                  </Button>
                </div>

                <div className="grid gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Enter you name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="name@example.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="******"
                            {...field}
                            className={passwordValue && "mb-2"}
                          />
                        </FormControl>
                        <div className="mt-2 space-y-1.5 px-1">
                          {passwordCriteria.map((criterion, index) => (
                            <div
                              // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                              key={index}
                              className={`flex items-center text-xs transition-colors duration-200 ${
                                criterion.met
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {criterion.met ? (
                                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                              ) : (
                                <Circle className="mr-2 h-3.5 w-3.5 opacity-50" />
                              )}
                              <span
                                className={criterion.met ? "font-medium" : ""}
                              >
                                {criterion.label}
                              </span>
                            </div>
                          ))}
                        </div>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="******"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button className="w-full" type="submit" disabled={isPending}>
                    Sign up
                  </Button>
                </div>
                <div className="text-center text-sm">
                  Already have an account?{" "}
                  <Link href="/login" className="underline underline-offset-4">
                    Sign In
                  </Link>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
