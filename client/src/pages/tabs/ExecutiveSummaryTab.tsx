import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// Data Oceans brand palette for charts
const DO_COLORS = ["#134C93", "#018365", "#141A2B", "#2563EB", "#F59E0B", "#64748B", "#10B981"];

// Profitability forecast data — 9 actuals + 3 forecast months
const PROFITABILITY_FORECAST = [
  { month: "Jan", grossProfit: 4_820_000, netProfit: 1_240_000 },
  { month: "Feb", grossProfit: 4_650_000, netProfit: 1_110_000 },
  { month: "Mar", grossProfit: 5_100_000, netProfit: 1_380_000 },
  { month: "Apr", grossProfit: 5_340_000, netProfit: 1_520_000 },
  { month: "May", grossProfit: 5_210_000, netProfit: 1_460_000 },
  { month: "Jun", grossProfit: 5_580_000, netProfit: 1_640_000 },
  { month: "Jul", grossProfit: 5_720_000, netProfit: 1_710_000 },
  { month: "Aug", grossProfit: 5_890_000, netProfit: 1_780_000 },
  { month: "Sep", grossProfit: 6_050_000, netProfit: 1_850_000 },
  // Forecast months
  { month: "Oct", grossProfit: 6_280_000, netProfit: undefined, forecastNet: 1_920_000, forecast: true },
  { month: "Nov", grossProfit: 6_490_000, netProfit: undefined, forecastNet: 2_010_000, forecast: true },
  { month: "Dec", grossProfit: 6_750_000, netProfit: undefined, forecastNet: 2_140_000, forecast: true },
];

const KPI_ACCENTS = ["blue", "teal", "navy", "blue", "teal", "amber"] as const;

function AlertCard({ alert }: { alert: { severity: string; message: string; dept: string } }) {
  const config = {
    high:   { icon: AlertTriangle, className: "border-red-200 bg-red-50",    iconClass: "text-red-600",    label: "High" },
    medium: { icon: AlertCircle,   className: "border-amber-200 bg-amber-50", iconClass: "text-amber-600",  label: "Medium" },
    low:    { icon: Info,          className: "border-[#134C93]/20 bg-[#134C93]/5", iconClass: "text-[#134C93]", label: "Low" },
  }[alert.severity] ?? {
    icon: Info,
    className: "border-[#E2E8F0] bg-[#F8FAFC]",
    iconClass: "text-[#6E7791]",
    label: alert.severity,
  };
  const Icon = config.icon;
  return (
    <div className={cn("flex items-start gap-3 p-3 rounded-lg border", config.className)}>
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", config.iconClass)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#141A2B] leading-snug font-medium">{alert.message}</p>
        <p className="text-xs text-[#6E7791] mt-0.5">{alert.dept}</p>
      </div>
    </div>
  );
}

function HealthBar({ score, status }: { score: number; status: string }) {
  const color =
    status === "green" ? "bg-[#018365]" :
    status === "yellow" ? "bg-amber-500" :
    "bg-red-500";
  return (
    <div className="w-full bg-[#F0F4F8] rounded-full h-2">
      <div className={cn("h-2 rounded-full transition-all", color)} style={{ width: `${score}%` }} />
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
        <h1 className="text-xl font-bold text-[#141A2B]">Executive Summary</h1>
        <p className="text-sm text-[#6E7791] mt-1">Company-wide performance overview — Q4 FY2024</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi, i) => (
          <KPICard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            change={kpi.change}
            trend={kpi.trend as "up" | "down" | "neutral"}
            accent={KPI_ACCENTS[i % KPI_ACCENTS.length]}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Revenue vs Target */}
        <div className="xl:col-span-2 bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <SectionHeader title="Revenue vs Target" subtitle="Last 6 months ($)" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.revenueVsTarget}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#134C93" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#134C93" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="tgtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#018365" stopOpacity={0.10} />
                  <stop offset="95%" stopColor="#018365" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6E7791" }} />
              <YAxis tick={{ fontSize: 11, fill: "#6E7791" }} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, color: "#141A2B" }}
                formatter={(v: number) => [`$${(v / 1000000).toFixed(2)}M`]}
              />
              <Area type="monotone" dataKey="actual" stroke="#134C93" fill="url(#revGrad)" strokeWidth={2} name="Actual" />
              <Area type="monotone" dataKey="target" stroke="#018365" fill="url(#tgtGrad)" strokeWidth={2} strokeDasharray="4 4" name="Target" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Alerts */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <SectionHeader title="Active Alerts" subtitle={`${data.alerts.length} items require attention`} />
          <div className="space-y-2">
            {data.alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Profitability Forecast */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <SectionHeader
            title="Profitability Forecast"
            subtitle="Gross & net profit — actuals + 3-month forecast"
          />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={PROFITABILITY_FORECAST} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#134C93" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#134C93" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6E7791" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#6E7791" }}
                tickFormatter={(v: number) => `$${(v / 1000000).toFixed(1)}M`}
              />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, color: "#141A2B" }}
                formatter={(v: number) => [`$${(v / 1000000).toFixed(2)}M`]}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: "#6E7791", paddingTop: 8 }}
              />
              {/* Divider between actuals and forecast */}
              <ReferenceLine x="Oct" stroke="#E2E8F0" strokeDasharray="4 4" label={{ value: "Forecast →", position: "insideTopRight", fontSize: 10, fill: "#6E7791" }} />
              <Line
                type="monotone"
                dataKey="grossProfit"
                stroke="#134C93"
                strokeWidth={2}
                dot={(props) => props.payload.forecast
                  ? <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#134C93" stroke="#fff" strokeWidth={1.5} strokeDasharray="3 3" />
                  : <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#134C93" stroke="#fff" strokeWidth={1.5} />
                }
                name="Gross Profit"
              />
              <Line
                type="monotone"
                dataKey="netProfit"
                stroke="#018365"
                strokeWidth={2}
                dot={(props) => props.payload.forecast
                  ? <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#018365" stroke="#fff" strokeWidth={1.5} strokeDasharray="3 3" />
                  : <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#018365" stroke="#fff" strokeWidth={1.5} />
                }
                name="Net Profit"
              />
              <Line
                type="monotone"
                dataKey="forecastNet"
                stroke="#018365"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                name="Net Forecast"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Department Health */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <SectionHeader title="Department Health Scores" subtitle="Composite score out of 100" />
          <div className="space-y-4">
            {data.departmentHealth.map((d) => (
              <div key={d.dept}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-[#141A2B]">{d.dept}</span>
                  <span className="text-sm font-bold text-[#141A2B]">{d.score}</span>
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
      <div className="h-8 w-64 bg-[#E2E8F0] rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 bg-white border border-[#E2E8F0] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-72 bg-white border border-[#E2E8F0] rounded-xl" />
        <div className="h-72 bg-white border border-[#E2E8F0] rounded-xl" />
      </div>
    </div>
  );
}
