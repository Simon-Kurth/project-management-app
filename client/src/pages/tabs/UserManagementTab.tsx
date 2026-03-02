import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ChevronRight,
  Clock,
  KeyRound,
  Search,
  Shield,
  ShieldOff,
  UserCheck,
  UserX,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppRole = "executive" | "company" | "qa" | "sales_marketing" | "csm" | "admin" | "user";

type UserRow = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  loginMethod: string | null;
  isActive: boolean | null;
  lastSignedIn: Date | null;
  createdAt: Date;
  mfaStatus: "duo_active" | "bypassed";
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "executive",       label: "Executive" },
  { value: "company",         label: "Company" },
  { value: "qa",              label: "QA" },
  { value: "sales_marketing", label: "Sales & Marketing" },
  { value: "csm",             label: "CSM" },
  { value: "admin",           label: "Admin" },
  { value: "user",            label: "User (no access)" },
];

const ROLE_COLORS: Record<string, string> = {
  executive:       "bg-violet-500/20 text-violet-300 border-violet-500/30",
  company:         "bg-blue-500/20 text-blue-300 border-blue-500/30",
  admin:           "bg-amber-500/20 text-amber-300 border-amber-500/30",
  qa:              "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  sales_marketing: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  csm:             "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  user:            "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
};

const ROLE_LABELS: Record<string, string> = {
  executive:       "Executive",
  company:         "Company",
  admin:           "Admin",
  qa:              "QA",
  sales_marketing: "Sales & Marketing",
  csm:             "CSM",
  user:            "User",
};

