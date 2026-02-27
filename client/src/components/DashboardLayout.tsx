import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  CheckSquare,
  Code2,
  DollarSign,
  HeadphonesIcon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  PanelLeft,
  Server,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { getDemoUser, clearDemoUser } from "@/lib/authStore";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ─── Navigation Config ────────────────────────────────────────────────────────

const EXECUTIVE_TABS = [
  { icon: LayoutDashboard, label: "Executive Summary", path: "/dashboard" },
  { icon: DollarSign, label: "Financials", path: "/dashboard/financials" },
  { icon: Truck, label: "Delivery", path: "/dashboard/delivery" },
  { icon: Code2, label: "Development", path: "/dashboard/development" },
  { icon: Server, label: "IT / Ops", path: "/dashboard/itops" },
];

const COMPANY_TABS = [
  { icon: CheckSquare, label: "QA", path: "/dashboard/qa" },
  { icon: HeadphonesIcon, label: "CSM", path: "/dashboard/csm" },
  { icon: BriefcaseBusiness, label: "Sales", path: "/dashboard/sales" },
  { icon: Megaphone, label: "Marketing", path: "/dashboard/marketing" },
];

const COMPANY_ROLES = ["company", "admin"];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 320;

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { label: string; className: string }> = {
    executive: { label: "Executive", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    company: { label: "Company", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
    admin: { label: "Admin", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    user: { label: "User", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  };
  const c = config[role] ?? config.user;
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider", c.className)}>
      {c.label}
    </span>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const demoUser = getDemoUser();
  const effectiveUser = user ?? demoUser;

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!effectiveUser) {
    window.location.href = "/login";
    return null;
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

// ─── Layout Content ───────────────────────────────────────────────────────────

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const logoutMutation = trpc.auth.logout.useMutation();

  const demoUser = getDemoUser();
  const effectiveUser = user ?? demoUser;
  const role = effectiveUser?.role ?? "user";
  const isCompany = COMPANY_ROLES.includes(role);

  const activeTab = [...EXECUTIVE_TABS, ...COMPANY_TABS].find((t) => t.path === location);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const handleLogout = async () => {
    clearDemoUser();
    if (user) {
      await logoutMutation.mutateAsync();
    }
    window.location.href = "/login";
  };

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar" disableTransition={isResizing}>
          {/* Header */}
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-2">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="font-semibold text-sm text-sidebar-foreground truncate">Exec Dashboard</span>
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* Navigation */}
          <SidebarContent className="gap-0 py-3">
            {/* Executive tabs */}
            {!isCollapsed && (
              <p className="px-4 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Executive
              </p>
            )}
            <SidebarMenu className="px-2">
              {EXECUTIVE_TABS.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={cn("h-9 transition-all font-normal text-sm", isActive && "bg-primary/15 text-primary")}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {/* Company-only tabs */}
            {isCompany && (
              <>
                {!isCollapsed && (
                  <p className="px-4 mt-4 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Company
                  </p>
                )}
                <SidebarMenu className="px-2">
                  {COMPANY_TABS.map((item) => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className={cn("h-9 transition-all font-normal text-sm", isActive && "bg-primary/15 text-primary")}
                        >
                          <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </>
            )}
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none">
                  <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-semibold bg-primary/20 text-primary">
                      {(effectiveUser?.name ?? "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-sidebar-foreground truncate leading-none">
                        {effectiveUser?.name ?? "User"}
                      </p>
                      <div className="mt-1">
                        <RoleBadge role={role} />
                      </div>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-popover border-border">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{effectiveUser?.name ?? "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">{effectiveUser?.email ?? ""}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs text-muted-foreground" disabled>
                  <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                  <span>MFA: {(effectiveUser as any)?.mfaEnabled ? "Enabled" : "Disabled"}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 transition-colors"
            onMouseDown={() => setIsResizing(true)}
            style={{ zIndex: 50 }}
          />
        )}
      </div>

      <SidebarInset className="bg-background">
        {isMobile && (
          <div className="flex border-b border-border h-14 items-center justify-between bg-background/95 px-3 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <span className="text-sm font-medium text-foreground">{activeTab?.label ?? "Dashboard"}</span>
            </div>
          </div>
        )}
        <main className="flex-1 p-5 min-h-screen">{children}</main>
      </SidebarInset>
    </>
  );
}
