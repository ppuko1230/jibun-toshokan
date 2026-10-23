CREATE TABLE `notes` (
	`owner` text NOT NULL,
	`book_id` text NOT NULL,
	`page` integer NOT NULL,
	`body` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `book_id`, `page`)
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`book_id` text NOT NULL,
	`page` integer NOT NULL,
	`label` text NOT NULL,
	`content` text NOT NULL,
	PRIMARY KEY(`book_id`, `page`),
	FOREIGN KEY (`book_id`) REFERENCES `textbooks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `textbooks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`hash` text NOT NULL,
	`bytes` integer NOT NULL,
	`page_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `textbooks_owner_hash` ON `textbooks` (`owner`,`hash`);