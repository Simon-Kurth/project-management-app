/**
 * NotificationBell
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard header bell icon with unread badge, dropdown panel listing the
 * most recent notifications, and mark-read actions.
 *
 * Polls the unread count every 60 seconds. Fetches the full list lazily when
 * the panel is opened for the first time or after a mark-read action.
 */

import { useState, useRef, useEffect } from "react";
import { Bell, CheckCheck, X, ExternalLink, Info, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ─── Severity icon + colour ───────────────────────────────────────────────────

type Severity = "info" | "warning" | "error" | "success";

const SEVERITY_META: Record<Severity, { icon: React.ElementType; className: string }> = {
  info:    { icon: Info,          className: "text-blue-500" },
  warning: { icon: AlertTriangle, className: "text-amber-500" },
  error:   { icon: AlertCircle,   className: "text-red-500" },
  success: { icon: CheckCircle,   className: "text-emerald-500" },
};

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7)  return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Poll unread count every 60 s
  const { data: countData } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unreadCount = countData?.count ?? 0;

  // Fetch notification list (lazy — only when panel has been opened)
  const [hasOpened, setHasOpened] = useState(false);
  const { data: notifications, isLoading } = trpc.notifications.list.useQuery(
    { limit: 30, onlyUnread: false },
    { enabled: hasOpened, staleTime: 30_000 },
  );

  // Mark single notification read
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  // Mark all read
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleToggle() {
    if (!open) setHasOpened(true);
    setOpen((v) => !v);
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-accent",
        )}
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-card-foreground">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium">
                  {unreadCount} unread
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  title="Mark all as read"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[420px]">
            {isLoading && (
              <div className="flex flex-col gap-3 p-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-2 bg-muted rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && (!notifications || notifications.length === 0) && (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <Bell className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  KPI alerts and system updates will appear here.
                </p>
              </div>
            )}

            {!isLoading && notifications && notifications.length > 0 && (
              <ul className="divide-y divide-border">
                {notifications.map((n) => {
                  const meta = SEVERITY_META[n.severity as Severity] ?? SEVERITY_META.info;
                  const Icon = meta.icon;
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        "flex gap-3 px-4 py-3 transition-colors",
                        !n.isRead ? "bg-accent/30 hover:bg-accent/50" : "hover:bg-accent/20",
                      )}
                    >
                      {/* Severity icon */}
                      <div className="shrink-0 mt-0.5">
                        <Icon className={cn("w-4 h-4", meta.className)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-sm leading-snug",
                            !n.isRead ? "font-semibold text-card-foreground" : "font-medium text-muted-foreground",
                          )}>
                            {n.title}
                          </p>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5">
                            {relativeTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {n.actionUrl && (
                            <a
                              href={n.actionUrl}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              onClick={() => {
                                if (!n.isRead) markRead.mutate({ id: n.id });
                              }}
                            >
                              View details
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {!n.isRead && (
                            <button
                              onClick={() => markRead.mutate({ id: n.id })}
                              disabled={markRead.isPending}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Unread dot */}
                      {!n.isRead && (
                        <div className="shrink-0 mt-1.5">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications && notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-border bg-muted/30">
              <p className="text-xs text-muted-foreground text-center">
                Showing last {notifications.length} notifications
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
