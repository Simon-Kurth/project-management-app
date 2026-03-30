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
  Anchor,
  Server,
  Building2,
  Layers,
  Headset,
  Briefcase,
  Users2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { NotificationBell } from "./NotificationBell";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppRole =
  | "user"
  | "admin"
  | "executive"
  | "company"
  | "qa"
  | "sales_marketing"
  | "csm";

interface SubTab {
  id: string;
  label: string;
  path: string;
  roles: AppRole[];
}

interface NavSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** If set, clicking the main tab navigates here directly (no sub-tabs shown) */
  path?: string;
  /** Sub-tabs shown in the secondary bar when this section is active */
  subTabs?: SubTab[];
  roles: AppRole[];
}

// ─── Navigation tree ─────────────────────────────────────────────────────────
// Structure:
//   Executive Summary  → /dashboard/executive-summary
//     ├ Financials     → /dashboard/financials
//     └ HR             → /dashboard/hr  (AI Adoption ranking)
//   Delivery           → /dashboard/delivery
//     ├ QA             → /dashboard/qa
//     └ Project Mgmt   → /dashboard/project-management  (stub)
//   Development        → /dashboard/development
//     ├ UCP            → /dashboard/ucp
//     ├ SSOC           → /dashboard/ssoc
//     └ Enterprise     → /dashboard/enterprise
//   IT/Ops             → /dashboard/it-ops
//     └ Prod Support   → /dashboard/prod-support
//   Sales              → /dashboard/sales
//     └ Marketing      → /dashboard/marketing
//   Settings           → /dashboard/settings  (users + prefs)

