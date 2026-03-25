/**
 * NotificationPreferencesPage
 * ─────────────────────────────────────────────────────────────────────────────
 * Lets each user opt in/out of individual KPI monitor alert rules.
 * Rules are keyed by the same `ruleId` strings used in server/kpiMonitor.ts.
 * Absence of a row in notification_preferences means "enabled" (default).
 */

import { useState } from "react";
import { Bell, BellOff, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Rule catalogue (mirrors server/kpiMonitor.ts ThresholdRule names) ────────

interface RuleMeta {
  ruleId:      string;
  label:       string;
  description: string;
  category:    string;
  severity:    "info" | "warning" | "error";
}

const RULE_CATALOGUE: RuleMeta[] = [
  {
    ruleId:      "delivery-velocity-drop",
    label:       "Sprint Velocity Drop",
    description: "Alert when sprint velocity falls below 70% of the 4-sprint rolling average.",
    category:    "Delivery",
    severity:    "warning",
  },
  {
    ruleId:      "delivery-on-time-low",
    label:       "On-Time Delivery Rate Low",
    description: "Alert when on-time delivery rate drops below 75%.",
    category:    "Delivery",
    severity:    "warning",
  },
  {
    ruleId:      "delivery-cycle-time-high",
    label:       "Cycle Time Elevated",
    description: "Alert when median cycle time exceeds 10 days.",
    category:    "Delivery",
    severity:    "warning",
  },
  {
    ruleId:      "qa-defect-density-high",
    label:       "Defect Density High",
    description: "Alert when defect density exceeds 5 bugs per story point.",
    category:    "QA",
    severity:    "error",
  },
  {
    ruleId:      "qa-test-pass-rate-low",
    label:       "Test Pass Rate Low",
    description: "Alert when automated test pass rate drops below 85%.",
    category:    "QA",
    severity:    "error",
  },
  {
    ruleId:      "csm-health-score-low",
    label:       "Customer Health Score Low",
    description: "Alert when average customer health score falls below 60.",
    category:    "CSM",
    severity:    "warning",
  },
  {
    ruleId:      "sales-pipeline-coverage-low",
    label:       "Pipeline Coverage Low",
    description: "Alert when sales pipeline coverage drops below 3× quota.",
    category:    "Sales",
    severity:    "warning",
  },
  {
    ruleId:      "sales-win-rate-low",
    label:       "Win Rate Low",
    description: "Alert when rolling 90-day win rate falls below 20%.",
    category:    "Sales",
    severity:    "warning",
  },
];

const CATEGORY_ORDER = ["Delivery", "QA", "CSM", "Sales"];

const SEVERITY_COLOURS: Record<string, string> = {
  info:    "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error:   "bg-red-500/10 text-red-600 dark:text-red-400",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationPreferencesPage() {
  const utils = trpc.useUtils();

  // Fetch current preferences
  const { data: prefs, isLoading } = trpc.notifications.getPreferences.useQuery();

  // Build a fast lookup: ruleId → enabled (default true)
  const prefMap = new Map<string, boolean>(
    (prefs ?? []).map((p) => [p.ruleId, p.enabled])
  );

  // Optimistic local state for toggle feedback
  const [localOverrides, setLocalOverrides] = useState<Map<string, boolean>>(new Map());

  const setPreference = trpc.notifications.setPreference.useMutation({
    onMutate: ({ ruleId, enabled }) => {
      setLocalOverrides((prev) => new Map(prev).set(ruleId, enabled));
    },
    onSuccess: () => {
      utils.notifications.getPreferences.invalidate();
    },
    onError: (_err, { ruleId }) => {
      // Rollback local override on error
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.delete(ruleId);
        return next;
      });
    },
  });

  function isEnabled(ruleId: string): boolean {
    if (localOverrides.has(ruleId)) return localOverrides.get(ruleId)!;
    return prefMap.has(ruleId) ? prefMap.get(ruleId)! : true; // default = enabled
  }

  function handleToggle(ruleId: string) {
    const next = !isEnabled(ruleId);
    setPreference.mutate({ ruleId, enabled: next });
  }

  // Group rules by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    rules:    RULE_CATALOGUE.filter((r) => r.category === cat),
  }));

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Notification Preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which KPI alerts you want to receive. Changes take effect immediately.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-700 dark:text-blue-300">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Disabling a rule only suppresses notifications for you. Other users are not affected.
          The KPI monitor continues to run regardless of your preferences.
        </span>
      </div>

      {/* Rule groups */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="space-y-4">
                {[...Array(2)].map((_, j) => (
                  <div key={j} className="flex items-center justify-between">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-6 w-11 rounded-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ category, rules }) => (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{category}</CardTitle>
                <CardDescription className="text-xs">
                  {rules.filter((r) => isEnabled(r.ruleId)).length} of {rules.length} alerts enabled
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {rules.map((rule) => {
                  const enabled = isEnabled(rule.ruleId);
                  return (
                    <div key={rule.ruleId} className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                            {rule.label}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 border-0 ${SEVERITY_COLOURS[rule.severity]}`}
                          >
                            {rule.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {rule.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        {enabled ? (
                          <Bell className="w-3.5 h-3.5 text-muted-foreground/50" />
                        ) : (
                          <BellOff className="w-3.5 h-3.5 text-muted-foreground/30" />
                        )}
                        <Switch
                          checked={enabled}
                          onCheckedChange={() => handleToggle(rule.ruleId)}
                          disabled={setPreference.isPending}
                          aria-label={`${enabled ? "Disable" : "Enable"} ${rule.label} alert`}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
