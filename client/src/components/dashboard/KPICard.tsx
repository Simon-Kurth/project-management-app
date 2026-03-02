import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type AccentColor = "blue" | "teal" | "navy" | "amber" | "red";

interface KPICardProps {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  accent?: AccentColor;
  className?: string;
}

const ACCENT_STYLES: Record<AccentColor, { bar: string; icon: string }> = {
  blue:  { bar: "border-t-[#134C93]",  icon: "text-[#134C93]" },
  teal:  { bar: "border-t-[#018365]",  icon: "text-[#018365]" },
  navy:  { bar: "border-t-[#141A2B]",  icon: "text-[#141A2B]" },
  amber: { bar: "border-t-amber-500",  icon: "text-amber-500" },
  red:   { bar: "border-t-red-500",    icon: "text-red-500" },
};

export function KPICard({ label, value, change, trend, accent = "blue", className }: KPICardProps) {
  const trendColor =
    trend === "up"
      ? "text-[#018365]"
      : trend === "down"
      ? "text-red-500"
      : "text-[#6E7791]";

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const accentStyle = ACCENT_STYLES[accent];

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-5 flex flex-col gap-2",
        "border-t-[3px]",
        accentStyle.bar,
        className
      )}
    >
      <p className="text-[11px] font-semibold text-[#6E7791] uppercase tracking-widest">
        {label}
      </p>
      <p className="text-2xl font-bold text-[#141A2B] leading-tight">{value}</p>
      {change && (
        <div className={cn("flex items-center gap-1 text-xs font-semibold", trendColor)}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span>{change}</span>
        </div>
      )}
    </div>
  );
}
