CREATE TABLE `datasets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `datasets_key_unique` ON `datasets` (`key`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`label` text NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_token_unique` ON `members` (`token`);--> statement-breakpoint
CREATE TABLE `name_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_id` integer NOT NULL,
	`dataset_id` integer NOT NULL,
	`gender` text NOT NULL,
	`popularity_rank` integer,
	`tier` text,
	`romanization` text,
	`origin` text,
	`meaning` text,
	FOREIGN KEY (`name_id`) REFERENCES `names`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "name_entries_gender_check" CHECK("name_entries"."gender" in ('boy', 'girl', 'neutral')),
	CONSTRAINT "name_entries_tier_check" CHECK("name_entries"."tier" in ('popular', 'uncommon', 'rare', 'unranked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `name_entries_name_id_dataset_id_unique` ON `name_entries` (`name_id`,`dataset_id`);--> statement-breakpoint
CREATE TABLE `names` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_key` text NOT NULL,
	`display` text NOT NULL,
	`gender_tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `names_normalized_key_unique` ON `names` (`normalized_key`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);--> statement-breakpoint
CREATE TABLE `swipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`name_id` integer NOT NULL,
	`direction` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`name_id`) REFERENCES `names`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "swipes_direction_check" CHECK("swipes"."direction" in ('like', 'dislike'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `swipes_member_id_name_id_unique` ON `swipes` (`member_id`,`name_id`);