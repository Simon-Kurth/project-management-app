import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

const STAGE_COLORS = ["#134C93", "#018365", "#F59E0B", "#018365", "#EF4444"];

export default function SalesTab() {
  const { data, isLoading } = trpc.dashboard.sales.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#141A2B]">Sales</h1>
        <p className="text-sm text-[#6E7791] mt-1">Pipeline, rep performance, and revenue forecast</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Pipeline by Stage */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Pipeline by Stage" subtitle="Deal value and count per stage" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.pipelineByStage} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
              <YAxis dataKey="stage" type="category" tick={{ fontSize: 11 }} width={100} />
              <Tooltip formatter={(v: number) => [`$${(v / 1000).toFixed(0)}K`]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Value">
                {data.pipelineByStage.map((_, i) => <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Forecast vs Actual */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Forecast vs Actual Revenue" subtitle="Last 6 months ($)" />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.forecastVsActual}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => [`$${(v / 1000).toFixed(0)}K`]} />
              <Legend />
              <Line type="monotone" dataKey="forecast" stroke="#134C93" strokeWidth={2} strokeDasharray="4 4" name="Forecast" dot={false} />
              <Line type="monotone" dataKey="actual" stroke="#018365" strokeWidth={2} name="Actual" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rep Performance */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
        <SectionHeader title="Rep Performance" subtitle="Quota attainment and deal metrics" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                {["Rep", "Quota", "Achieved", "Attainment", "Deals Closed", ""].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.repPerformance.map((rep) => (
                <tr key={rep.name} className="border-b border-[#E2E8F0]/50 hover:bg-[#F0F4F8]/20 transition-colors">
                  <td className="py-3 px-3 font-medium text-[#141A2B]">{rep.name}</td>
                  <td className="py-3 px-3 text-[#6E7791]">${(rep.quota / 1000).toFixed(0)}K</td>
                  <td className="py-3 px-3 text-[#141A2B]">${(rep.achieved / 1000).toFixed(0)}K</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-[#F0F4F8] rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${rep.attainment >= 100 ? "bg-emerald-500" : rep.attainment >= 85 ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: `${Math.min(rep.attainment, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold ${rep.attainment >= 100 ? "text-emerald-400" : rep.attainment >= 85 ? "text-amber-400" : "text-rose-400"}`}>
                        {rep.attainment.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-[#141A2B]">{rep.deals}</td>
                  <td className="py-3 px-3">
                    {rep.attainment >= 100 && <span className="text-xs text-emerald-400 font-medium">✓ On Track</span>}
                    {rep.attainment < 100 && rep.attainment >= 85 && <span className="text-xs text-amber-400 font-medium">Near Target</span>}
                    {rep.attainment < 85 && <span className="text-xs text-rose-400 font-medium">Behind</span>}
                  </td>
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
