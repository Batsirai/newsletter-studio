import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "newsletter-studio",
  name: "Newsletter Studio",
  description: "Write and send email newsletters, manage subscribers and publish issues on a public site.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    // Issue emails go out in batches through this queue (src/server/campaigns.ts).
    queues: [{ name: "SENDS", consumer: true }],
  },
  capabilities: {
    email: {
      access: "write",
      why: "Sends issues, test copies, confirmation and welcome emails.",
    },
  },
  // Optional: each issue ends with the reader's own next step from the
  // AlreadyLoved app (src/lib/footer.ts). Off until both are set; issues then
  // send exactly as before, with no personal block.
  features: {
    footer: {
      name: "Personal footer",
      why: "Each issue email ends with the reader's own next step, from the AlreadyLoved app.",
      steps: [
        "Set FOOTER_API_URL to the app's footer route, the full https address ending in /api/email-footers.",
        "Set FOOTER_API_SECRET to the same shared secret the app's footer route checks.",
      ],
      secrets: [
        { name: "FOOTER_API_URL", how: "The AlreadyLoved app's footer route: https://<deployment>.convex.site/api/email-footers" },
        { name: "FOOTER_API_SECRET", how: "The shared secret set on the AlreadyLoved app's footer route" },
      ],
    },
  },
  // The newsletter websites, signup forms, confirmation and unsubscribe
  // links, and open and click tracking: reached by readers who aren't members.
  public: [
    { path: "/n/*", methods: ["GET"] },
    { path: "/n/*/p/*", methods: ["GET"] },
    { path: "/n/*/feed", methods: ["GET"] },
    { path: "/n/*/rss", methods: ["GET"] },
    { path: "/n/*/subscribe", methods: ["POST"] },
    { path: "/n/*/confirm/*", methods: ["GET"] },
    { path: "/n/*/unsubscribe/*", methods: ["GET", "POST"] },
    { path: "/n/*/resubscribe/*", methods: ["POST"] },
    { path: "/t/o/*", methods: ["GET"] },
    { path: "/t/c/*", methods: ["GET"] },
  ],
  // The stylesheet the public pages load.
  publicAssets: ["/assets/**", "/icon.svg"],
});