function formatDate(date: Date | null | undefined): string {
  if (!date) return "Never";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(date: Date | null | undefined): string {
  if (!date) return "Never";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

// ─── Audit Trail Drawer ───────────────────────────────────────────────────────

function AuditTrailDrawer({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { data: logs, isLoading } = trpc.users.auditTrail.useQuery({ userId: user.id });

  const ACTION_COLORS: Record<string, string> = {
    LOGIN_SUCCESS:        "text-emerald-400",
    LOGIN_SUCCESS_DUO:    "text-emerald-400",
    LOGIN_DUO_INITIATED:  "text-blue-400",
    LOGIN_FAILED:         "text-red-400",
    DUO_CALLBACK_FAILED:  "text-red-400",
    TAB_VIEW:             "text-zinc-400",
    USER_ROLE_CHANGED:    "text-amber-400",
    USER_ACTIVATED:       "text-emerald-400",
    USER_DEACTIVATED:     "text-red-400",
    LOGOUT:               "text-zinc-500",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="relative w-full max-w-md bg-[#0d0d14] border-l border-white/[0.08] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-white">
              {user.name ?? user.email ?? "User"}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* User summary */}
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {(user.name ?? user.email ?? "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border", ROLE_COLORS[user.role] ?? ROLE_COLORS.user)}>
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              {user.mfaStatus === "duo_active" ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-semibold text-emerald-400">
                  <Shield size={9} /> Duo Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-500/70">
                  <ShieldOff size={9} /> MFA Bypassed
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Last login: {timeAgo(user.lastSignedIn)}
            </p>
          </div>
        </div>

        {/* Audit trail */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-3">
            <div className="flex items-center gap-1.5 mb-3">
              <Activity size={12} className="text-zinc-500" />
              <span className="text-xs font-medium text-zinc-400">Recent Activity</span>
              <span className="text-[10px] text-zinc-600 ml-auto">Last 20 events</span>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : !logs || logs.length === 0 ? (
              <div className="text-center py-10">
                <Activity size={24} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-600">No activity recorded yet</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-medium", ACTION_COLORS[log.action] ?? "text-zinc-400")}>
                        {log.action.replace(/_/g, " ")}
                      </p>
                      {log.resource && (
                        <p className="text-[11px] text-zinc-600 mt-0.5">
                          {log.resource}{log.resourceId ? ` · ${log.resourceId}` : ""}
                        </p>
                      )}
                      {log.ipAddress && (
                        <p className="text-[10px] text-zinc-700 mt-0.5">IP: {log.ipAddress}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5">
                      {timeAgo(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserManagementTab() {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();

  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success("Role updated successfully");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleActiveMutation = trpc.users.toggleActive.useMutation({
    onSuccess: (_, vars) => {
      utils.users.list.invalidate();
      toast.success(vars.isActive ? "Account activated" : "Account deactivated");
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const stats = {
    total: users?.length ?? 0,
    active: users?.filter((u) => u.isActive !== false).length ?? 0,
    duoActive: users?.filter((u) => u.mfaStatus === "duo_active").length ?? 0,
    executives: users?.filter((u) => u.role === "executive" || u.role === "admin").length ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-white">User Management</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage accounts, roles, and monitor authentication activity across the organization.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Users", value: stats.total, icon: <UserCheck size={14} />, color: "text-zinc-300" },
          { label: "Active Accounts", value: stats.active, icon: <UserCheck size={14} />, color: "text-emerald-400" },
          { label: "Duo MFA Active", value: stats.duoActive, icon: <Shield size={14} />, color: "text-blue-400" },
          { label: "Executives / Admins", value: stats.executives, icon: <KeyRound size={14} />, color: "text-violet-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className={cn("flex items-center gap-1.5 text-xs font-medium mb-2", stat.color)}>
              {stat.icon}
              {stat.label}
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.06] transition-colors"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-zinc-300 focus:outline-none focus:border-violet-500/50 transition-colors"
        >
          <option value="all">All Roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* User table */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">MFA</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden lg:table-cell">Last Login</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden xl:table-cell">Member Since</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-8 bg-white/[0.03] rounded-lg animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-600 text-sm">
                    No users match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* User identity */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/60 to-indigo-600/60 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                          {(user.name ?? user.email ?? "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate max-w-[140px]">
                            {user.name ?? "—"}
                          </p>
                          <p className="text-[11px] text-zinc-500 truncate max-w-[140px]">
                            {user.email ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Role selector */}
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={(e) =>
                          updateRoleMutation.mutate({ userId: user.id, role: e.target.value as AppRole })
                        }
                        disabled={updateRoleMutation.isPending}
                        className={cn(
                          "text-[11px] font-semibold px-2 py-1 rounded-full border bg-transparent cursor-pointer",
                          "focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors",
                          "hover:opacity-80 disabled:opacity-50",
                          ROLE_COLORS[user.role] ?? ROLE_COLORS.user
                        )}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value} className="bg-[#15151e] text-zinc-200">
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* MFA status */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {user.mfaStatus === "duo_active" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-semibold text-emerald-400">
                          <Shield size={9} />
                          Duo Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-500/70">
                          <ShieldOff size={9} />
                          Bypassed
                        </span>
                      )}
                    </td>

                    {/* Last login */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <Clock size={10} />
                        {timeAgo(user.lastSignedIn)}
                      </div>
                    </td>

                    {/* Member since */}
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-[11px] text-zinc-600">
                        {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </td>

                    {/* Active toggle */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          toggleActiveMutation.mutate({ userId: user.id, isActive: !(user.isActive !== false) })
                        }
                        disabled={toggleActiveMutation.isPending}
                        title={user.isActive !== false ? "Deactivate account" : "Activate account"}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                          "hover:opacity-80 disabled:opacity-50",
                          user.isActive !== false
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                            : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400"
                        )}
                      >
                        {user.isActive !== false ? (
                          <><UserCheck size={9} /> Active</>
                        ) : (
                          <><UserX size={9} /> Inactive</>
                        )}
                      </button>
                    </td>

                    {/* Audit trail button */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedUser(user as UserRow)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
                      >
                        Activity
                        <ChevronRight size={10} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!isLoading && (
          <div className="px-4 py-2.5 border-t border-white/[0.04] flex items-center justify-between">
            <span className="text-[11px] text-zinc-600">
              {filtered.length} of {users?.length ?? 0} users
            </span>
            <span className="text-[11px] text-zinc-700">
              Role changes take effect on next login
            </span>
          </div>
        )}
      </div>

      {/* Audit trail drawer */}
      {selectedUser && (
        <AuditTrailDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
