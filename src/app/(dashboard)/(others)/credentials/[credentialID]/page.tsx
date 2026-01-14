import { requireAuth } from "@/lib/auth-utils";

interface PageProps {
  params: Promise<{
    credentialID: string;
  }>;
}

export default async function CredentialsPage({ params }: PageProps) {
  requireAuth();
  const { credentialID } = await params;

  return <p>Credential id {credentialID}</p>;
}
