// A local Gateway double for the checks: it records each capability call and
// accepts email sends, so delivery, tracking and unsubscribe links can be followed.
export const FAKE_GATEWAY = "fake-gateway";

const source = `const calls = [];
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/__calls") return Response.json(calls);
  const body = request.method === "GET" ? null : await request.text();
  calls.push({ method: request.method, path: url.pathname, body });
  if (url.pathname === "/api/integrations/email/send") {
    return Response.json({ messageId: "m" + calls.length, status: "delivered" });
  }
  const code = "integration_not_configured";
  return Response.json({ error: "Service Unavailable", code, message: "Not available in checks." }, { status: 503, headers: { "x-everyapp-error": code } });
} };`;

export function fakeGatewayOptions() {
  return {
    bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: FAKE_GATEWAY } },
    workers: [
      {
        config: {
          name: FAKE_GATEWAY,
          compatibilityDate: "2026-06-01",
          manifest: { mainModule: "fake.mjs", modules: { "fake.mjs": { type: "esm", contents: source } } },
        },
      },
    ],
  };
}

/** Every email the app sent through the fake, parsed. */
export async function sentEmails(runtime) {
  const worker = await runtime.mf.getWorker(FAKE_GATEWAY);
  const calls = await (await worker.fetch("http://gateway/__calls")).json();
  return calls
    .filter((call) => call.path === "/api/integrations/email/send")
    .map((call) => JSON.parse(call.body));
}

export async function poll(fn, { tries = 60, delay = 500 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("Timed out waiting for a condition");
}
