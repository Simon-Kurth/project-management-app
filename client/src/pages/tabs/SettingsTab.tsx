import { Settings, Users, Bell } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getDemoUser } from "@/lib/authStore";

type AppRole = "user" | "admin" | "executive" | "company" | "qa" | "sales_marketing" | "csm";

export default function SettingsTab() {
  const { user } = useAuth();
  const demoUser = getDemoUser();
  const effectiveUser = user ?? demoUser;
  const role = (effectiveUser?.role ?? "user") as AppRole;
  const isAdmin = role === "admin" || role === "executive";

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#134C93]/10 flex items-center justify-center">
          <Settings size={20} className="text-[#134C93]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#141A2B]">Settings</h1>
          <p className="text-sm text-[#6E7791]">Manage your preferences and application configuration</p>
        </div>
      </div>

      <div className="grid gap-4">
        {/* Notification Preferences — available to all */}
        <Link href="/dashboard/notification-preferences">
          <div className="group flex items-center gap-4 p-5 bg-white border border-[#E2E8F0] rounded-xl hover:border-[#134C93]/40 hover:shadow-sm transition-all cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-[#018365]/10 flex items-center justify-center shrink-0">
              <Bell size={18} className="text-[#018365]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#141A2B] group-hover:text-[#134C93] transition-colors">
                Notification Preferences
              </p>
              <p className="text-xs text-[#6E7791] mt-0.5">
                Choose which KPI alerts and system notifications you receive
              </p>
            </div>
            <svg className="w-4 h-4 text-[#9BA3B8] group-hover:text-[#134C93] transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        {/* User Management — admin/executive only */}
        {isAdmin && (
          <Link href="/dashboard/users">
            <div className="group flex items-center gap-4 p-5 bg-white border border-[#E2E8F0] rounded-xl hover:border-[#134C93]/40 hover:shadow-sm transition-all cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-[#134C93]/10 flex items-center justify-center shrink-0">
                <Users size={18} className="text-[#134C93]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#141A2B] group-hover:text-[#134C93] transition-colors">
                  User Management
                </p>
                <p className="text-xs text-[#6E7791] mt-0.5">
                  Manage user accounts, roles, and send announcements to your team
                </p>
              </div>
              <svg className="w-4 h-4 text-[#9BA3B8] group-hover:text-[#134C93] transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
