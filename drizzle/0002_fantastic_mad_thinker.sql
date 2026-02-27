CREATE TABLE `computed_kpis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`boardId` varchar(64) NOT NULL,
	`kpiType` varchar(64) NOT NULL,
	`data` json NOT NULL,
	`source` varchar(32) NOT NULL DEFAULT 'jira',
	`computedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `computed_kpis_id` PRIMARY KEY(`id`)
);
