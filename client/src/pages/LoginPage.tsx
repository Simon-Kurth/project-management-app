import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { setDemoUser, setPendingMfaUserId } from "@/lib/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BarChart3, Lock, Mail, Shield } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const utils = trpc.useUtils();
  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: async (data) => {
      if (data.requiresMfa) {
        setPendingMfaUserId(data.userId);
        navigate("/mfa");
      } else if (data.user) {
        // Session cookie is now set by the server — invalidate auth cache and navigate
        await utils.auth.me.invalidate();
        navigate("/dashboard");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Invalid credentials");
      setLoading(false);
    },
  });

  if (isAuthenticated) {
    navigate("/dashboard");
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Executive Dashboard</h1>
            <p className="text-xs text-muted-foreground">Enterprise Intelligence Platform</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Sign in</h2>
            <p className="text-sm text-muted-foreground mt-1">Access your dashboard securely</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-foreground">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-foreground">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* SSO Login */}
          <a href={getLoginUrl()} className="block">
            <Button variant="outline" className="w-full bg-transparent border-border text-foreground hover:bg-accent">
              <Shield className="w-4 h-4 mr-2" />
              Sign in with Manus SSO
            </Button>
          </a>

          {/* Demo credentials */}
          <div className="mt-6 p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Demo Credentials</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => { setEmail("executive@demo.com"); setPassword("Executive@2024!"); }}
                className="w-full text-left p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <p className="text-xs font-medium text-foreground">Executive Role</p>
                <p className="text-xs text-muted-foreground">executive@demo.com — 5 tabs</p>
              </button>
              <button
                type="button"
                onClick={() => { setEmail("company@demo.com"); setPassword("Company@2024!"); }}
                className="w-full text-left p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <p className="text-xs font-medium text-foreground">Company Role</p>
                <p className="text-xs text-muted-foreground">company@demo.com — all 9 tabs</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
