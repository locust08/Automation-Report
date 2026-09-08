import { z } from "zod";

export const exclusionCapMutationSchema = z.object({
  cap: z.number().int().min(0).max(2147483647),
  expectedVersion: z.number().int().nonnegative(),
});

export type ExclusionCapSetting = {
  cap: number;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};
