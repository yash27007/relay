import { requireUnAuth } from "@/lib/auth-utils";
import { Features } from "@/features/marketing/components/features";
import { Hero } from "@/features/marketing/components/hero";
import { SiteFooter } from "@/features/marketing/components/site-footer";

export default async function LandingPage() {
  await requireUnAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <Hero />
      <Features />
      <SiteFooter />
    </div>
  );
}
