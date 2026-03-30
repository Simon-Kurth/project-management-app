import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle, Anchor, Lock, Mail, Shield } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

// Microsoft logo SVG (official brand colours)
function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Read error from query string (set by Entra/Duo callback on failure)
  useEffect(() => {
    const params = new URLSearchParams(search);
    const err = params.get("error");
    if (err) {
      setErrorMsg(decodeURIComponent(err));
    }
  }, [search]);

  // Query whether Entra SSO is configured on this server
  const { data: entraStatus } = trpc.auth.entraStatus.useQuery(undefined, {
    staleTime: Infinity, // config doesn't change at runtime
  });

  const utils = trpc.useUtils();
  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: async (data) => {
      if (data.requiresDuo && data.duoAuthUrl) {
        window.location.href = data.duoAuthUrl;
      } else {
        // Session cookie is set by the server — invalidate auth cache and navigate
        await utils.auth.me.invalidate();
        navigate("/dashboard");
      }
    },
    onSettled: () => {
      setLoading(false);
    },
    onError: (err) => {
      setLoading(false);
      // Detect database connectivity errors and show a clear admin-facing message
      const isDbError =
        err.message?.includes("database is not reachable") ||
        err.message?.includes("Failed to connect") ||
        err.message?.includes("Could not connect") ||
        err.data?.code === "SERVICE_UNAVAILABLE";
      if (isDbError) {
        setErrorMsg(
          "The application database is not reachable. Please ensure DATABASE_URL is configured and the SQL Server instance is running."
        );
      } else {
        setErrorMsg(err.message || "Invalid credentials");
      }
    },
  });

  if (isAuthenticated) {
    navigate("/dashboard");
    return null;
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    loginMutation.mutate({ email, password });
  };

  const handleDemoLogin = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setLoading(true);
    setErrorMsg(null);
    loginMutation.mutate({ email: demoEmail, password: demoPassword });
  };

  const handleEntraLogin = () => {
    if (!entraStatus?.loginUrl) return;
    setSsoLoading(true);
    // Full-page redirect to the Entra login endpoint
    window.location.href = entraStatus.loginUrl;
  };

  const demoUsers = [
    { label: "Executive",         desc: "All 9 tabs",        email: "executive@demo.com",      password: "Executive@2024!" },
    { label: "QA",                desc: "QA tab only",       email: "qa@demo.com",             password: "QA@2024!" },
    { label: "Sales & Marketing", desc: "Sales + Marketing", email: "salesmarketing@demo.com", password: "SalesMarketing@2024!" },
    { label: "CSM",               desc: "CSM tab only",      email: "csm@demo.com",            password: "CSM@2024!" },
  ];

  const entraConfigured = entraStatus?.configured ?? false;

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — Data Oceans navy gradient ──────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12"
        style={{
          background: "linear-gradient(145deg, #141A2B 0%, #1a2a50 55%, #0f3060 100%)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663386324339/fQtBjMcGkJgQ5FrhBiqAWp/dataoceans_logo_11b1e43a.png"
            alt="DataOceans"
            className="h-8 w-auto object-contain brightness-0 invert opacity-90"
          />
        </div>

        {/* Hero text */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Anchor className="text-[#018365]" size={22} />
            <span className="text-[#018365] font-bold text-lg tracking-tight">The Wheelhouse</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Enterprise Intelligence,<br />
            <span className="text-[#018365]">at a glance.</span>
          </h1>
          <p className="text-[#8fa0be] text-base leading-relaxed max-w-sm">
            Real-time KPIs, department health, and operational metrics — unified in one secure executive dashboard.
          </p>

          {/* Feature list */}
          <div className="mt-8 space-y-3">
            {[
              "Microsoft Entra ID SSO with corporate credentials",
              "Duo Security MFA (when configured)",
              "Role-based access control across 9 departments",
              "Audit logging for every action",
            ].map((f) => (
              <div key={f} className="flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-[#018365]/20 border border-[#018365]/40 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#018365]" />
                </div>
                <span className="text-[#8fa0be] text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-[#4a5a78] text-xs">
          © {new Date().getFullYear()} DataOceans · Internal Use Only
        </p>
      </div>

      {/* ── Right panel — login form ─────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-[#F0F4F8] p-6">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663386324339/fQtBjMcGkJgQ5FrhBiqAWp/dataoceans_logo_11b1e43a.png"
              alt="DataOceans"
              className="h-7 w-auto object-contain"
            />
            <div className="h-4 w-px bg-[#E2E8F0]" />
            <div className="flex items-center gap-1.5">
              <Anchor size={14} className="text-[#018365]" />
              <span className="font-bold text-[#141A2B] text-sm">The Wheelhouse</span>
            </div>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-lg shadow-[#141A2B]/10 border border-[#E2E8F0] p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-[#141A2B]">Sign in</h2>
              <p className="text-sm text-[#6E7791] mt-1">
                Access your dashboard securely
                {entraConfigured ? (
                  <>
                    {" · "}
                    <span className="text-[#018365] font-semibold">Microsoft SSO + Duo MFA</span>
                  </>
                ) : null}
              </p>
            </div>

            {/* Error banner (from Entra/Duo callback) */}
            {errorMsg && (
              <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{errorMsg}</p>
              </div>
            )}

            {/* ── Primary: Microsoft Entra SSO button (when configured) ──────── */}
            {entraConfigured && (
              <>
                <Button
                  type="button"
                  onClick={handleEntraLogin}
                  disabled={ssoLoading}
                  className="w-full bg-[#0078D4] hover:bg-[#006CBE] text-white font-semibold rounded-lg h-11 transition-colors flex items-center justify-center gap-2.5"
                >
                  {ssoLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Redirecting to Microsoft…
                    </>
                  ) : (
                    <>
                      <MicrosoftLogo />
                      Sign in with Microsoft
                    </>
                  )}
                </Button>

                <p className="text-center text-[11px] text-[#6E7791] mt-2">
                  Uses your <strong>corporate Microsoft account</strong> · Duo MFA required
                </p>

                {/* Divider before fallback */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-[#E2E8F0]" />
                  <span className="text-xs text-[#6E7791]">or use demo credentials</span>
                  <div className="flex-1 h-px bg-[#E2E8F0]" />
                </div>
              </>
            )}

            {/* ── Password form (always shown for demo users; primary when Entra not configured) */}
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {!entraConfigured && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Microsoft Entra SSO is not yet configured. Using password login for demo access.
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-semibold text-[#141A2B]">
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6E7791]" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@dataoceans.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 border-[#E2E8F0] bg-[#F8FAFC] text-[#141A2B] placeholder:text-[#6E7791] focus:border-[#134C93] focus:ring-[#134C93]/20"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-semibold text-[#141A2B]">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6E7791]" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 border-[#E2E8F0] bg-[#F8FAFC] text-[#141A2B] placeholder:text-[#6E7791] focus:border-[#134C93] focus:ring-[#134C93]/20"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#134C93] hover:bg-[#0f3d7a] text-white font-semibold rounded-lg h-10 transition-colors"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Sign in
                  </span>
                )}
              </Button>
            </form>

            {/* Divider before Manus SSO */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-[#E2E8F0]" />
              <span className="text-xs text-[#6E7791]">or</span>
              <div className="flex-1 h-px bg-[#E2E8F0]" />
            </div>

            {/* Manus SSO (platform login) */}
            <a href={getLoginUrl()} className="block">
              <Button
                variant="outline"
                className="w-full border-[#E2E8F0] text-[#141A2B] bg-white hover:bg-[#F0F4F8] font-medium"
              >
                <Shield className="w-4 h-4 mr-2 text-[#134C93]" />
                Sign in with Manus SSO
              </Button>
            </a>

            {/* Demo credentials quick-fill */}
            <div className="mt-6 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <p className="text-[10px] font-bold text-[#6E7791] uppercase tracking-widest mb-3">
                Demo Credentials
                <span className="ml-2 normal-case font-normal text-amber-500">(Duo bypassed in dev mode)</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {demoUsers.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin(u.email, u.password)}
                    className="text-left p-2.5 rounded-lg bg-white border border-[#E2E8F0] hover:border-[#134C93]/40 hover:bg-[#F0F4F8] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <p className="text-xs font-semibold text-[#141A2B]">{u.label}</p>
                    <p className="text-[11px] text-[#6E7791]">{u.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-[11px] text-[#6E7791] mt-5">
            {entraConfigured ? (
              <>
                Microsoft Entra ID SSO · Second factor by{" "}
                <span className="text-[#018365] font-semibold">Duo Security</span>
              </>
            ) : (
              <>Internal use only · Demo mode active</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
