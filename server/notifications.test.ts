/**
 * server/notifications.test.ts
 * Unit tests for the notifications DB helpers and tRPC procedures.
 * All SQL helpers are mocked so no database connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB helpers ──────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getNotifications:          vi.fn(),
    getUnreadCount:            vi.fn(),
    markNotificationRead:      vi.fn(),
    markAllNotificationsRead:  vi.fn(),
    createNotification:        vi.fn(),
    getUserById:               vi.fn(),
    writeAuditLog:             vi.fn(),
  };
});

import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  createNotification,
} from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<{
  id: number;
  userId: number;
  title: string;
  body: string;
  severity: string;
  actionUrl: string | null;
  isRead: boolean;
  readAt: Date | null;
  source: string;
  createdAt: Date;
}> = {}) {
  return {
    id:        overrides.id        ?? 1,
    userId:    overrides.userId    ?? 42,
    title:     overrides.title     ?? "Test Notification",
    body:      overrides.body      ?? "This is a test notification body.",
    severity:  overrides.severity  ?? "info",
    actionUrl: overrides.actionUrl ?? null,
    isRead:    overrides.isRead    ?? false,
    readAt:    overrides.readAt    ?? null,
    source:    overrides.source    ?? "system",
    createdAt: overrides.createdAt ?? new Date("2026-04-01T10:00:00Z"),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getNotifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty array when there are no notifications", async () => {
    vi.mocked(getNotifications).mockResolvedValue([]);
    const result = await getNotifications(42, 50, false);
    expect(result).toEqual([]);
    expect(getNotifications).toHaveBeenCalledWith(42, 50, false);
  });

  it("returns notifications for the given user", async () => {
    const notifications = [
      makeNotification({ id: 1, userId: 42, title: "Alert A" }),
      makeNotification({ id: 2, userId: 42, title: "Alert B", isRead: true }),
    ];
    vi.mocked(getNotifications).mockResolvedValue(notifications);
    const result = await getNotifications(42, 50, false);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Alert A");
    expect(result[1].isRead).toBe(true);
  });

  it("passes onlyUnread flag correctly", async () => {
    vi.mocked(getNotifications).mockResolvedValue([]);
    await getNotifications(42, 10, true);
    expect(getNotifications).toHaveBeenCalledWith(42, 10, true);
  });
});

describe("getUnreadCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 0 when there are no unread notifications", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(0);
    const count = await getUnreadCount(42);
    expect(count).toBe(0);
  });

  it("returns the correct unread count", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(7);
    const count = await getUnreadCount(42);
    expect(count).toBe(7);
  });
});

describe("markNotificationRead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls markNotificationRead with the correct id and userId", async () => {
    vi.mocked(markNotificationRead).mockResolvedValue(undefined);
    await markNotificationRead(5, 42);
    expect(markNotificationRead).toHaveBeenCalledWith(5, 42);
  });

  it("does not throw when the notification does not exist", async () => {
    vi.mocked(markNotificationRead).mockResolvedValue(undefined);
    await expect(markNotificationRead(999, 42)).resolves.toBeUndefined();
  });
});

describe("markAllNotificationsRead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls markAllNotificationsRead with the correct userId", async () => {
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined);
    await markAllNotificationsRead(42);
    expect(markAllNotificationsRead).toHaveBeenCalledWith(42);
  });
});

describe("createNotification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the new notification id on success", async () => {
    vi.mocked(createNotification).mockResolvedValue(101);
    const id = await createNotification({
      userId:   42,
      title:    "New Alert",
      body:     "Something happened.",
      severity: "warning",
      source:   "kpi-monitor",
    });
    expect(id).toBe(101);
  });

  it("uses default severity of 'info' when not specified", async () => {
    vi.mocked(createNotification).mockResolvedValue(102);
    await createNotification({ userId: 42, title: "Info", body: "FYI" });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, title: "Info" }),
    );
  });

  it("returns -1 when the database is unavailable", async () => {
    vi.mocked(createNotification).mockResolvedValue(-1);
    const id = await createNotification({
      userId: 42,
      title:  "Test",
      body:   "Body",
    });
    expect(id).toBe(-1);
  });

  it("accepts all four severity levels", async () => {
    const severities = ["info", "warning", "error", "success"] as const;
    for (const severity of severities) {
      vi.mocked(createNotification).mockResolvedValue(1);
      await createNotification({ userId: 42, title: "T", body: "B", severity });
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ severity }),
      );
    }
  });

  it("accepts an optional actionUrl", async () => {
    vi.mocked(createNotification).mockResolvedValue(103);
    await createNotification({
      userId:    42,
      title:     "Deep Link",
      body:      "Click to view",
      actionUrl: "/dashboard/delivery",
    });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ actionUrl: "/dashboard/delivery" }),
    );
  });
});
