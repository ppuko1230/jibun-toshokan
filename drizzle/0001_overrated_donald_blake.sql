CREATE TABLE `term_memos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`term` text NOT NULL,
	`body` text NOT NULL,
	`source_book_id` text,
	`source_page` integer,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `term_names` (
	`owner` text NOT NULL,
	`name_key` text NOT NULL,
	`display` text NOT NULL,
	`memo_id` text NOT NULL,
	PRIMARY KEY(`owner`, `name_key`),
	FOREIGN KEY (`memo_id`) REFERENCES `term_memos`(`id`) ON UPDATE no action ON DELETE no action
);
