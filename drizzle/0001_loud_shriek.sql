CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`userEmail` varchar(320),
	`action` varchar(100) NOT NULL,
	`resource` varchar(255) NOT NULL,
	`resourceId` varchar(255),
	`ipAddress` varchar(45),
	`userAgent` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `connector_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`connectorType` varchar(50) NOT NULL,
	`config` json NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`lastSync` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `connector_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `connector_configs_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `dashboard_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tabName` varchar(100) NOT NULL,
	`data` json NOT NULL,
	`source` varchar(100) NOT NULL DEFAULT 'mock',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `dashboard_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`revoked` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','executive','company') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `mfaSecret` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `mfaEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mfaVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;