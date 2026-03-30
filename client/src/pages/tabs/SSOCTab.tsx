import { ShieldCheck } from "lucide-react";

export default function SSOCTab() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#134C93]/10 flex items-center justify-center">
        <ShieldCheck size={28} className="text-[#134C93]" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-[#141A2B]">SSOC</h2>
        <p className="text-sm text-[#6E7791] mt-1 max-w-xs">
          Security Operations Center alerts, incident tracking, and compliance metrics will appear here.
        </p>
      </div>
      <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-600">
        Coming soon
      </span>
    </div>
  );
}
