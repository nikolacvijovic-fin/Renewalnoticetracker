"use client";

import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

export function SignOutButton() {
  return (
    <ServerActionForm serverAction={signOutAction}>
      <Button type="submit" variant="ghost" className="w-full justify-start">
        Sign out
      </Button>
    </ServerActionForm>
  );
}
