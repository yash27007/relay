import { RegisterForm } from "@/components/auth";
import { requireUnAuth } from "@/lib/auth-utils";

export default async function SignUpPage() {
  requireUnAuth();
  return <RegisterForm />;
}
