/// <reference types="vite/client" />

// The bindings come from `cf workers types` (.cloudflare/types). An app secret
// listed under `secrets` in everyapp.config.ts is typed here, optional until set:
//   declare namespace Cloudflare { interface Env { GITHUB_TOKEN?: string } }

declare namespace Cloudflare {
  interface Env {
    /** The AlreadyLoved app's footer route (https://…/api/email-footers). Unset: issues send without a personal block. */
    FOOTER_API_URL?: string;
    /** The shared secret the footer route checks. Also signs the footer's tracked links. */
    FOOTER_API_SECRET?: string;
  }
}
