import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

export default function QATab() {
  const { data, isLoading } = trpc.dashboard.qa.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#141A2B]">Quality Assurance</h1>
        <p className="text-sm text-[#6E7791] mt-1">Test results, defect tracking, and quality metrics</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      {/* Test Suite Results */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
        <SectionHeader title="Test Suite Results" subtitle="Latest run across all test suites" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                {["Suite", "Total", "Passed", "Failed", "Skipped", "Pass Rate"].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.testResults.map((suite) => {
                const passRate = ((suite.passed / suite.total) * 100).toFixed(1);
                return (
                  <tr key={suite.suite} className="border-b border-[#E2E8F0]/50 hover:bg-[#F0F4F8]/20 transition-colors">
                    <td className="py-3 px-3 font-medium text-[#141A2B]">{suite.suite}</td>
                    <td className="py-3 px-3 text-[#141A2B]">{suite.total.toLocaleString()}</td>
                    <td className="py-3 px-3 text-emerald-400">{suite.passed.toLocaleString()}</td>
                    <td className="py-3 px-3 text-rose-400">{suite.failed}</td>
                    <td className="py-3 px-3 text-[#6E7791]">{suite.skipped}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-[#F0F4F8] rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${passRate}%` }} />
                        </div>
                        <span className={cn("text-xs font-semibold", Number(passRate) >= 98 ? "text-emerald-400" : Number(passRate) >= 95 ? "text-amber-400" : "text-rose-400")}>
                          {passRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Defect Trend */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Defect Trend" subtitle="Weekly opened, closed, and backlog" />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.defectTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="opened" stroke="#EF4444" strokeWidth={2} name="Opened" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="closed" stroke="#018365" strokeWidth={2} name="Closed" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="backlog" stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 4" name="Backlog" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Open Defects */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Open Defects" subtitle="Active bugs requiring attention" />
          <div className="space-y-3">
            {data.defects.map((bug) => (
              <div key={bug.id} className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-[#6E7791]">{bug.id}</span>
                      <span className={cn("text-xs font-semibold", bug.severity === "critical" ? "text-rose-400" : bug.severity === "major" ? "text-amber-400" : "text-slate-400")}>
                        {bug.severity}
                      </span>
                    </div>
                    <p className="text-sm text-[#141A2B] leading-snug">{bug.title}</p>
                    <p className="text-xs text-[#6E7791] mt-1">{bug.component} · {bug.age} old</p>
                  </div>
                  <StatusBadge status={bug.status} />
                </div>
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
      <div className="h-8 w-48 bg-[#F0F4F8] rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-white border border-[#E2E8F0] rounded-xl shadow-sm" />)}
      </div>
    </div>
  );
}
