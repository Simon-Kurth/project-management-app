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

import ProjectManagementTab from "./pages/tabs/ProjectManagementTab";
import SettingsTab from "./pages/tabs/SettingsTab";
import UserManagementTab from "./pages/tabs/UserManagementTab";
import NotificationPreferencesPage from "./pages/NotificationPreferencesPage";
import NotFound from "./pages/NotFound";

// ─── RBAC access map ──────────────────────────────────────────────────────────

type AppRole = "user" | "admin" | "executive" | "company";

const TAB_ACCESS: Record<string, AppRole[]> = {
  "project-management":         ["executive", "company", "admin"],
  "settings":                   ["executive", "company", "admin", "user"],
  "users":                      ["executive", "admin"],
  "notification-preferences":   ["executive", "company", "admin", "user"],
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
        return <Redirect to="/dashboard/project-management" />;
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

      <Route path="/dashboard">
        <ProtectedRoute>
          <DashboardLayout><ProjectManagementTab /></DashboardLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/project-management">
        <ProtectedRoute tab="project-management">
          <DashboardLayout><ProjectManagementTab /></DashboardLayout>
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

      <Route path="/">
        {effectiveAuth ? <Redirect to="/dashboard/project-management" /> : <Redirect to="/login" />}
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
