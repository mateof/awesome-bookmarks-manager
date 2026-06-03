import { z } from "zod";

export const JobTypeSchema = z.enum([
  "snapshot",
  "favicon",
  "backup",
  "import",
  "share_seal",
  "group_share_seal",
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobStatusSchema = z.enum([
  "pending",
  "pending_user_key",
  "running",
  "done",
  "error",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: z.string().uuid(),
  type: JobTypeSchema,
  status: JobStatusSchema,
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  availableAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});
export type Job = z.infer<typeof JobSchema>;
