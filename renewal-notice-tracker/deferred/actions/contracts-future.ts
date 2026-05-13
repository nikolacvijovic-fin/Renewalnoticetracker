"use server";

function deferredCapabilityError(capability: string) {
  return new Error(
    `${capability} is preserved only as a deferred capability and is not active in the shipped kernel.`
  );
}

export async function createPlaybookAction(_formData: FormData) {
  throw deferredCapabilityError("Playbooks");
}

export async function attachPlaybookAction(_contractId: string, _formData: FormData) {
  throw deferredCapabilityError("Playbooks");
}

export async function applyReminderRuleAction(_contractId: string, _formData: FormData) {
  throw deferredCapabilityError("Custom reminder rules");
}
