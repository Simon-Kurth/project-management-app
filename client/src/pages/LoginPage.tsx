import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Anchor, Lock, Mail, Shield } from "lucide-react";
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
      if (data.requiresDuo && data.duoAuthUrl) {
        window.location.href = data.duoAuthUrl;
      } else if (data.user) {
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

  const demoUsers = [
    { label: "Executive",        desc: "All 9 tabs",           email: "executive@demo.com",      password: "Executive@2024!" },
    { label: "QA",               desc: "QA tab only",          email: "qa@demo.com",             password: "QA@2024!" },
    { label: "Sales & Marketing",desc: "Sales + Marketing",    email: "salesmarketing@demo.com", password: "SalesMarketing@2024!" },
    { label: "CSM",              desc: "CSM tab only",         email: "csm@demo.com",            password: "CSM@2024!" },
  ];

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
              "Role-based access control across 9 departments",
              "Duo Security MFA on every login",
              "Live data from Jira, GitHub, and Salesforce",
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
                {" · "}
                <span className="text-[#018365] font-semibold">Protected by Duo MFA</span>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    Redirecting to Duo…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Sign in with Duo MFA
                  </span>
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-[#E2E8F0]" />
              <span className="text-xs text-[#6E7791]">or</span>
              <div className="flex-1 h-px bg-[#E2E8F0]" />
            </div>

            {/* SSO Login */}
            <a href={getLoginUrl()} className="block">
              <Button
                variant="outline"
                className="w-full border-[#E2E8F0] text-[#141A2B] bg-white hover:bg-[#F0F4F8] font-medium"
              >
                <Shield className="w-4 h-4 mr-2 text-[#134C93]" />
                Sign in with Manus SSO
              </Button>
            </a>

            {/* Demo credentials */}
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
                    onClick={() => { setEmail(u.email); setPassword(u.password); }}
                    className="text-left p-2.5 rounded-lg bg-white border border-[#E2E8F0] hover:border-[#134C93]/40 hover:bg-[#F0F4F8] transition-all"
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
            Two-factor authentication powered by{" "}
            <span className="text-[#018365] font-semibold">Duo Security</span>
          </p>
        </div>
      </div>
    </div>
  );
}
