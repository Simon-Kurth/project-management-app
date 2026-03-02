/**
 * DuoCallbackPage — /duo-callback
 *
 * Duo Universal Prompt redirects back here after the user completes 2FA:
 *   /duo-callback?state=<state>&duo_code=<code>
 *
 * This page:
 *  1. Reads `state` and `duo_code` from the URL query string
 *  2. Calls trpc.auth.duoCallback to validate the state, exchange the code, and set the session cookie
 *  3. On success, invalidates the auth cache and navigates to /dashboard
 *  4. On failure, shows an error and redirects to /login
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BarChart3, ShieldCheck, ShieldX } from "lucide-react";
import { useState } from "react";

export default function DuoCallbackPage() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState("");
  const called = useRef(false);

  const utils = trpc.useUtils();
  const callbackMutation = trpc.auth.duoCallback.useMutation({
    onSuccess: async () => {
      setStatus("success");
      await utils.auth.me.invalidate();
      setTimeout(() => navigate("/dashboard"), 800);
    },
    onError: (err) => {
      setStatus("error");
      setErrorMsg(err.message || "Duo verification failed. Please try again.");
      toast.error(err.message || "Duo verification failed");
      setTimeout(() => navigate("/login"), 3000);
    },
  });

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const state = params.get("state");
    const duoCode = params.get("duo_code");

    if (!state || !duoCode) {
      setStatus("error");
      setErrorMsg("Missing Duo callback parameters. Please log in again.");
      setTimeout(() => navigate("/login"), 3000);
      return;
    }

    callbackMutation.mutate({ state, duoCode });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            <p className="text-xs text-muted-foreground">Completing authentication…</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl space-y-5">
          {status === "processing" && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8 text-violet-400 animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Verifying Duo authentication…</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Completing your two-factor authentication. This will only take a moment.
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
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Authentication successful</h2>
                <p className="text-sm text-muted-foreground mt-2">Redirecting to your dashboard…</p>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto">
                <ShieldX className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Authentication failed</h2>
                <p className="text-sm text-muted-foreground mt-2">{errorMsg}</p>
                <p className="text-xs text-muted-foreground mt-3">Redirecting to login…</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
