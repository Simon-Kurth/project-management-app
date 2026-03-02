import { cn } from "@/lib/utils";

type Status = "operational" | "degraded" | "maintenance" | "down" | "healthy" | "at_risk" | "churning" | "needs_attention" | "in_progress" | "completed" | "planning" | "open" | "resolved" | "active" | "paused" | string;

const statusConfig: Record<string, { label: string; className: string }> = {
  operational:      { label: "Operational",     className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  degraded:         { label: "Degraded",         className: "bg-amber-50 text-amber-700 border-amber-200" },
  maintenance:      { label: "Maintenance",      className: "bg-[#134C93]/10 text-[#134C93] border-[#134C93]/25" },
  down:             { label: "Down",             className: "bg-red-50 text-red-700 border-red-200" },
  healthy:          { label: "Healthy",          className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  at_risk:          { label: "At Risk",          className: "bg-amber-50 text-amber-700 border-amber-200" },
  churning:         { label: "Churning",         className: "bg-red-50 text-red-700 border-red-200" },
  needs_attention:  { label: "Needs Attention",  className: "bg-orange-50 text-orange-700 border-orange-200" },
  in_progress:      { label: "In Progress",      className: "bg-[#134C93]/10 text-[#134C93] border-[#134C93]/25" },
  completed:        { label: "Completed",        className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  planning:         { label: "Planning",         className: "bg-gray-100 text-gray-600 border-gray-200" },
  open:             { label: "Open",             className: "bg-red-50 text-red-700 border-red-200" },
  resolved:         { label: "Resolved",         className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  active:           { label: "Active",           className: "bg-[#018365]/10 text-[#018365] border-[#018365]/25" },
  paused:           { label: "Paused",           className: "bg-gray-100 text-gray-600 border-gray-200" },
};

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
