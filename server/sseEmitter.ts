/**
 * server/sseEmitter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-Sent Events (SSE) emitter for real-time notification push.
 *
 * Architecture:
 *   - Each authenticated user opens a persistent GET /api/events/notifications
 *     connection. The response is kept open with `Transfer-Encoding: chunked`.
 *   - When a notification is created (by the KPI monitor, admin broadcast, or
 *     any other source), call `notifyUser(userId, payload)` or
 *     `notifyRole(role, payload)` to push the event to all connected clients.
 *   - Clients receive `event: notification` with a JSON payload.
 *   - A heartbeat ping is sent every 25 seconds to keep proxies from closing
 *     idle connections.
 *   - On client disconnect the response is removed from the registry.
 *
 * Usage (server-side):
 *   import { notifyUser, notifyRole } from "./sseEmitter";
 *   notifyUser(42, { type: "new", unreadCount: 3 });
 *   notifyRole("qa", { type: "new", unreadCount: 1 });
 *
 * Usage (Express route):
 *   import { registerSseRoute } from "./sseEmitter";
 *   registerSseRoute(app);   // registers GET /api/events/notifications
 */

import type { Application, Request, Response } from "express";
import { getUserById } from "./db";
import { sdk } from "./_core/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SseNotificationPayload {
  /** "new" = a new notification arrived; "read" = unread count changed */
  type: "new" | "read" | "ping";
  unreadCount?: number;
  notificationId?: number;
}

interface SseClient {
  userId: number;
  role:   string;
  res:    Response;
}

// ─── Client Registry ──────────────────────────────────────────────────────────

const clients = new Map<string, SseClient>();

function clientKey(userId: number, connectionId: string): string {
  return `${userId}:${connectionId}`;
}

function addClient(userId: number, role: string, connectionId: string, res: Response): void {
  clients.set(clientKey(userId, connectionId), { userId, role, res });
}

function removeClient(userId: number, connectionId: string): void {
  clients.delete(clientKey(userId, connectionId));
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sendEvent(res: Response, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client already disconnected — ignore
  }
}

// ─── Public emitter API ───────────────────────────────────────────────────────

/** Push a notification event to a specific user (all their open tabs). */
export function notifyUser(userId: number, payload: SseNotificationPayload): void {
  for (const [, client] of Array.from(clients)) {
    if (client.userId === userId) {
      sendEvent(client.res, "notification", payload);
    }
  }
}

/** Push a notification event to all users of a specific role. */
export function notifyRole(role: string, payload: SseNotificationPayload): void {
  for (const [, client] of Array.from(clients)) {
    if (client.role === role) {
      sendEvent(client.res, "notification", payload);
    }
  }
}

/** Push a notification event to all connected users. */
export function notifyAll(payload: SseNotificationPayload): void {
  for (const [, client] of Array.from(clients)) {
    sendEvent(client.res, "notification", payload);
  }
}

/** Return the number of currently connected SSE clients. */
export function getConnectedClientCount(): number {
  return clients.size;
}

// ─── Express route registration ───────────────────────────────────────────────

export function registerSseRoute(app: Application): void {
  app.get("/api/events/notifications", async (req: Request, res: Response) => {
    // Authenticate via session cookie (same mechanism as tRPC context)
    let userId: number;
    let userRole: string;
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      userId   = user.id;
      userRole = user.role;
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders();

    // Register this client
    const connectionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addClient(userId, userRole, connectionId, res);

    // Send initial ping so the client knows the stream is open
    sendEvent(res, "notification", { type: "ping" } satisfies SseNotificationPayload);

    // Heartbeat every 25 s to keep proxies alive
    const heartbeat = setInterval(() => {
      sendEvent(res, "notification", { type: "ping" } satisfies SseNotificationPayload);
    }, 25_000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      removeClient(userId, connectionId);
    });
  });
}
