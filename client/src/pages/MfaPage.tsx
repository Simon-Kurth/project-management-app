import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getPendingMfaUserId, clearPendingMfaUserId, setDemoUser } from "@/lib/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BarChart3, ShieldCheck } from "lucide-react";

export default function MfaPage() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const verifyMutation = trpc.auth.verifyMfaLogin.useMutation({
    onSuccess: (data) => {
      if (data.user) {
        clearPendingMfaUserId();
        setDemoUser(data.user);
        navigate("/dashboard");
        window.location.reload();
      }
    },
    onError: (err) => {
      toast.error(err.message || "Invalid code");
      setLoading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const userId = getPendingMfaUserId();
    if (!userId) {
      toast.error("Session expired. Please log in again.");
      navigate("/login");
      return;
    }
    if (code.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }
    setLoading(true);
    verifyMutation.mutate({ userId, code });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Executive Dashboard</h1>
            <p className="text-xs text-muted-foreground">Two-factor authentication</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Verify your identity</h2>
              <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-[0.5em] font-mono bg-muted/50 border-border text-foreground placeholder:text-muted-foreground h-14"
              autoFocus
            />

            <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </span>
              ) : (
                "Verify"
              )}
            </Button>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
