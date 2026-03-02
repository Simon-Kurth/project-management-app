import { trpc } from "@/lib/trpc";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const COLORS = ["#134C93", "#018365", "#F59E0B", "#018365", "#EF4444"];

export default function FinancialsTab() {
  const { data, isLoading } = trpc.dashboard.financials.useQuery();

  if (isLoading) return <TabSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#141A2B]">Financials</h1>
        <p className="text-sm text-[#6E7791] mt-1">Revenue, expenses, and cash flow — FY2024</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {data.kpis.map((kpi) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} trend={kpi.trend as "up" | "down" | "neutral"} />
        ))}
      </div>

      {/* Revenue / Expenses / Profit */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
        <SectionHeader title="Monthly Revenue, Expenses & Profit" subtitle="Full year FY2024 ($)" />
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.monthlyRevenue}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
            <Tooltip formatter={(v: number) => [`$${(v / 1000).toFixed(0)}K`]} />
            <Legend />
            <Bar dataKey="revenue" fill="#134C93" name="Revenue" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" fill="#EF4444" name="Expenses" radius={[3, 3, 0, 0]} />
            <Bar dataKey="profit" fill="#018365" name="Profit" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Revenue by Product */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
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
                    <span className="text-xs text-[#141A2B]">{item.product}</span>
                  </div>
                  <span className="text-xs font-semibold text-[#141A2B]">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
          <SectionHeader title="Operating Expense Breakdown" subtitle="YTD allocation" />
          <div className="space-y-3 mt-2">
            {data.expenseBreakdown.map((item, i) => (
              <div key={item.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-[#141A2B]">{item.category}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#6E7791]">${(item.amount / 1000000).toFixed(1)}M</span>
                    <span className="text-xs font-semibold text-[#141A2B] w-10 text-right">{item.percentage}%</span>
                  </div>
                </div>
                <div className="w-full bg-[#F0F4F8] rounded-full h-1.5">
                  <div className="h-1.5 rounded-full" style={{ width: `${item.percentage}%`, background: COLORS[i % COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cash Flow */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
        <SectionHeader title="Cash Flow" subtitle="Operating, investing, and financing activities ($)" />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.cashFlow}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v: number) => [`$${(v / 1000).toFixed(0)}K`]} />
            <Legend />
            <Bar dataKey="operating" fill="#018365" name="Operating" radius={[3, 3, 0, 0]} />
            <Bar dataKey="investing" fill="#EF4444" name="Investing" radius={[3, 3, 0, 0]} />
            <Bar dataKey="financing" fill="#134C93" name="Financing" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
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
      <div className="h-72 bg-white border border-[#E2E8F0] rounded-xl shadow-sm" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="h-64 bg-white border border-[#E2E8F0] rounded-xl shadow-sm" />
        <div className="h-64 bg-white border border-[#E2E8F0] rounded-xl shadow-sm" />
      </div>
    </div>
  );
}
