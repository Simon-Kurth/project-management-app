import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function KPICard({ label, value, change, trend, className }: KPICardProps) {
  const trendColor =
    trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-slate-400";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <div className={cn("bg-card border border-border rounded-xl p-5 flex flex-col gap-2", className)}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
      {change && (
        <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span>{change}</span>
        </div>
      )}
    </div>
  );
}
