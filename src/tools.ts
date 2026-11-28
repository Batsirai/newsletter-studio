import { defineTools, ToolError } from "@every-app/sdk/server";
import {
  claimSignup,
  cancelSignup,
  signupReceipt,
  signupClaimInput,
  signupReceiptInput,
  signupConfig,
} from "@/server/signupClaims";

// SDK verifies the Gateway identity/scopes. No caller-supplied owner ID,
// public bearer endpoint or independent token parser is introduced here.
async function safe<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    throw new ToolError(
      "Signup request unavailable; reconcile the original claim before retrying. Check the approved publication and integration setup.",
    );
  }
}
export const tools = defineTools(
  {
    cancel_signup: {
      description:
        "Cancel one integration signup after a verified STOP. Revokes its pending confirmation and unsubscribes only a contact originally created and confirmed by that claim. Existing baseline subscriptions stay unchanged. No email is sent.",
      risk: "write",
      destructive: true,
      idempotent: true,
      input: signupReceiptInput,
      handler: (input, { user, env }) =>
        safe(() =>
          cancelSignup(
            user.id,
            input,
            signupConfig(env as unknown as Record<string, unknown>),
          ),
        ),
    },
    claim_signup: {
      description:
        "Record one explicit newsletter choice as a pending signup for the configured owned publication. Returns a private confirmation URL only for a new pending claim. Does not send mail or reactivate contacts. Keep the same claim key and original arguments on retry; never log the email or confirmation URL.",
      risk: "write",
      idempotent: true,
      input: signupClaimInput,
      handler: (input, { user, env }) =>
        safe(() =>
          claimSignup(
            user.id,
            input,
            signupConfig(env as unknown as Record<string, unknown>),
          ),
        ),
    },
    signup_receipt: {
      description:
        "Read a previously recorded signup claim for the configured owned publication. Pending/existing/suppressed/test contacts are not new active subscribers. Does not return an email or confirmation token. Reconcile this receipt after uncertainty; do not resend mail automatically.",
      risk: "read",
      input: signupReceiptInput,
      handler: (input, { user, env }) =>
        safe(() =>
          signupReceipt(
            user.id,
            input,
            signupConfig(env as unknown as Record<string, unknown>),
          ),
        ),
    },
  },
  {
    instructions:
      "Use an app-bound credential and the approved publication. Record explicit optional newsletter consent separately from transactional delivery. Keep claim keys and assignment immutable. Only newActive=true is a confirmed new active non-test subscriber; confirmation URLs are private and must not enter logs/analytics. These tools never send mail.",
  },
);
