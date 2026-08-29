import { updatePasswordAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServerActionForm } from "@/components/ui/server-action-form";

export default async function UpdatePasswordPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <div className="panel w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <p className="mt-2 text-sm text-slate-500">
          Use this route after a Supabase recovery link if your workspace enables password auth.
        </p>
        <ServerActionForm serverAction={updatePasswordAction} className="mt-6 space-y-4">
          <Input type="password" name="password" placeholder="New password" minLength={10} required />
          <Button type="submit" className="w-full">
            Update password
          </Button>
        </ServerActionForm>
        {resolvedSearchParams.message ? (
          <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
            {resolvedSearchParams.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
