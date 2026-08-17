import { requireAuth } from "@/lib/auth-utils";
import { AccountForm } from "@/features/profile/components/account-form";
import { PasswordForm } from "@/features/profile/components/password-form";
import { SessionsList } from "@/features/profile/components/sessions-list";

export default async function ProfilePage() {
  await requireAuth();
  return (
    <div className="p-4 md:px-10 md:py-6 h-full">
      <div className="mx-auto max-w-3xl w-full flex flex-col gap-y-8">
        <div className="flex flex-col">
          <h1 className="text-lg md:text-xl font-semibold">Profile</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Manage your account and security settings.
          </p>
        </div>
        <AccountForm />
        <PasswordForm />
        <SessionsList />
      </div>
    </div>
  );
}
