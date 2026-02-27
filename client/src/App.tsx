import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
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

// ─── RBAC Route Guard ─────────────────────────────────────────────────────────

function ProtectedRoute({
  children,
  requiredRoles,
}: {
  children: React.ReactNode;
  requiredRoles?: string[];
}) {
  const { user, loading, isAuthenticated } = useAuth();
  const demoUser = getDemoUser();
  const effectiveUser = user ?? demoUser;
  const effectiveAuth = isAuthenticated || !!demoUser;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!effectiveAuth) {
    return <Redirect to="/login" />;
  }

  if (requiredRoles && effectiveUser && !requiredRoles.includes(effectiveUser.role ?? "")) {
    return <Redirect to="/dashboard" />;
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

      <Route path="/dashboard">
        <ProtectedRoute>
          <DashboardLayout>
            <ExecutiveSummaryTab />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/financials">
        <ProtectedRoute requiredRoles={["executive", "company", "admin"]}>
          <DashboardLayout>
            <FinancialsTab />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/delivery">
        <ProtectedRoute requiredRoles={["executive", "company", "admin"]}>
          <DashboardLayout>
            <DeliveryTab />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/development">
        <ProtectedRoute requiredRoles={["executive", "company", "admin"]}>
          <DashboardLayout>
            <DevelopmentTab />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/itops">
        <ProtectedRoute requiredRoles={["executive", "company", "admin"]}>
          <DashboardLayout>
            <ITOpsTab />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* Company-only tabs */}
      <Route path="/dashboard/qa">
        <ProtectedRoute requiredRoles={["company", "admin"]}>
          <DashboardLayout>
            <QATab />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/csm">
        <ProtectedRoute requiredRoles={["company", "admin"]}>
          <DashboardLayout>
            <CSMTab />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/sales">
        <ProtectedRoute requiredRoles={["company", "admin"]}>
          <DashboardLayout>
            <SalesTab />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/marketing">
        <ProtectedRoute requiredRoles={["company", "admin"]}>
          <DashboardLayout>
            <MarketingTab />
          </DashboardLayout>
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
