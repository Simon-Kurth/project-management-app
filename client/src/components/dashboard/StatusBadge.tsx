import { cn } from "@/lib/utils";

type Status = "operational" | "degraded" | "maintenance" | "down" | "healthy" | "at_risk" | "churning" | "needs_attention" | "in_progress" | "completed" | "planning" | "open" | "resolved" | "active" | "paused" | string;

const statusConfig: Record<string, { label: string; className: string }> = {
  operational: { label: "Operational", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  degraded: { label: "Degraded", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  maintenance: { label: "Maintenance", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  down: { label: "Down", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  healthy: { label: "Healthy", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  at_risk: { label: "At Risk", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  churning: { label: "Churning", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  needs_attention: { label: "Needs Attention", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  in_progress: { label: "In Progress", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  planning: { label: "Planning", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  open: { label: "Open", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  resolved: { label: "Resolved", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  paused: { label: "Paused", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status] ?? { label: status, className: "bg-slate-500/15 text-slate-400 border-slate-500/30" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", config.className)}>
      {config.label}
    </span>
  );
}
