import {
  requestWorkspaceDeletionAction,
  saveProfileSettingsAction,
  setActiveOrganizationAction
} from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ServerActionForm } from "@/components/ui/server-action-form";
import type { CommercialCapabilitySummaryItem } from "@/lib/billing/entitlements";

export function SettingsForm({
  defaults,
  billing,
  canManageOrg,
  organizationOptions,
  activeOrganizationId
}: {
  defaults: {
    full_name: string;
    notification_email: string;
    organization_name: string;
    billing_email: string;
  };
  billing: {
    plan_tier: string;
    subscription_status: string;
    subscription_current_period_end: string | null;
    billing_provider_label: string;
    billing_provider_name: string;
    checkout_supported: boolean;
    management_supported: boolean;
    management_message: string;
    trial_started_at: string | null;
    trial_ends_at: string | null;
    acquisition_source: string | null;
    commercial_summary: CommercialCapabilitySummaryItem[];
  };
  canManageOrg: boolean;
  organizationOptions: Array<{ organizationId: string; name: string }>;
  activeOrganizationId: string;
}) {
  return (
    <div className="space-y-6">
      {organizationOptions.length > 1 ? (
        <ServerActionForm
          serverAction={setActiveOrganizationAction}
          className="panel max-w-3xl space-y-4 p-6"
        >
          <div>
            <h2 className="text-lg font-semibold">Active organization</h2>
            <p className="mt-1 text-sm text-slate-500">
              Owner and admin actions are bound explicitly to the selected organization.
            </p>
          </div>
          <Field label="Current organization">
            <select
              name="organization_id"
              defaultValue={activeOrganizationId}
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              {organizationOptions.map((organization) => (
                <option key={organization.organizationId} value={organization.organizationId}>
                  {organization.name}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="secondary">
            Set active organization
          </Button>
        </ServerActionForm>
      ) : null}

      <ServerActionForm
        serverAction={saveProfileSettingsAction}
        className="panel max-w-3xl space-y-4 p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Account settings</h2>
          <p className="mt-1 text-sm text-slate-500">
            Keep profile and workspace details accurate before uploading and reviewing contracts.
          </p>
        </div>
        <Field label="Full name">
          <Input name="full_name" defaultValue={defaults.full_name} required />
        </Field>
        <Field label="Notification email">
          <Input
            name="notification_email"
            type="email"
            defaultValue={defaults.notification_email}
            required
          />
        </Field>
        {canManageOrg ? (
          <>
            <Field label="Organization name">
              <Input name="organization_name" defaultValue={defaults.organization_name} required />
            </Field>
            <Field label="Billing email">
              <Input
                name="billing_email"
                type="email"
                defaultValue={defaults.billing_email}
                required
              />
            </Field>
          </>
        ) : (
          <>
            <input type="hidden" name="organization_name" value={defaults.organization_name} />
            <input type="hidden" name="billing_email" value={defaults.billing_email} />
          </>
        )}

        <Button type="submit">Save settings</Button>
      </ServerActionForm>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Billing</h2>
          <p className="text-sm text-slate-500">Provider: {billing.billing_provider_label}</p>
          <p className="text-sm text-slate-500">
            Current plan: {billing.plan_tier} | Status: {billing.subscription_status}
          </p>
          <p className="text-sm text-slate-500">
            Current period end: {billing.subscription_current_period_end ?? "Not set"}
          </p>
          {billing.trial_ends_at ? (
            <p className="text-sm text-slate-500">
              Trial ends: {billing.trial_ends_at}
              {billing.acquisition_source ? ` | Source: ${billing.acquisition_source}` : ""}
            </p>
          ) : null}
          <p className="text-sm text-slate-500">
            Paddle is the default self-serve billing path. PayPal and manual invoice / wire
            transfer are support-led exceptions and do not expose a self-serve billing portal.
          </p>
          {canManageOrg ? (
            <>
              {billing.checkout_supported && billing.billing_provider_name === "paddle" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <form
                    action="/api/billing/checkout?plan=starter&source=settings_billing"
                    method="post"
                  >
                    <Button type="submit" variant="secondary" className="w-full">
                      Choose Starter
                    </Button>
                  </form>
                  <form
                    action="/api/billing/checkout?plan=growth&source=settings_billing"
                    method="post"
                  >
                    <Button type="submit" className="w-full">
                      Upgrade to Growth
                    </Button>
                  </form>
                </div>
              ) : null}
              {billing.management_supported ? (
                <form
                  action={`/api/billing/manage?provider=paddle&source=settings_billing`}
                  method="post"
                >
                  <Button type="submit" variant="secondary">
                    Manage billing
                  </Button>
                </form>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {billing.management_message}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Only owners and admins can manage billing.</p>
          )}
        </div>

        <div className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Workflow defaults</h2>
          <p className="text-sm text-slate-500">
            Keep this workspace focused on reviewed dates, one accountable owner, and trusted email
            reminders.
          </p>
        </div>
      </div>

      {canManageOrg ? (
        <div className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Exports and workspace control</h2>
          <p className="text-sm text-slate-500">
            Contract exports are recorded automatically. Workspace deletion stays explicit,
            auditable, and owner-only.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/dashboard/contracts/export/csv"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-ink transition hover:border-brand-400 hover:text-brand-700"
            >
              Export contracts as CSV
            </a>
            <a
              href="/dashboard/contracts/export/xlsx"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-ink transition hover:border-brand-400 hover:text-brand-700"
            >
              Export contracts as Excel
            </a>
            <ServerActionForm serverAction={requestWorkspaceDeletionAction}>
              <Button type="submit" variant="secondary">
                Request workspace deletion
              </Button>
            </ServerActionForm>
          </div>
          <p className="text-xs text-slate-500">
            Deletion requests open an auditable control-plane record first. They should never
            silently destroy workspace data from the UI.
          </p>
        </div>
      ) : null}
    </div>
  );
}
