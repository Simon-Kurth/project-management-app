import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa", "#34d399"];

function AlertCard({ alert }: { alert: { severity: string; message: string; dept: string } }) {
  const config = {
    high: { icon: AlertTriangle, className: "border-rose-500/30 bg-rose-500/5", iconClass: "text-rose-400", label: "High" },
    medium: { icon: AlertCircle, className: "border-amber-500/30 bg-amber-500/5", iconClass: "text-amber-400", label: "Medium" },
    low: { icon: Info, className: "border-blue-500/30 bg-blue-500/5", iconClass: "text-blue-400", label: "Low" },
  }[alert.severity] ?? { icon: Info, className: "border-border bg-muted/20", iconClass: "text-muted-foreground", label: alert.severity };
  const Icon = config.icon;
  return (
    <div className={cn("flex items-start gap-3 p-3 rounded-lg border", config.className)}>
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", config.iconClass)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug">{alert.message}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{alert.dept}</p>
      </div>
    </div>
  );
}

function HealthBar({ score, status }: { score: number; status: string }) {
  const color = status === "green" ? "bg-emerald-500" : status === "yellow" ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="w-full bg-muted rounded-full h-1.5">
      <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${score}%` }} />
    </div>
  );
}

export default function ExecutiveSummaryTab() {
  const { data, isLoading } = trpc.dashboard.executiveSummary.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Executive Summary</h1>
        <p className="text-sm text-muted-foreground mt-1">Company-wide performance overview — Q4 FY2024</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Revenue vs Target */}
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Revenue vs Target" subtitle="Last 6 months ($)" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.revenueVsTarget}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => [`$${(v / 1000000).toFixed(2)}M`]} />
              <Area type="monotone" dataKey="actual" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2} name="Actual" />
              <Area type="monotone" dataKey="target" stroke="#22d3ee" fill="none" strokeWidth={2} strokeDasharray="4 4" name="Target" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Alerts */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Active Alerts" subtitle={`${data.alerts.length} items require attention`} />
          <div className="space-y-2">
            {data.alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Headcount by Dept */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Headcount by Department" subtitle="Total: 312 employees" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.headcountByDept} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="dept" type="category" tick={{ fontSize: 11 }} width={90} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Headcount">
                {data.headcountByDept.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Department Health */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Department Health Scores" subtitle="Composite score out of 100" />
          <div className="space-y-4">
            {data.departmentHealth.map((d) => (
              <div key={d.dept}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-foreground">{d.dept}</span>
                  <span className="text-sm font-semibold text-foreground">{d.score}</span>
                </div>
                <HealthBar score={d.score} status={d.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-muted rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-card border border-border rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-72 bg-card border border-border rounded-xl" />
        <div className="h-72 bg-card border border-border rounded-xl" />
      </div>
    </div>
  );
}
