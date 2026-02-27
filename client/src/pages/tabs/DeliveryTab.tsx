import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function DeliveryTab() {
  const { data, isLoading } = trpc.dashboard.delivery.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Delivery</h1>
        <p className="text-sm text-muted-foreground mt-1">Project tracker, sprint velocity, and delivery performance</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      {/* Project Tracker */}
      <div className="bg-card border border-border rounded-xl p-5">
        <SectionHeader title="Active Projects" subtitle={`${data.projects.length} projects tracked`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Progress</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owner</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-3">
                    <div>
                      <p className="font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.id}</p>
                    </div>
                  </td>
                  <td className="py-3 px-3"><StatusBadge status={p.status} /></td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-muted rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-foreground text-xs">{p.dueDate}</td>
                  <td className="py-3 px-3 text-foreground text-xs">{p.owner}</td>
                  <td className="py-3 px-3">
                    <span className={`text-xs font-medium capitalize ${p.priority === "high" ? "text-rose-400" : p.priority === "medium" ? "text-amber-400" : "text-slate-400"}`}>
                      {p.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Velocity Trend */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Sprint Velocity Trend" subtitle="Planned vs completed story points" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.velocityTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="planned" fill="#6366f1" name="Planned" radius={[3, 3, 0, 0]} />
              <Bar dataKey="completed" fill="#22d3ee" name="Completed" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Delivery by Team */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="On-Time Delivery by Team" subtitle="Percentage of deliverables on schedule" />
          <div className="space-y-4 mt-2">
            {data.deliveryByTeam.map((team) => (
              <div key={team.team}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-foreground">{team.team}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-400">{team.onTime}% on-time</span>
                    <span className="text-rose-400">{team.delayed}% delayed</span>
                  </div>
                </div>
                <div className="flex w-full h-2 rounded-full overflow-hidden bg-muted">
                  <div className="bg-emerald-500 h-full" style={{ width: `${team.onTime}%` }} />
                  <div className="bg-rose-500 h-full" style={{ width: `${team.delayed}%` }} />
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
      <div className="h-8 w-40 bg-muted rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-card border border-border rounded-xl" />)}
      </div>
      <div className="h-72 bg-card border border-border rounded-xl" />
    </div>
  );
}
