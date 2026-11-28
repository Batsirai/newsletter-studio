import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "newsletter-studio",
  name: "Newsletter Studio",
  description:
    "Write and send email newsletters, manage subscribers and publish issues on a public site.",
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
  features: {
    signup_integration: {
      name: "Authenticated signup integration",
      why: "Lets an authorized app request a pending signup and reconcile explicit confirmation without sending mail here.",
      settings: [
        {
          name: "SIGNUP_NEWSLETTER_ID",
          how: "The exact approved newsletter id owned by the app-bound caller.",
        },
        {
          name: "SIGNUP_PUBLIC_ORIGIN",
          how: "The newsletter app's canonical public HTTPS origin, without a path.",
        },
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
    // Capability URL: GET is read-only; only an explicit POST confirms.
    { path: "/n/*/join/*", methods: ["GET", "POST"] },
    { path: "/n/*/confirm/*", methods: ["GET"] },
    { path: "/n/*/unsubscribe/*", methods: ["GET", "POST"] },
    { path: "/n/*/resubscribe/*", methods: ["POST"] },
    { path: "/t/o/*", methods: ["GET"] },
    { path: "/t/c/*", methods: ["GET"] },
  ],
  // The stylesheet the public pages load.
  publicAssets: ["/assets/**", "/icon.svg"],
});
