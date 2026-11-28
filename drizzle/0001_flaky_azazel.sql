CREATE TABLE `signup_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`newsletter_id` text NOT NULL,
	`claim_key` text NOT NULL,
	`recipient_hash` text NOT NULL,
	`first_recipient` integer NOT NULL,
	`contact_id` text NOT NULL,
	`baseline` text NOT NULL,
	`source` text NOT NULL,
	`variant` text NOT NULL,
	`test_traffic` integer NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` text NOT NULL,
	`confirm_hash` text,
	`confirmed_at` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signup_claim_newsletter_key` ON `signup_claims` (`newsletter_id`,`claim_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `signup_claim_confirmation` ON `signup_claims` (`confirm_hash`);--> statement-breakpoint
CREATE INDEX `signup_claim_contact` ON `signup_claims` (`newsletter_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `signup_claim_recipient` ON `signup_claims` (`newsletter_id`,`recipient_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `signup_claim_first_recipient` ON `signup_claims` (`newsletter_id`,`recipient_hash`) WHERE "signup_claims"."first_recipient" = 1;