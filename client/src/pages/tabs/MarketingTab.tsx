import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

const CHANNEL_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa"];

export default function MarketingTab() {
  const { data, isLoading } = trpc.dashboard.marketing.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Marketing</h1>
        <p className="text-sm text-muted-foreground mt-1">Lead generation, channel performance, and campaign analytics</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      {/* Traffic Trend */}
      <div className="bg-card border border-border rounded-xl p-5">
        <SectionHeader title="Website Traffic by Source" subtitle="Monthly unique visitors by channel" />
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data.trafficTrend}>
            <defs>
              {["organic", "paid", "direct", "referral"].map((key, i) => (
                <linearGradient key={key} id={`grad_${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHANNEL_COLORS[i]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHANNEL_COLORS[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v: number) => [v.toLocaleString()]} />
            <Legend />
            <Area type="monotone" dataKey="organic" stroke={CHANNEL_COLORS[0]} fill={`url(#grad_organic)`} strokeWidth={2} name="Organic" />
            <Area type="monotone" dataKey="paid" stroke={CHANNEL_COLORS[1]} fill={`url(#grad_paid)`} strokeWidth={2} name="Paid" />
            <Area type="monotone" dataKey="direct" stroke={CHANNEL_COLORS[2]} fill={`url(#grad_direct)`} strokeWidth={2} name="Direct" />
            <Area type="monotone" dataKey="referral" stroke={CHANNEL_COLORS[3]} fill={`url(#grad_referral)`} strokeWidth={2} name="Referral" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Channel Performance */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Channel Performance" subtitle="Leads and cost per lead by channel" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.channelPerformance} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="channel" type="category" tick={{ fontSize: 10 }} width={110} />
              <Tooltip />
              <Bar dataKey="leads" radius={[0, 4, 4, 0]} name="Leads">
                {data.channelPerformance.map((_, i) => <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Campaigns */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Active Campaigns" subtitle="Budget utilization and ROI" />
          <div className="space-y-3">
            {data.campaigns.map((campaign) => {
              const spentPct = Math.round((campaign.spent / campaign.budget) * 100);
              return (
                <div key={campaign.name} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-foreground">{campaign.name}</p>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    <div>
                      <p className="text-muted-foreground">Budget</p>
                      <p className="font-semibold text-foreground">${(campaign.budget / 1000).toFixed(0)}K</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Leads</p>
                      <p className="font-semibold text-foreground">{campaign.leads}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">ROI</p>
                      <p className="font-semibold text-emerald-400">{campaign.roi}x</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${spentPct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{spentPct}% spent</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-36 bg-muted rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-card border border-border rounded-xl" />)}
      </div>
    </div>
  );
}
