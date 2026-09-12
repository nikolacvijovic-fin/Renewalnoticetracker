"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  authEmailSchema,
  passwordResetSchema,
  updatePasswordSchema
} from "@/lib/validation/auth";
import { normalizeAttributionValue } from "@/lib/trial";
import { getAppConfig } from "@/lib/config";

function authRedirect(path: string, message: string) {
  redirect(`${path}?message=${encodeURIComponent(message)}`);
}

async function requireAuthenticatedPasswordUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    authRedirect(
      "/auth/update-password",
      "Use a valid recovery session before updating your password."
    );
  }

  return { supabase, user };
}

export async function signInAction(formData: FormData) {
  const parsed = authEmailSchema.parse({
    email: formData.get("email")
  });
  const source = normalizeAttributionValue(formData.get("source"));
  const campaign = normalizeAttributionValue(formData.get("campaign"));
  const cookieStore = await cookies();
  if (source) {
    cookieStore.set("marketing_source", source, { path: "/", httpOnly: true, sameSite: "lax" });
  }
  if (campaign) {
    cookieStore.set("marketing_campaign", campaign, { path: "/", httpOnly: true, sameSite: "lax" });
  }
  const supabase = createServerSupabaseClient();
  const appUrl = getAppConfig().public.appUrl;
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.email,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`
    }
  });

  if (error) {
    authRedirect("/auth", "We could not send the sign-in link. Please try again.");
  }

  authRedirect("/auth", "Check your inbox for the sign-in link.");
}

export async function signUpAction(formData: FormData) {
  const parsed = authEmailSchema.parse({
    email: formData.get("email")
  });
  const source = normalizeAttributionValue(formData.get("source"));
  const campaign = normalizeAttributionValue(formData.get("campaign"));
  const cookieStore = await cookies();
  if (source) {
    cookieStore.set("marketing_source", source, { path: "/", httpOnly: true, sameSite: "lax" });
  }
  if (campaign) {
    cookieStore.set("marketing_campaign", campaign, { path: "/", httpOnly: true, sameSite: "lax" });
  }
  const supabase = createServerSupabaseClient();
  const appUrl = getAppConfig().public.appUrl;
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${appUrl}/auth/callback`
    }
  });

  if (error) {
    authRedirect("/auth", "We could not start account creation. Please try again.");
  }

  authRedirect("/auth", "Check your inbox to finish setting up your account.");
}

export async function requestPasswordResetAction(formData: FormData) {
  const parsed = passwordResetSchema.parse({
    email: formData.get("email")
  });
  const supabase = createServerSupabaseClient();
  const appUrl = getAppConfig().public.appUrl;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.email, {
    redirectTo: `${appUrl}/auth/update-password`
  });

  if (error) {
    authRedirect("/auth/reset", "We could not send the password reset email.");
  }

  authRedirect("/auth/reset", "Check your inbox for the password reset link.");
}

export async function updatePasswordAction(formData: FormData) {
  const parsed = updatePasswordSchema.parse({
    password: formData.get("password")
  });
  const { supabase } = await requireAuthenticatedPasswordUser();
  const { error } = await supabase.auth.updateUser({
    password: parsed.password
  });

  if (error) {
    authRedirect("/auth/update-password", "We could not update your password.");
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/auth");
}
