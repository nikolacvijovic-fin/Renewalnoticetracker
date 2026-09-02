import Link from "next/link";
import { requestPasswordResetAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServerActionForm } from "@/components/ui/server-action-form";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <div className="panel w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="mt-2 text-sm text-slate-500">
          This is a scaffolded recovery flow for teams that enable password-based auth later.
        </p>
        <ServerActionForm serverAction={requestPasswordResetAction} className="mt-6 space-y-4">
          <Input type="email" name="email" placeholder="you@company.com" required />
          <Button type="submit" className="w-full">
            Send reset email
          </Button>
        </ServerActionForm>
        {resolvedSearchParams.message ? (
          <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
            {resolvedSearchParams.message}
          </p>
        ) : null}
        <p className="mt-6 text-sm text-slate-500">
          <Link href="/auth" className="font-medium text-brand-800">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
