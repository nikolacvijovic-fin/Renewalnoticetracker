import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { signInAction, signUpAction } from "@/lib/actions/auth";

export default async function AuthPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string; source?: string; campaign?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-700">Secure Access</p>
          <h1 className="mt-3 text-3xl font-semibold">Renewal operations for real contract follow-through.</h1>
          <p className="mt-4 text-sm text-slate-500">
            Sign in to review extracted terms, confirm reminder dates, and keep the system’s audit trail current.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-600">
            <li>Protected contract, reminder, note, and audit views</li>
            <li>Server-side authorization on dashboard and action flows</li>
            <li>Operational reminders with human review before reliance</li>
          </ul>
        </section>

        <section className="space-y-6">
          <div className="panel p-8">
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="mt-2 text-sm text-slate-500">Use a passwordless link for the fastest supported flow.</p>
            <ServerActionForm serverAction={signInAction} className="mt-6 space-y-4">
              <input type="hidden" name="source" value={resolvedSearchParams.source ?? ""} />
              <input type="hidden" name="campaign" value={resolvedSearchParams.campaign ?? ""} />
              <Input type="email" name="email" placeholder="you@company.com" required />
              <Button type="submit" className="w-full">
                Send sign-in link
              </Button>
            </ServerActionForm>
          </div>

          <div className="panel p-8">
            <h2 className="text-xl font-semibold">Create account</h2>
            <p className="mt-2 text-sm text-slate-500">
              New users can bootstrap an account and finish organization setup after the first sign-in.
            </p>
            <ServerActionForm serverAction={signUpAction} className="mt-6 space-y-4">
              <input type="hidden" name="source" value={resolvedSearchParams.source ?? ""} />
              <input type="hidden" name="campaign" value={resolvedSearchParams.campaign ?? ""} />
              <Input type="email" name="email" placeholder="founder@company.com" required />
              <Button type="submit" variant="secondary" className="w-full">
                Send account setup link
              </Button>
            </ServerActionForm>
          </div>

          <div className="panel p-6">
            <p className="text-sm text-slate-500">
              Need a password reset scaffold instead?{" "}
              <Link href="/auth/reset" className="font-medium text-brand-800">
                Reset password
              </Link>
            </p>
            {resolvedSearchParams.message ? (
              <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
                {resolvedSearchParams.message}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
