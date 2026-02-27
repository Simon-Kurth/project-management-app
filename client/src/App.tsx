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
import ExecutiveSummaryTab from "./pages/tabs/ExecutiveSummaryTab";
import FinancialsTab from "./pages/tabs/FinancialsTab";
import DeliveryTab from "./pages/tabs/DeliveryTab";
import DevelopmentTab from "./pages/tabs/DevelopmentTab";
import ITOpsTab from "./pages/tabs/ITOpsTab";
import QATab from "./pages/tabs/QATab";
import CSMTab from "./pages/tabs/CSMTab";
import SalesTab from "./pages/tabs/SalesTab";
import MarketingTab from "./pages/tabs/MarketingTab";
import NotFound from "./pages/NotFound";

// ─── RBAC access map (mirrors server/routers.ts TAB_ACCESS) ──────────────────

type AppRole = "user" | "admin" | "executive" | "company" | "qa" | "sales_marketing" | "csm";

const TAB_ACCESS: Record<string, AppRole[]> = {
  "executive-summary": ["executive", "company", "admin"],
  "financials":        ["executive", "company", "admin"],
  "delivery":          ["executive", "company", "admin"],
  "development":       ["executive", "company", "admin"],
  "it-ops":            ["executive", "company", "admin"],
  "qa":                ["executive", "company", "admin", "qa"],
  "csm":               ["executive", "company", "admin", "csm"],
  "sales":             ["executive", "company", "admin", "sales_marketing"],
  "marketing":         ["executive", "company", "admin", "sales_marketing"],
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

  // Check tab-level RBAC
  if (tab && effectiveUser) {
    const allowedRoles = TAB_ACCESS[tab] ?? [];
    const userRole = (effectiveUser.role ?? "user") as AppRole;
    if (!allowedRoles.includes(userRole)) {
      // Redirect to the user's first allowed tab
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

      {/* /dashboard root — DashboardLayout handles redirect to first allowed tab */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <DashboardLayout>
            <ExecutiveSummaryTab />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

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

      <Route path="/dashboard/delivery">
        <ProtectedRoute tab="delivery">
          <DashboardLayout><DeliveryTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/development">
        <ProtectedRoute tab="development">
          <DashboardLayout><DevelopmentTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/it-ops">
        <ProtectedRoute tab="it-ops">
          <DashboardLayout><ITOpsTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/qa">
        <ProtectedRoute tab="qa">
          <DashboardLayout><QATab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/csm">
        <ProtectedRoute tab="csm">
          <DashboardLayout><CSMTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

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
