import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

const HEALTH_COLORS = ["#018365", "#F59E0B", "#EF4444", "#134C93"];

export default function CSMTab() {
  const { data, isLoading } = trpc.dashboard.csm.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#141A2B]">Customer Success</h1>
        <p className="text-sm text-[#6E7791] mt-1">Account health, ticket volume, and renewal pipeline</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Ticket Volume */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Ticket Volume" subtitle="Monthly opened, resolved, and escalated" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.ticketVolume}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="opened" fill="#134C93" name="Opened" radius={[3, 3, 0, 0]} />
              <Bar dataKey="resolved" fill="#018365" name="Resolved" radius={[3, 3, 0, 0]} />
              <Bar dataKey="escalated" fill="#EF4444" name="Escalated" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Account Health Distribution */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Account Health Distribution" subtitle={`${data.accountHealth.reduce((s, a) => s + a.count, 0).toLocaleString()} total accounts`} />
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={data.accountHealth} dataKey="count" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                  {data.accountHealth.map((_, i) => <Cell key={i} fill={HEALTH_COLORS[i % HEALTH_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [v.toLocaleString(), "Accounts"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2.5">
              {data.accountHealth.map((seg, i) => (
                <div key={seg.segment} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: HEALTH_COLORS[i % HEALTH_COLORS.length] }} />
                    <span className="text-sm text-[#141A2B]">{seg.segment}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-[#141A2B]">{seg.count.toLocaleString()}</span>
                    <span className="text-xs text-[#6E7791] ml-1">({seg.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Account Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
        <SectionHeader title="Key Accounts" subtitle="Top accounts by ARR with health scores" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                {["Account", "ARR", "Health Score", "CSM", "Renewal Date", "Status"].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((acc) => (
                <tr key={acc.name} className="border-b border-[#E2E8F0]/50 hover:bg-[#F0F4F8]/20 transition-colors">
                  <td className="py-3 px-3 font-medium text-[#141A2B]">{acc.name}</td>
                  <td className="py-3 px-3 text-[#141A2B]">${(acc.arr / 1000).toFixed(0)}K</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-12 bg-[#F0F4F8] rounded-full h-1.5">
                        <div className={cn("h-1.5 rounded-full", acc.health >= 70 ? "bg-emerald-500" : acc.health >= 40 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${acc.health}%` }} />
                      </div>
                      <span className={cn("text-xs font-semibold", acc.health >= 70 ? "text-emerald-400" : acc.health >= 40 ? "text-amber-400" : "text-rose-400")}>{acc.health}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-[#141A2B] text-xs">{acc.csm}</td>
                  <td className="py-3 px-3 text-xs text-[#6E7791]">{acc.renewalDate}</td>
                  <td className="py-3 px-3"><StatusBadge status={acc.status} /></td>
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
      <div className="h-8 w-48 bg-[#F0F4F8] rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-white border border-[#E2E8F0] rounded-xl shadow-sm" />)}
      </div>
    </div>
  );
}
