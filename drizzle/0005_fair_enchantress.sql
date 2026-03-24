CREATE TABLE `pending_auth_store` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(320) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`used` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pending_auth_store_id` PRIMARY KEY(`id`),
	CONSTRAINT `pending_auth_store_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `entraOid` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `entraUpn` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD `entraTenantId` varchar(128);