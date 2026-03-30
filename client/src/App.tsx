import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { getDemoUser } from "./lib/authStore";
import DashboardLayout from "./components/DashboardLayout";
import LoginPage from "./pages/LoginPage";
import MfaPage from "./pages/MfaPage";
import DuoCallbackPage from "./pages/DuoCallbackPage";

// ── Tab pages ─────────────────────────────────────────────────────────────────
import ExecutiveSummaryTab from "./pages/tabs/ExecutiveSummaryTab";
import FinancialsTab from "./pages/tabs/FinancialsTab";
import DeliveryTab from "./pages/tabs/DeliveryTab";
import QATab from "./pages/tabs/QATab";
import ProjectManagementTab from "./pages/tabs/ProjectManagementTab";
import DevelopmentTab from "./pages/tabs/DevelopmentTab";
import UCPTab from "./pages/tabs/UCPTab";
import SSOCTab from "./pages/tabs/SSOCTab";
import EnterpriseTab from "./pages/tabs/EnterpriseTab";
import ITOpsTab from "./pages/tabs/ITOpsTab";
import ProdSupportTab from "./pages/tabs/ProdSupportTab";
import SalesTab from "./pages/tabs/SalesTab";
import MarketingTab from "./pages/tabs/MarketingTab";
import CSMTab from "./pages/tabs/CSMTab";
import SettingsTab from "./pages/tabs/SettingsTab";
import UserManagementTab from "./pages/tabs/UserManagementTab";
import NotificationPreferencesPage from "./pages/NotificationPreferencesPage";
import NotFound from "./pages/NotFound";

// ─── RBAC access map ──────────────────────────────────────────────────────────

type AppRole = "user" | "admin" | "executive" | "company" | "qa" | "sales_marketing" | "csm";

const TAB_ACCESS: Record<string, AppRole[]> = {
  // Executive Summary section
  "executive-summary":   ["executive", "company", "admin"],
  "financials":          ["executive", "company", "admin"],
  // Delivery section
  "delivery":            ["executive", "company", "admin"],
  "qa":                  ["executive", "company", "admin", "qa"],
  "project-management":  ["executive", "company", "admin"],
  // Development section
  "development":         ["executive", "company", "admin"],
  "ucp":                 ["executive", "company", "admin"],
  "ssoc":                ["executive", "company", "admin"],
  "enterprise":          ["executive", "company", "admin"],
  // IT/Ops section
  "it-ops":              ["executive", "company", "admin"],
  "prod-support":        ["executive", "company", "admin"],
  // Sales section
  "sales":               ["executive", "company", "admin", "sales_marketing"],
  "marketing":           ["executive", "company", "admin", "sales_marketing"],
  "csm":                 ["executive", "company", "admin", "csm"],
  // Settings section
  "settings":            ["executive", "company", "admin", "qa", "sales_marketing", "csm", "user"],
  "users":               ["executive", "admin"],
  "notification-preferences": ["executive", "company", "admin", "qa", "sales_marketing", "csm", "user"],
};

// ─── RBAC Route Guard ─────────────────────────────────────────────────────────

function ProtectedRoute({
  children,
  tab,
}: {
  children: React.ReactNode;
  tab?: string;
}) {
  const { user, loading, isAuthenticated } = useAuth();
  const demoUser = getDemoUser();
  const effectiveUser = user ?? demoUser;
  const effectiveAuth = isAuthenticated || !!demoUser;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!effectiveAuth) {
    return <Redirect to="/login" />;
  }

  if (tab && effectiveUser) {
    const allowedRoles = TAB_ACCESS[tab] ?? [];
    const userRole = (effectiveUser.role ?? "user") as AppRole;
    if (!allowedRoles.includes(userRole)) {
      const firstAllowed = Object.entries(TAB_ACCESS).find(([, roles]) =>
        roles.includes(userRole)
      );
      return <Redirect to={firstAllowed ? `/dashboard/${firstAllowed[0]}` : "/login"} />;
    }
  }

  return <>{children}</>;
}

// ─── Router ───────────────────────────────────────────────────────────────────

function Router() {
  const { isAuthenticated } = useAuth();
  const demoUser = getDemoUser();
  const effectiveAuth = isAuthenticated || !!demoUser;

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/mfa" component={MfaPage} />
      <Route path="/duo-callback" component={DuoCallbackPage} />

      {/* /dashboard root — DashboardLayout handles redirect to first allowed tab */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <DashboardLayout><ExecutiveSummaryTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Executive Summary section ─────────────────────────────────────── */}
      <Route path="/dashboard/executive-summary">
        <ProtectedRoute tab="executive-summary">
          <DashboardLayout><ExecutiveSummaryTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/financials">
        <ProtectedRoute tab="financials">
          <DashboardLayout><FinancialsTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Delivery section ──────────────────────────────────────────────── */}
      <Route path="/dashboard/delivery">
        <ProtectedRoute tab="delivery">
          <DashboardLayout><DeliveryTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/qa">
        <ProtectedRoute tab="qa">
          <DashboardLayout><QATab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/project-management">
        <ProtectedRoute tab="project-management">
          <DashboardLayout><ProjectManagementTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Development section ───────────────────────────────────────────── */}
      <Route path="/dashboard/development">
        <ProtectedRoute tab="development">
          <DashboardLayout><DevelopmentTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/ucp">
        <ProtectedRoute tab="ucp">
          <DashboardLayout><UCPTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/ssoc">
        <ProtectedRoute tab="ssoc">
          <DashboardLayout><SSOCTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/enterprise">
        <ProtectedRoute tab="enterprise">
          <DashboardLayout><EnterpriseTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── IT/Ops section ────────────────────────────────────────────────── */}
      <Route path="/dashboard/it-ops">
        <ProtectedRoute tab="it-ops">
          <DashboardLayout><ITOpsTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/prod-support">
        <ProtectedRoute tab="prod-support">
          <DashboardLayout><ProdSupportTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Sales section ─────────────────────────────────────────────────── */}
      <Route path="/dashboard/sales">
        <ProtectedRoute tab="sales">
          <DashboardLayout><SalesTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/marketing">
        <ProtectedRoute tab="marketing">
          <DashboardLayout><MarketingTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/csm">
        <ProtectedRoute tab="csm">
          <DashboardLayout><CSMTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Settings section ──────────────────────────────────────────────── */}
      <Route path="/dashboard/settings">
        <ProtectedRoute tab="settings">
          <DashboardLayout><SettingsTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/users">
        <ProtectedRoute tab="users">
          <DashboardLayout><UserManagementTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/notification-preferences">
        <ProtectedRoute tab="notification-preferences">
          <DashboardLayout><NotificationPreferencesPage /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* ── Root redirect ─────────────────────────────────────────────────── */}
      <Route path="/">
        {effectiveAuth ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
