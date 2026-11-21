CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`newsletter_id` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`preview_text` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`slug` text,
	`destination` text DEFAULT 'both' NOT NULL,
	`segment_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` text,
	`time_zone` text,
	`sent_at` text,
	`test_sent_at` text,
	`origin` text,
	`on_website` integer DEFAULT true NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaigns_newsletter` ON `campaigns` (`newsletter_id`);--> statement-breakpoint
CREATE TABLE `contact_events` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`newsletter_id` text NOT NULL,
	`type` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_events_contact` ON `contact_events` (`contact_id`);--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`contact_id` text NOT NULL,
	`newsletter_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`contact_id`, `tag`)
);
--> statement-breakpoint
CREATE INDEX `contact_tags_newsletter_tag` ON `contact_tags` (`newsletter_id`,`tag`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`newsletter_id` text NOT NULL,
	`email` text NOT NULL,
	`first_name` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`fields` text DEFAULT '{}' NOT NULL,
	`token` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`confirmed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_newsletter_email` ON `contacts` (`newsletter_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_token` ON `contacts` (`token`);--> statement-breakpoint
CREATE INDEX `contacts_newsletter_status` ON `contacts` (`newsletter_id`,`status`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`sent_at` text,
	`opened_at` text,
	`clicked_at` text,
	`unsubscribed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_campaign_contact` ON `deliveries` (`campaign_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `deliveries_contact` ON `deliveries` (`contact_id`);--> statement-breakpoint
CREATE TABLE `link_clicks` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`url` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `link_clicks_campaign` ON `link_clicks` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `newsletters` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`org_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`from_name` text DEFAULT '' NOT NULL,
	`reply_to` text DEFAULT '' NOT NULL,
	`postal_address` text DEFAULT '' NOT NULL,
	`confirm_opt_in` integer DEFAULT false NOT NULL,
	`welcome_enabled` integer DEFAULT false NOT NULL,
	`welcome_subject` text DEFAULT '' NOT NULL,
	`welcome_body` text DEFAULT '' NOT NULL,
	`website_enabled` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletters_slug` ON `newsletters` (`slug`);--> statement-breakpoint
CREATE INDEX `newsletters_owner` ON `newsletters` (`owner_id`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`newsletter_id` text NOT NULL,
	`name` text NOT NULL,
	`rules` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `segments_newsletter` ON `segments` (`newsletter_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`org_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
