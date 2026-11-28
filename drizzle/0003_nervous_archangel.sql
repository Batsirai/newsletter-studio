CREATE TABLE `signup_cancellations` (
	`newsletter_id` text NOT NULL,
	`claim_key` text NOT NULL,
	`revoked_at` text NOT NULL,
	PRIMARY KEY(`newsletter_id`, `claim_key`)
);
