"use client";

import { useEffect, useState } from "react";

import { policyListToMap, type WorkflowPolicy, type WorkflowPolicyMap } from "@/lib/workflow-settings/policy";

export function useWorkflowPolicies() {
  const [policies, setPolicies] = useState<WorkflowPolicyMap>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/workflow-settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ policies: WorkflowPolicy[] }> : null)
      .then((payload) => { if (payload) setPolicies(policyListToMap(payload.policies)); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return policies;
}