const ALL_SECTIONS: NavSection[] = [
  {
    id: "executive-summary",
    label: "Executive Summary",
    icon: <LayoutDashboard size={14} />,
    path: "/dashboard/executive-summary",
    roles: ["executive", "company", "admin"],
    subTabs: [
      {
        id: "financials",
        label: "Financials",
        path: "/dashboard/financials",
        roles: ["executive", "company", "admin"],
      },
      {
        id: "hr",
        label: "HR",
        path: "/dashboard/hr",
        roles: ["executive", "company", "admin"],
      },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    icon: <PackageCheck size={14} />,
    path: "/dashboard/delivery",
    roles: ["executive", "company", "admin"],
    subTabs: [
      {
        id: "qa",
        label: "QA",
        path: "/dashboard/qa",
        roles: ["executive", "company", "admin", "qa"],
      },
      {
        id: "project-management",
        label: "Project Management",
        path: "/dashboard/project-management",
        roles: ["executive", "company", "admin"],
      },
    ],
  },
  {
    id: "development",
    label: "Development",
    icon: <Cpu size={14} />,
    path: "/dashboard/development",
    roles: ["executive", "company", "admin"],
    subTabs: [
      {
        id: "ucp",
        label: "UCP",
        path: "/dashboard/ucp",
        roles: ["executive", "company", "admin"],
      },
      {
        id: "ssoc",
        label: "SSOC",
        path: "/dashboard/ssoc",
        roles: ["executive", "company", "admin"],
      },
      {
        id: "enterprise",
        label: "Enterprise",
        path: "/dashboard/enterprise",
        roles: ["executive", "company", "admin"],
      },
    ],
  },
  {
    id: "it-ops",
    label: "IT / Ops",
    icon: <Server size={14} />,
    path: "/dashboard/it-ops",
    roles: ["executive", "company", "admin"],
    subTabs: [
      {
        id: "prod-support",
        label: "Prod Support",
        path: "/dashboard/prod-support",
        roles: ["executive", "company", "admin"],
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: <TrendingUp size={14} />,
    path: "/dashboard/sales",
    roles: ["executive", "company", "admin", "sales_marketing"],
    subTabs: [
      {
        id: "marketing",
        label: "Marketing",
        path: "/dashboard/marketing",
        roles: ["executive", "company", "admin", "sales_marketing"],
      },
      {
        id: "csm",
        label: "CSM",
        path: "/dashboard/csm",
        roles: ["executive", "company", "admin", "csm"],
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: <Settings size={14} />,
    path: "/dashboard/settings",
    roles: ["executive", "company", "admin", "qa", "sales_marketing", "csm", "user"],
    subTabs: [
      {
        id: "users",
        label: "User Management",
        path: "/dashboard/users",
        roles: ["executive", "admin"],
      },
      {
        id: "notification-preferences",
        label: "Notifications",
        path: "/dashboard/notification-preferences",
        roles: ["executive", "company", "admin", "qa", "sales_marketing", "csm", "user"],
      },
    ],
  },
];

// ─── Role display config ──────────────────────────────────────────────────────

const ROLE_CONFIG: Record<AppRole, { label: string; color: string }> = {
  executive:       { label: "Executive",        color: "bg-[#134C93]/10 text-[#134C93] border-[#134C93]/25" },
  company:         { label: "Company",           color: "bg-[#018365]/10 text-[#018365] border-[#018365]/25" },
  admin:           { label: "Admin",             color: "bg-amber-100 text-amber-700 border-amber-200" },
  qa:              { label: "QA",                color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  sales_marketing: { label: "Sales & Marketing", color: "bg-orange-50 text-orange-700 border-orange-200" },
  csm:             { label: "CSM",               color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  user:            { label: "User",              color: "bg-gray-100 text-gray-600 border-gray-200" },
};

// ─── Duo Status Badge ─────────────────────────────────────────────────────────

function DuoStatusBadge() {
  const { data } = trpc.auth.duoStatus.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!data) return null;

  if (data.ok) {
    return (
      <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#018365]/10 border border-[#018365]/25 text-[10px] font-semibold text-[#018365]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#018365] animate-pulse" />
        Duo Active
      </span>
    );
  }

  return (
    <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-medium text-amber-600">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
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

  // Filter sections and sub-tabs by role
  const visibleSections = ALL_SECTIONS
    .filter((s) => s.roles.includes(role))
    .map((s) => ({
      ...s,
      subTabs: s.subTabs?.filter((st) => st.roles.includes(role)),
    }));

  // Redirect /dashboard root to first visible section's path.
  // Must be done in useEffect — calling navigate() during render triggers
  // "Cannot update a component while rendering a different component".
  const redirectTarget =
    (location === "/dashboard" || location === "/dashboard/") && visibleSections.length > 0
      ? (visibleSections[0].path ?? visibleSections[0].subTabs?.[0]?.path ?? "/login")
      : null;

  useEffect(() => {
    if (redirectTarget) navigate(redirectTarget, { replace: true });
  }, [redirectTarget]);

  if (redirectTarget) return null;

  // Determine active section — match by path prefix
  const allSubTabPaths = ALL_SECTIONS.flatMap((s) => s.subTabs?.map((st) => ({ ...st, sectionId: s.id })) ?? []);

  const activeSection = visibleSections.find((s) => {
    if (s.path && location.startsWith(s.path)) return true;
    return s.subTabs?.some((st) => location.startsWith(st.path));
  });

  // Active sub-tab within the current section
  const activeSubTabId = activeSection?.subTabs?.find((st) => location.startsWith(st.path))?.id ?? "";

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

  const hasSubTabs = (activeSection?.subTabs?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col">

      {/* ── Primary header ──────────────────────────────────────────────────── */}
      <header className="border-b border-[#E2E8F0] bg-white shrink-0 z-20 sticky top-0 shadow-sm">

        {/* Top row: logo + primary tabs + right controls */}
        <div className="h-14 flex items-center px-4 gap-3">

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 group">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663386324339/fQtBjMcGkJgQ5FrhBiqAWp/dataoceans_logo_11b1e43a.png"
              alt="DataOceans"
              className="h-6 w-auto object-contain"
            />
            <div className="h-4 w-px bg-[#E2E8F0] hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5">
              <Anchor size={13} className="text-[#018365]" />
              <span className="text-sm font-bold text-[#141A2B] tracking-tight">
                The Wheelhouse
              </span>
            </div>
          </Link>

          <div className="h-5 w-px bg-[#E2E8F0] shrink-0" />

          {/* Primary tab strip */}
          <nav className="flex-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <div className="flex items-end gap-0 min-w-max h-14">
              {visibleSections.map((section) => {
                const isActive = activeSection?.id === section.id;
                return (
                  <Link
                    key={section.id}
                    href={section.path ?? section.subTabs?.[0]?.path ?? "#"}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3.5 h-full",
                      "text-[0.8125rem] font-semibold transition-all duration-150 whitespace-nowrap select-none",
                      "border-b-2",
                      isActive
                        ? "text-[#134C93] border-[#134C93] bg-[#134C93]/[0.03]"
                        : "text-[#6E7791] border-transparent hover:text-[#134C93] hover:border-[#134C93]/30 hover:bg-[#F0F4F8]/60"
                    )}
                  >
                    <span className={cn(
                      "transition-colors",
                      isActive ? "text-[#134C93]" : "text-[#9BA3B8]"
                    )}>
                      {section.icon}
                    </span>
                    {section.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
            <DuoStatusBadge />

            <span className={cn(
              "hidden sm:inline-flex items-center px-2 py-0.5 rounded-full",
              "text-[10px] font-semibold border",
              roleConfig.color
            )}>
              {roleConfig.label}
            </span>

            {/* Profile dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[#F0F4F8] transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-[#134C93] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {initials}
                </div>
                <span className="text-xs text-[#141A2B] font-medium hidden md:block max-w-[120px] truncate">
                  {effectiveUser.name ?? effectiveUser.email}
                </span>
                <ChevronDown
                  size={11}
                  className={cn("text-[#6E7791] transition-transform duration-150", profileOpen && "rotate-180")}
                />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-[#E2E8F0] rounded-xl shadow-lg shadow-[#141A2B]/10 py-1.5 z-50">
                  <div className="px-3 py-2.5 border-b border-[#E2E8F0]">
                    <p className="text-xs font-semibold text-[#141A2B] truncate">
                      {effectiveUser.name ?? "User"}
                    </p>
                    <p className="text-[11px] text-[#6E7791] truncate mt-0.5">
                      {effectiveUser.email}
                    </p>
                    <span className={cn(
                      "mt-2 inline-flex items-center px-1.5 py-0.5 rounded-full",
                      "text-[10px] font-semibold border",
                      roleConfig.color
                    )}>
                      {roleConfig.label}
                    </span>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => setProfileOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-[#6E7791] hover:text-[#141A2B] hover:bg-[#F0F4F8] transition-colors"
                    >
                      <Users size={12} />
                      Profile &amp; MFA Settings
                    </button>
                  </div>

                  <div className="border-t border-[#E2E8F0] pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={12} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Secondary sub-tab bar (only when active section has sub-tabs) ── */}
        {hasSubTabs && (
          <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-4">
            <nav className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              <div className="flex items-center gap-0 min-w-max h-9">
                {/* "Overview" pill — links back to the section root */}
                {activeSection?.path && (
                  <Link
                    href={activeSection.path}
                    className={cn(
                      "flex items-center gap-1 px-3 h-full text-[0.75rem] font-medium transition-all whitespace-nowrap select-none",
                      "border-b-2",
                      !activeSubTabId
                        ? "text-[#134C93] border-[#134C93]"
                        : "text-[#6E7791] border-transparent hover:text-[#134C93] hover:border-[#134C93]/30"
                    )}
                  >
                    Overview
                  </Link>
                )}

                {activeSection?.subTabs?.map((sub) => {
                  const isActive = sub.id === activeSubTabId;
                  return (
                    <Link
                      key={sub.id}
                      href={sub.path}
                      className={cn(
                        "flex items-center gap-1 px-3 h-full text-[0.75rem] font-medium transition-all whitespace-nowrap select-none",
                        "border-b-2",
                        isActive
                          ? "text-[#134C93] border-[#134C93]"
                          : "text-[#6E7791] border-transparent hover:text-[#134C93] hover:border-[#134C93]/30"
                      )}
                    >
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        )}

        {/* Blue accent rule */}
        <div className="h-0.5 bg-gradient-to-r from-[#134C93] via-[#018365] to-[#134C93]" />
      </header>

      {/* ── Page content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2E8F0] bg-white px-6 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663386324339/fQtBjMcGkJgQ5FrhBiqAWp/dataoceans_logo_11b1e43a.png"
            alt="DataOceans"
            className="h-4 w-auto object-contain opacity-60"
          />
          <span className="text-[10px] text-[#6E7791]">The Wheelhouse</span>
        </div>
        <span className="text-[10px] text-[#6E7791]">
          © {new Date().getFullYear()} DataOceans · Internal Use Only
        </span>
      </footer>
    </div>
  );
}
