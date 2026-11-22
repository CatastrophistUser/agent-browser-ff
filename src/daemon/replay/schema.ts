import { z } from 'zod';

export const targetSchema = z.object({
  role: z.string().optional(), name: z.string().optional(), level: z.number().optional(), nth: z.number().int().min(0).optional(),
  testid: z.string().optional(), label: z.string().optional(), placeholder: z.string().optional(), text: z.string().optional(), css: z.string().optional(),
}).refine((t) => Object.values(t).some((v) => v !== undefined), { message: 'target is empty' });
export type Target = z.infer<typeof targetSchema>;

const withTarget = { target: targetSchema, fallback: targetSchema.optional() };
export const stepSchema = z.union([
  z.object({ goto: z.string() }).strict(),
  z.object({ click: z.object({ ...withTarget, double: z.boolean().optional(), right: z.boolean().optional() }) }).strict(),
  z.object({ hover: z.object(withTarget) }).strict(),
  z.object({ fill: z.object({ ...withTarget, value: z.string() }) }).strict(),
  z.object({ type: z.object({ ...withTarget, value: z.string() }) }).strict(),
  z.object({ press: z.string() }).strict(),
  z.object({ check: z.object(withTarget) }).strict(),
  z.object({ uncheck: z.object(withTarget) }).strict(),
  z.object({ select: z.object({ ...withTarget, values: z.array(z.string()) }) }).strict(),
  z.object({ wait: z.union([z.enum(['load', 'domcontentloaded', 'networkidle']), z.object({ ms: z.number() }), z.object({ text: z.string() }), z.object({ url: z.string() })]) }).strict(),
  z.object({ assert: z.object({ ...withTarget, state: z.enum(['visible', 'hidden']).optional(), text: z.string().optional(), value: z.string().optional() }) }).strict(),
]);
export type Step = z.infer<typeof stepSchema>;

export const macroSchema = z.object({
  name: z.string().min(1),
  version: z.literal(1),
  vars: z.record(z.string(), z.object({ required: z.boolean().optional(), default: z.string().optional() })).default({}),
  steps: z.array(stepSchema),
});
export type Macro = z.infer<typeof macroSchema>;
