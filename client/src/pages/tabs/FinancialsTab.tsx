import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e"];

export default function FinancialsTab() {
  const { data, isLoading } = trpc.dashboard.financials.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Financials</h1>
        <p className="text-sm text-muted-foreground mt-1">Revenue, expenses, and cash flow — FY2024</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      {/* Revenue / Expenses / Profit */}
      <div className="bg-card border border-border rounded-xl p-5">
        <SectionHeader title="Monthly Revenue, Expenses & Profit" subtitle="Full year FY2024 ($)" />
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.monthlyRevenue}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
            <Tooltip formatter={(v: number) => [`$${(v / 1000).toFixed(0)}K`]} />
            <Legend />
            <Bar dataKey="revenue" fill="#6366f1" name="Revenue" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" fill="#f43f5e" name="Expenses" radius={[3, 3, 0, 0]} />
            <Bar dataKey="profit" fill="#22d3ee" name="Profit" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Revenue by Product */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Revenue by Product Line" subtitle="ARR breakdown" />
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={data.revenueByProduct} dataKey="revenue" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                  {data.revenueByProduct.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`$${(v / 1000000).toFixed(2)}M`]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.revenueByProduct.map((item, i) => (
                <div key={item.product} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-foreground">{item.product}</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-card border border-border rounded-xl p-5">
          <SectionHeader title="Operating Expense Breakdown" subtitle="YTD allocation" />
          <div className="space-y-3 mt-2">
            {data.expenseBreakdown.map((item, i) => (
              <div key={item.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground">{item.category}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">${(item.amount / 1000000).toFixed(1)}M</span>
                    <span className="text-xs font-semibold text-foreground w-10 text-right">{item.percentage}%</span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="h-1.5 rounded-full" style={{ width: `${item.percentage}%`, background: COLORS[i % COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cash Flow */}
      <div className="bg-card border border-border rounded-xl p-5">
        <SectionHeader title="Cash Flow" subtitle="Operating, investing, and financing activities ($)" />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.cashFlow}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v: number) => [`$${(v / 1000).toFixed(0)}K`]} />
            <Legend />
            <Bar dataKey="operating" fill="#10b981" name="Operating" radius={[3, 3, 0, 0]} />
            <Bar dataKey="investing" fill="#f43f5e" name="Investing" radius={[3, 3, 0, 0]} />
            <Bar dataKey="financing" fill="#6366f1" name="Financing" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-card border border-border rounded-xl" />)}
      </div>
      <div className="h-72 bg-card border border-border rounded-xl" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="h-64 bg-card border border-border rounded-xl" />
        <div className="h-64 bg-card border border-border rounded-xl" />
      </div>
    </div>
  );
}
