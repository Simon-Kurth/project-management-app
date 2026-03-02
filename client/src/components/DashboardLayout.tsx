import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { getDemoUser, clearDemoUser } from "@/lib/authStore";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ChevronDown,
  Cpu,
  DollarSign,
  Headphones,
  LayoutDashboard,
  LogOut,
  Megaphone,
  PackageCheck,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppRole =
  | "user"
  | "admin"
  | "executive"
  | "company"
  | "qa"
  | "sales_marketing"
  | "csm";

interface Tab {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: AppRole[];
}

// ─── Tab registry ─────────────────────────────────────────────────────────────

const ALL_TABS: Tab[] = [
  {
    id: "executive-summary",
    label: "Executive Summary",
    path: "/dashboard/executive-summary",
    icon: <LayoutDashboard size={14} />,
    roles: ["executive", "company", "admin"],
  },
  {
    id: "financials",
    label: "Financials",
    path: "/dashboard/financials",
    icon: <DollarSign size={14} />,
    roles: ["executive", "company", "admin"],
  },
  {
    id: "delivery",
    label: "Delivery",
    path: "/dashboard/delivery",
    icon: <PackageCheck size={14} />,
    roles: ["executive", "company", "admin"],
  },
  {
    id: "development",
    label: "Development",
    path: "/dashboard/development",
    icon: <Cpu size={14} />,
    roles: ["executive", "company", "admin"],
  },
  {
    id: "it-ops",
    label: "IT / Ops",
    path: "/dashboard/it-ops",
    icon: <Settings size={14} />,
    roles: ["executive", "company", "admin"],
  },
  {
    id: "qa",
    label: "QA",
    path: "/dashboard/qa",
    icon: <ShieldCheck size={14} />,
    roles: ["executive", "company", "admin", "qa"],
  },
  {
    id: "csm",
    label: "CSM",
    path: "/dashboard/csm",
    icon: <Headphones size={14} />,
    roles: ["executive", "company", "admin", "csm"],
  },
  {
    id: "sales",
    label: "Sales",
    path: "/dashboard/sales",
    icon: <TrendingUp size={14} />,
    roles: ["executive", "company", "admin", "sales_marketing"],
  },
  {
    id: "marketing",
    label: "Marketing",
    path: "/dashboard/marketing",
    icon: <Megaphone size={14} />,
    roles: ["executive", "company", "admin", "sales_marketing"],
  },
];

// ─── Role display config ──────────────────────────────────────────────────────

const ROLE_CONFIG: Record<AppRole, { label: string; color: string }> = {
  executive:       { label: "Executive",        color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  company:         { label: "Company",           color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  admin:           { label: "Admin",             color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  qa:              { label: "QA",                color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  sales_marketing: { label: "Sales & Marketing", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  csm:             { label: "CSM",               color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  user:            { label: "User",              color: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
};

// ─── Duo Status Badge ────────────────────────────────────────────────────────
// Shows a small indicator in the header: green "Duo Active" when Duo is
// configured and reachable, amber "MFA Bypassed" in dev mode.
// Polls the duoStatus endpoint once on mount; no auto-refresh needed.

function DuoStatusBadge() {
  const { data } = trpc.auth.duoStatus.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // cache for 5 min — no need to hammer the endpoint
    retry: false,
  });

  if (!data) return null; // loading — show nothing

  if (data.ok) {
    return (
      <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-semibold text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Duo Active
      </span>
    );
  }

  // Duo not configured — show a subtle amber badge in dev mode
  return (
    <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-500/70">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
      MFA Bypassed
    </span>
  );
}

// ─── DashboardLayout ──────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
  const demoUser = getDemoUser();
  const effectiveUser = user ?? demoUser;
  const [location, navigate] = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      clearDemoUser();
      window.location.href = "/login";
    },
  });

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!isAuthenticated && !demoUser) {
    window.location.href = getLoginUrl();
    return null;
  }

  if (!effectiveUser) {
    window.location.href = "/login";
    return null;
  }

  const role = (effectiveUser.role ?? "user") as AppRole;
  const roleConfig = ROLE_CONFIG[role] ?? ROLE_CONFIG.user;
  const visibleTabs = ALL_TABS.filter((t) => t.roles.includes(role));

  // Redirect /dashboard root to first visible tab
  if ((location === "/dashboard" || location === "/dashboard/") && visibleTabs.length > 0) {
    navigate(visibleTabs[0].path, { replace: true });
    return null;
  }

  const activeTabId = ALL_TABS.find((t) => location.startsWith(t.path))?.id ?? "";

  const initials = (effectiveUser.name ?? effectiveUser.email ?? "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = () => {
    clearDemoUser();
    if (user) {
      logoutMutation.mutate();
    } else {
      window.location.href = "/login";
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-white/[0.06] bg-[#0d0d14] flex items-center px-4 gap-3 shrink-0 z-20 sticky top-0">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <BarChart3 size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-white tracking-tight hidden sm:block">
            Exec Dashboard
          </span>
        </Link>

        <div className="h-5 w-px bg-white/[0.08] shrink-0" />

        {/* Horizontal scrollable tab strip */}
        <nav className="flex-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex items-center gap-0.5 min-w-max h-14">
            {visibleTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <Link
                  key={tab.id}
                  href={tab.path}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
                    "transition-all duration-150 whitespace-nowrap select-none",
                    isActive
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                  )}
                >
                  <span className={isActive ? "text-violet-400" : "text-zinc-500"}>
                    {tab.icon}
                  </span>
                  {tab.label}
                  {/* Active underline */}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-violet-500 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Right: Duo status + role badge + profile */}
        <div className="flex items-center gap-2 shrink-0">
          <DuoStatusBadge />
          <span
            className={cn(
              "hidden sm:inline-flex items-center px-2 py-0.5 rounded-full",
              "text-[10px] font-semibold border",
              roleConfig.color
            )}
          >
            {roleConfig.label}
          </span>

          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {initials}
              </div>
              <span className="text-xs text-zinc-300 hidden md:block max-w-[120px] truncate">
                {effectiveUser.name ?? effectiveUser.email}
              </span>
              <ChevronDown
                size={11}
                className={cn("text-zinc-500 transition-transform duration-150", profileOpen && "rotate-180")}
              />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-[#15151e] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 py-1.5 z-50">
                <div className="px-3 py-2.5 border-b border-white/[0.06]">
                  <p className="text-xs font-semibold text-white truncate">
                    {effectiveUser.name ?? "User"}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {effectiveUser.email}
                  </p>
                  <span
                    className={cn(
                      "mt-2 inline-flex items-center px-1.5 py-0.5 rounded-full",
                      "text-[10px] font-semibold border",
                      roleConfig.color
                    )}
                  >
                    {roleConfig.label}
                  </span>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => setProfileOpen(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    <Users size={12} />
                    Profile &amp; MFA Settings
                  </button>
                </div>

                <div className="border-t border-white/[0.06] pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/[0.08] transition-colors"
                  >
                    <LogOut size={12} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Subtle gradient separator */}
      <div className="h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent shrink-0" />

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
