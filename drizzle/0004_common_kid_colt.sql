CREATE TABLE `duo_state_store` (
	`id` int AUTO_INCREMENT NOT NULL,
	`state` varchar(128) NOT NULL,
	`username` varchar(320) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`used` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `duo_state_store_id` PRIMARY KEY(`id`),
	CONSTRAINT `duo_state_store_state_unique` UNIQUE(`state`)
);
