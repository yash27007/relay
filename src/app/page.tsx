import { requireAuth } from "@/lib/auth-utils";
import { caller } from "@/trpc/server";

export default async function Page(){
  await requireAuth();
  const data = await caller.getUsers();
  return(
    <div className="min-h-screen min-w-screen flex items-center justify-center">
      {JSON.stringify(data)}
    </div>
  )

}