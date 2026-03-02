import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const COLORS = ["#134C93", "#018365", "#F59E0B", "#018365", "#EF4444"];

export default function DevelopmentTab() {
  const { data, isLoading } = trpc.dashboard.development.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#141A2B]">Development</h1>
        <p className="text-sm text-[#6E7791] mt-1">Engineering velocity, deployments, and code quality</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Deployment Frequency */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Deployment Frequency" subtitle="Weekly deployments and rollbacks" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.deploymentFrequency}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="deployments" fill="#134C93" name="Deployments" radius={[3, 3, 0, 0]} />
              <Bar dataKey="rollbacks" fill="#EF4444" name="Rollbacks" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sprint Burndown */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Sprint Burndown" subtitle="Remaining vs ideal story points" />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.burndown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="remaining" stroke="#134C93" strokeWidth={2} name="Remaining" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="ideal" stroke="#018365" strokeWidth={2} strokeDasharray="4 4" name="Ideal" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Top Contributors */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Top Contributors (30d)" subtitle="Commits, PRs, and code reviews" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0]">
                  <th className="text-left py-2 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">Engineer</th>
                  <th className="text-right py-2 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">Commits</th>
                  <th className="text-right py-2 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">PRs</th>
                  <th className="text-right py-2 text-xs font-semibold text-[#6E7791] uppercase tracking-wider">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {data.topContributors.map((c, i) => (
                  <tr key={c.name} className="border-b border-[#E2E8F0]/50">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#6E7791] w-4">{i + 1}</span>
                        <span className="font-medium text-[#141A2B]">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-[#141A2B]">{c.commits}</td>
                    <td className="py-2.5 text-right text-[#141A2B]">{c.prs}</td>
                    <td className="py-2.5 text-right text-[#141A2B]">{c.reviews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Language Breakdown */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Language Breakdown" subtitle="Codebase composition by language" />
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={data.languageBreakdown} dataKey="percentage" cx="50%" cy="50%" outerRadius={75} innerRadius={45}>
                  {data.languageBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v}%`]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2.5">
              {data.languageBreakdown.map((lang, i) => (
                <div key={lang.language} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm text-[#141A2B]">{lang.language}</span>
                  </div>
                  <span className="text-sm font-semibold text-[#141A2B]">{lang.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-44 bg-[#F0F4F8] rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-white border border-[#E2E8F0] rounded-xl shadow-sm" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="h-64 bg-white border border-[#E2E8F0] rounded-xl shadow-sm" />
        <div className="h-64 bg-white border border-[#E2E8F0] rounded-xl shadow-sm" />
      </div>
    </div>
  );
}
