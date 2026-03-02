/**
 * MfaPage — shown briefly while the browser is being redirected to Duo.
 * The actual Duo callback is handled by DuoCallbackPage at /duo-callback.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { BarChart3, Shield } from "lucide-react";

export default function MfaPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    // If someone lands here without a Duo redirect in progress, send back to login
    const timer = setTimeout(() => navigate("/login"), 4000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold text-foreground">Executive Dashboard</h1>
            <p className="text-xs text-muted-foreground">Two-factor authentication</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-violet-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Redirecting to Duo Security…</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Complete two-factor authentication in the Duo prompt. You will be returned here automatically.
            </p>
          </div>
          <div className="flex justify-center gap-1.5 pt-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-violet-500/60 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Nothing happening?{" "}
            <a href="/login" className="text-primary underline">Return to sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
