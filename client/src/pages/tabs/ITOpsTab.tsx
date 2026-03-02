import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

function ServiceDot({ status }: { status: string }) {
  const color = status === "operational" ? "bg-emerald-400" : status === "degraded" ? "bg-amber-400" : status === "maintenance" ? "bg-blue-400" : "bg-rose-400";
  return <span className={cn("inline-block w-2 h-2 rounded-full", color)} />;
}

export default function ITOpsTab() {
  const { data, isLoading } = trpc.dashboard.itops.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#141A2B]">IT / Ops</h1>
        <p className="text-sm text-[#6E7791] mt-1">Infrastructure health, incidents, and resource utilization</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Service Status */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Service Status" subtitle="Real-time system health" />
          <div className="space-y-2">
            {data.serviceStatus.map((svc) => (
              <div key={svc.service} className="flex items-center justify-between py-2.5 border-b border-[#E2E8F0]/50 last:border-0">
                <div className="flex items-center gap-2.5">
                  <ServiceDot status={svc.status} />
                  <span className="text-sm text-[#141A2B]">{svc.service}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[#6E7791]">{svc.uptime}% uptime</span>
                  {svc.latency > 0 && <span className="text-xs text-[#6E7791]">{svc.latency}ms</span>}
                  <StatusBadge status={svc.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resource Utilization */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Resource Utilization" subtitle="CPU, memory, and network (24h)" />
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.resourceUtilization}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#134C93" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#134C93" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#018365" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#018365" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v: number) => [`${v}%`]} />
              <Legend />
              <Area type="monotone" dataKey="cpu" stroke="#134C93" fill="url(#cpuGrad)" strokeWidth={2} name="CPU" />
              <Area type="monotone" dataKey="memory" stroke="#018365" fill="url(#memGrad)" strokeWidth={2} name="Memory" />
              <Area type="monotone" dataKey="network" stroke="#F59E0B" fill="none" strokeWidth={2} strokeDasharray="4 4" name="Network" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Incidents */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
        <SectionHeader title="Recent Incidents" subtitle="Last 7 days" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                <th className="text-left py-2 px-3 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">ID</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">Title</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">Severity</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">Status</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">Opened</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {data.incidents.map((inc) => (
                <tr key={inc.id} className="border-b border-[#E2E8F0]/50 hover:bg-[#F0F4F8]/20 transition-colors">
                  <td className="py-3 px-3 font-mono text-xs text-[#6E7791]">{inc.id}</td>
                  <td className="py-3 px-3 text-[#141A2B]">{inc.title}</td>
                  <td className="py-3 px-3">
                    <span className={cn("text-xs font-semibold", inc.severity === "P1" ? "text-rose-400" : inc.severity === "P2" ? "text-amber-400" : "text-slate-400")}>
                      {inc.severity}
                    </span>
                  </td>
                  <td className="py-3 px-3"><StatusBadge status={inc.status} /></td>
                  <td className="py-3 px-3 text-xs text-[#6E7791]">{inc.opened}</td>
                  <td className="py-3 px-3 text-xs text-[#141A2B]">{inc.assignee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-32 bg-[#F0F4F8] rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-white border border-[#E2E8F0] rounded-xl shadow-sm" />)}
      </div>
    </div>
  );
}
