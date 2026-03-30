import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Award,
  Brain,
  Zap,
  Target,
  Users2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeAdoption {
  id: number;
  name: string;
  department: string;
  role: string;
  overallScore: number;
  trend: "up" | "down" | "flat";
  trendDelta: number;
  toolsUsed: number;
  promptsPerWeek: number;
  automationsCreated: number;
  trainingCompleted: number;
  dimensions: {
    toolUsage: number;
    promptQuality: number;
    automation: number;
    training: number;
    collaboration: number;
    innovation: number;
  };
  tier: "Pioneer" | "Adopter" | "Learner" | "Laggard";
  lastActive: string;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_EMPLOYEES: EmployeeAdoption[] = [
  { id: 1, name: "Sarah Chen", department: "Development", role: "Sr. Engineer", overallScore: 94, trend: "up", trendDelta: 6, toolsUsed: 12, promptsPerWeek: 87, automationsCreated: 14, trainingCompleted: 100, dimensions: { toolUsage: 96, promptQuality: 92, automation: 95, training: 100, collaboration: 88, innovation: 93 }, tier: "Pioneer", lastActive: "Today" },
  { id: 2, name: "Marcus Williams", department: "Development", role: "Tech Lead", overallScore: 91, trend: "up", trendDelta: 4, toolsUsed: 11, promptsPerWeek: 74, automationsCreated: 11, trainingCompleted: 95, dimensions: { toolUsage: 93, promptQuality: 90, automation: 88, training: 95, collaboration: 91, innovation: 89 }, tier: "Pioneer", lastActive: "Today" },
  { id: 3, name: "Priya Patel", department: "QA", role: "QA Lead", overallScore: 88, trend: "up", trendDelta: 9, toolsUsed: 10, promptsPerWeek: 65, automationsCreated: 9, trainingCompleted: 90, dimensions: { toolUsage: 88, promptQuality: 85, automation: 91, training: 90, collaboration: 86, innovation: 88 }, tier: "Pioneer", lastActive: "Yesterday" },
  { id: 4, name: "James O'Brien", department: "Sales", role: "Account Executive", overallScore: 85, trend: "up", trendDelta: 12, toolsUsed: 9, promptsPerWeek: 58, automationsCreated: 6, trainingCompleted: 85, dimensions: { toolUsage: 84, promptQuality: 88, automation: 79, training: 85, collaboration: 87, innovation: 87 }, tier: "Pioneer", lastActive: "Today" },
  { id: 5, name: "Lisa Nakamura", department: "Marketing", role: "Content Strategist", overallScore: 83, trend: "flat", trendDelta: 0, toolsUsed: 10, promptsPerWeek: 72, automationsCreated: 5, trainingCompleted: 80, dimensions: { toolUsage: 85, promptQuality: 90, automation: 72, training: 80, collaboration: 83, innovation: 88 }, tier: "Adopter", lastActive: "Today" },
  { id: 6, name: "David Kim", department: "IT/Ops", role: "DevOps Engineer", overallScore: 80, trend: "up", trendDelta: 5, toolsUsed: 8, promptsPerWeek: 45, automationsCreated: 10, trainingCompleted: 75, dimensions: { toolUsage: 80, promptQuality: 74, automation: 90, training: 75, collaboration: 78, innovation: 83 }, tier: "Adopter", lastActive: "Today" },
  { id: 7, name: "Rachel Torres", department: "CSM", role: "Customer Success Mgr", overallScore: 77, trend: "up", trendDelta: 8, toolsUsed: 8, promptsPerWeek: 52, automationsCreated: 4, trainingCompleted: 80, dimensions: { toolUsage: 78, promptQuality: 80, automation: 70, training: 80, collaboration: 82, innovation: 72 }, tier: "Adopter", lastActive: "Yesterday" },
  { id: 8, name: "Tom Bradley", department: "Development", role: "Backend Engineer", overallScore: 74, trend: "down", trendDelta: -3, toolsUsed: 7, promptsPerWeek: 38, automationsCreated: 5, trainingCompleted: 70, dimensions: { toolUsage: 74, promptQuality: 72, automation: 76, training: 70, collaboration: 73, innovation: 79 }, tier: "Adopter", lastActive: "3 days ago" },
  { id: 9, name: "Angela Foster", department: "Sales", role: "Sales Manager", overallScore: 68, trend: "up", trendDelta: 7, toolsUsed: 7, promptsPerWeek: 33, automationsCreated: 3, trainingCompleted: 65, dimensions: { toolUsage: 68, promptQuality: 72, automation: 60, training: 65, collaboration: 74, innovation: 69 }, tier: "Learner", lastActive: "Today" },
  { id: 10, name: "Chris Nguyen", department: "QA", role: "QA Engineer", overallScore: 65, trend: "flat", trendDelta: 1, toolsUsed: 6, promptsPerWeek: 28, automationsCreated: 3, trainingCompleted: 60, dimensions: { toolUsage: 65, promptQuality: 63, automation: 67, training: 60, collaboration: 68, innovation: 67 }, tier: "Learner", lastActive: "2 days ago" },
  { id: 11, name: "Nina Okafor", department: "Marketing", role: "Brand Manager", overallScore: 61, trend: "up", trendDelta: 4, toolsUsed: 6, promptsPerWeek: 22, automationsCreated: 2, trainingCompleted: 55, dimensions: { toolUsage: 62, promptQuality: 65, automation: 55, training: 55, collaboration: 66, innovation: 63 }, tier: "Learner", lastActive: "Today" },
  { id: 12, name: "Robert Haines", department: "IT/Ops", role: "Sys Admin", overallScore: 55, trend: "down", trendDelta: -5, toolsUsed: 5, promptsPerWeek: 14, automationsCreated: 2, trainingCompleted: 50, dimensions: { toolUsage: 55, promptQuality: 52, automation: 58, training: 50, collaboration: 57, innovation: 58 }, tier: "Learner", lastActive: "1 week ago" },
  { id: 13, name: "Karen Simmons", department: "CSM", role: "Support Specialist", overallScore: 42, trend: "down", trendDelta: -8, toolsUsed: 3, promptsPerWeek: 8, automationsCreated: 0, trainingCompleted: 35, dimensions: { toolUsage: 42, promptQuality: 40, automation: 35, training: 35, collaboration: 50, innovation: 50 }, tier: "Laggard", lastActive: "2 weeks ago" },
  { id: 14, name: "Frank Deluca", department: "Sales", role: "Sales Rep", overallScore: 38, trend: "flat", trendDelta: -1, toolsUsed: 3, promptsPerWeek: 6, automationsCreated: 0, trainingCompleted: 30, dimensions: { toolUsage: 38, promptQuality: 36, automation: 32, training: 30, collaboration: 44, innovation: 48 }, tier: "Laggard", lastActive: "10 days ago" },
  { id: 15, name: "Michelle Park", department: "Development", role: "Jr. Engineer", overallScore: 35, trend: "up", trendDelta: 3, toolsUsed: 4, promptsPerWeek: 12, automationsCreated: 1, trainingCompleted: 40, dimensions: { toolUsage: 36, promptQuality: 34, automation: 30, training: 40, collaboration: 38, innovation: 32 }, tier: "Laggard", lastActive: "3 days ago" },
];

const TIER_CONFIG = {
  Pioneer: { color: "bg-amber-500", text: "text-amber-700", border: "border-amber-300", bg: "bg-amber-50", hex: "#f59e0b" },
  Adopter: { color: "bg-blue-500", text: "text-blue-700", border: "border-blue-300", bg: "bg-blue-50", hex: "#3b82f6" },
  Learner: { color: "bg-slate-400", text: "text-slate-600", border: "border-slate-300", bg: "bg-slate-50", hex: "#94a3b8" },
  Laggard: { color: "bg-rose-400", text: "text-rose-700", border: "border-rose-300", bg: "bg-rose-50", hex: "#f87171" },
};

const DEPT_COLORS: Record<string, string> = {
  Development: "#1e3a5f",
  QA: "#0d9488",
  Sales: "#7c3aed",
  Marketing: "#db2777",
  "IT/Ops": "#0284c7",
  CSM: "#d97706",
};

// ─── Helper components ────────────────────────────────────────────────────────

function TrendIcon({ trend, delta }: { trend: "up" | "down" | "flat"; delta: number }) {
  if (trend === "up") return <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-medium"><TrendingUp size={12} />+{delta}</span>;
  if (trend === "down") return <span className="flex items-center gap-0.5 text-rose-500 text-xs font-medium"><TrendingDown size={12} />{delta}</span>;
  return <span className="flex items-center gap-0.5 text-slate-400 text-xs"><Minus size={12} />0</span>;
}

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = score >= 80 ? "bg-amber-500" : score >= 65 ? "bg-blue-500" : score >= 50 ? "bg-slate-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-6 text-right">{score}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HRTab() {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [sortField, setSortField] = useState<"overallScore" | "name" | "department">("overallScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeAdoption | null>(null);

  // Fetch from tRPC; fall back to demo data when the query fails (DB not configured).
  // NOTE: error is intentionally ignored — we always have DEMO_EMPLOYEES as fallback.
  const { data: apiData, isLoading } = trpc.hr.aiAdoption.useQuery(undefined, {
    retry: false,
  });

  // Map API rows (flat DB shape) → EmployeeAdoption shape, or use DEMO_EMPLOYEES as fallback.
  // This useMemo MUST stay above any early returns to satisfy Rules of Hooks.
  const employees: EmployeeAdoption[] = useMemo(() => {
    const src: unknown[] = (apiData as unknown[] | undefined) ?? DEMO_EMPLOYEES;
    return src.map((r) => {
      const row = r as Record<string, unknown>;
      if ("dimToolUsage" in row) {
        // DB / tRPC shape — remap to EmployeeAdoption
        const delta = (row.trendDelta as number) ?? 0;
        return {
          id: row.id as number,
          name: row.employeeName as string,
          department: row.department as string,
          role: row.jobTitle as string,
          overallScore: row.overallScore as number,
          trend: (delta > 0 ? "up" : delta < 0 ? "down" : "flat") as "up" | "down" | "flat",
          trendDelta: delta,
          toolsUsed: row.toolsUsed as number,
          promptsPerWeek: row.promptsPerWeek as number,
          automationsCreated: row.automationsCreated as number,
          trainingCompleted: row.dimTraining as number,
          dimensions: {
            toolUsage: row.dimToolUsage as number,
            promptQuality: row.dimPromptQuality as number,
            automation: row.dimAutomation as number,
            training: row.dimTraining as number,
            collaboration: row.dimCollaboration as number,
            innovation: row.dimInnovation as number,
          },
          tier: row.tier as EmployeeAdoption["tier"],
          lastActive: row.lastActiveAt
            ? new Date(row.lastActiveAt as string | Date).toLocaleDateString()
            : "Unknown",
        } satisfies EmployeeAdoption;
      }
      // Already in EmployeeAdoption shape (DEMO_EMPLOYEES fallback)
      return r as EmployeeAdoption;
    });
  }, [apiData]);

  // ── Derived stats ── (all useMemo hooks MUST be before any conditional returns)
  const stats = useMemo(() => {
    const total = employees.length;
    const avgScore = Math.round(employees.reduce((s, e) => s + e.overallScore, 0) / total);
    const pioneers = employees.filter(e => e.tier === "Pioneer").length;
    const laggards = employees.filter(e => e.tier === "Laggard").length;
    const trending = employees.filter(e => e.trend === "up").length;
    return { total, avgScore, pioneers, laggards, trending };
  }, [employees]);

  // ── Dept distribution for bar chart ──
  const deptData = useMemo(() => {
    const map: Record<string, { dept: string; avg: number; count: number; total: number }> = {};
    for (const e of employees) {
      if (!map[e.department]) map[e.department] = { dept: e.department, avg: 0, count: 0, total: 0 };
      map[e.department].total += e.overallScore;
      map[e.department].count += 1;
    }
    return Object.values(map).map(d => ({ ...d, avg: Math.round(d.total / d.count) })).sort((a, b) => b.avg - a.avg);
  }, [employees]);

  // ── Filtered + sorted list ──
  const filtered = useMemo(() => {
    let list = employees.filter(e => {
      const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.department.toLowerCase().includes(search.toLowerCase()) || e.role.toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === "all" || e.department === deptFilter;
      const matchTier = tierFilter === "all" || e.tier === tierFilter;
      return matchSearch && matchDept && matchTier;
    });
    list = [...list].sort((a, b) => {
      const av = a[sortField] as string | number;
      const bv = b[sortField] as string | number;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [employees, search, deptFilter, tierFilter, sortField, sortDir]);

  const departments = Array.from(new Set(employees.map(e => e.department))).sort();

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return <ChevronDown size={12} className="text-slate-300" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-slate-600" /> : <ChevronDown size={12} className="text-slate-600" />;
  }

  // ── Radar data for selected employee ──
  const radarData = selectedEmployee ? [
    { dim: "Tool Usage", value: selectedEmployee.dimensions.toolUsage },
    { dim: "Prompt Quality", value: selectedEmployee.dimensions.promptQuality },
    { dim: "Automation", value: selectedEmployee.dimensions.automation },
    { dim: "Training", value: selectedEmployee.dimensions.training },
    { dim: "Collaboration", value: selectedEmployee.dimensions.collaboration },
    { dim: "Innovation", value: selectedEmployee.dimensions.innovation },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Brain size={22} className="text-amber-500" />
            AI Adoption Rankings
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Employee-level AI tool adoption scores across all departments</p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
          <Badge variant="outline" className="text-xs text-slate-500">Updated daily</Badge>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Avg Adoption Score", value: `${stats.avgScore}/100`, icon: <Target size={16} className="text-blue-500" />, sub: "Across all employees" },
          { label: "Pioneers", value: stats.pioneers, icon: <Award size={16} className="text-amber-500" />, sub: "Score ≥ 80" },
          { label: "Trending Up", value: stats.trending, icon: <TrendingUp size={16} className="text-emerald-500" />, sub: "Improving this month" },
          { label: "Need Attention", value: stats.laggards, icon: <Zap size={16} className="text-rose-500" />, sub: "Score < 50" },
        ].map(kpi => (
          <Card key={kpi.label} className="border border-slate-100 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">{kpi.label}</span>
                {kpi.icon}
              </div>
              <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dept avg bar chart */}
        <Card className="lg:col-span-2 border border-slate-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Average AI Adoption Score by Department</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={deptData} barSize={32}>
                <XAxis dataKey="dept" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  formatter={(v: number) => [`${v}/100`, "Avg Score"]}
                />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                  {deptData.map(d => (
                    <Cell key={d.dept} fill={DEPT_COLORS[d.dept] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tier breakdown */}
        <Card className="border border-slate-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Tier Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {(["Pioneer", "Adopter", "Learner", "Laggard"] as const).map(tier => {
              const count = employees.filter(e => e.tier === tier).length;
              const pct = Math.round((count / employees.length) * 100);
              const cfg = TIER_CONFIG[tier];
              return (
                <div key={tier}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={`font-medium ${cfg.text}`}>{tier}</span>
                    <span className="text-slate-500">{count} employees ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cfg.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-400 space-y-1">
              <div><span className="font-medium text-amber-600">Pioneer</span> ≥ 80 · <span className="font-medium text-blue-600">Adopter</span> 65–79</div>
              <div><span className="font-medium text-slate-500">Learner</span> 50–64 · <span className="font-medium text-rose-500">Laggard</span> &lt; 50</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, department, or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="Pioneer">Pioneer</SelectItem>
            <SelectItem value="Adopter">Adopter</SelectItem>
            <SelectItem value="Learner">Learner</SelectItem>
            <SelectItem value="Laggard">Laggard</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-400">{filtered.length} of {employees.length} employees</span>
      </div>

      {/* ── Main table + detail panel ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Ranking table */}
        <div className="xl:col-span-2">
          <Card className="border border-slate-100 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="w-10 text-center text-xs">#</TableHead>
                    <TableHead className="cursor-pointer select-none text-xs" onClick={() => toggleSort("name")}>
                      <span className="flex items-center gap-1">Employee <SortIcon field="name" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-xs" onClick={() => toggleSort("department")}>
                      <span className="flex items-center gap-1">Dept <SortIcon field="department" /></span>
                    </TableHead>
                    <TableHead className="text-xs">Tier</TableHead>
                    <TableHead className="cursor-pointer select-none text-xs min-w-32" onClick={() => toggleSort("overallScore")}>
                      <span className="flex items-center gap-1">AI Score <SortIcon field="overallScore" /></span>
                    </TableHead>
                    <TableHead className="text-xs">Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((emp, idx) => {
                    const cfg = TIER_CONFIG[emp.tier];
                    const isSelected = selectedEmployee?.id === emp.id;
                    return (
                      <TableRow
                        key={emp.id}
                        className={`cursor-pointer transition-colors ${isSelected ? "bg-blue-50 hover:bg-blue-50" : "hover:bg-slate-50"}`}
                        onClick={() => setSelectedEmployee(isSelected ? null : emp)}
                      >
                        <TableCell className="text-center text-xs text-slate-400 font-mono">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm text-slate-900">{emp.name}</div>
                          <div className="text-xs text-slate-400">{emp.role}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${DEPT_COLORS[emp.department]}18`, color: DEPT_COLORS[emp.department] ?? "#64748b" }}>
                            {emp.department}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.text} ${cfg.border} ${cfg.bg}`}>
                            {emp.tier}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-32">
                          <ScoreBar score={emp.overallScore} />
                        </TableCell>
                        <TableCell>
                          <TrendIcon trend={emp.trend} delta={emp.trendDelta} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-400 text-sm">
                        No employees match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Detail panel */}
        <div>
          {selectedEmployee ? (
            <Card className="border border-slate-100 shadow-sm sticky top-4">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900">{selectedEmployee.name}</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">{selectedEmployee.role} · {selectedEmployee.department}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${TIER_CONFIG[selectedEmployee.tier].text} ${TIER_CONFIG[selectedEmployee.tier].border} ${TIER_CONFIG[selectedEmployee.tier].bg}`}>
                    {selectedEmployee.tier}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-3xl font-bold text-slate-900">{selectedEmployee.overallScore}</span>
                  <span className="text-sm text-slate-400">/100</span>
                  <TrendIcon trend={selectedEmployee.trend} delta={selectedEmployee.trendDelta} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Radar chart */}
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="dim" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Radar dataKey="value" stroke="#1e3a5f" fill="#1e3a5f" fillOpacity={0.15} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>

                {/* Activity stats */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Tools Used", value: selectedEmployee.toolsUsed },
                    { label: "Prompts/Week", value: selectedEmployee.promptsPerWeek },
                    { label: "Automations", value: selectedEmployee.automationsCreated },
                    { label: "Training %", value: `${selectedEmployee.dimensions.training}%` },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-50 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-slate-900">{s.value}</div>
                      <div className="text-xs text-slate-400">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Dimension breakdown */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Dimension Scores</p>
                  {Object.entries(selectedEmployee.dimensions).map(([key, val]) => (
                    <div key={key}>
                      <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                        <span className="capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                        <span className="font-medium text-slate-700">{val}</span>
                      </div>
                      <ScoreBar score={val} />
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-400">Last active: {selectedEmployee.lastActive}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-dashed border-slate-200 shadow-none">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Users2 size={32} className="text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">Click any employee row to view their detailed AI adoption profile and dimension breakdown.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
