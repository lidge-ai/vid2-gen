import { z } from "zod";

const Selector = z.string().min(1);
export const StepsSchema = z.array(z.union([
  z.strictObject({ goto: z.string().min(1) }),
  z.strictObject({ click: Selector, label: z.string().optional() }),
  z.strictObject({ type: Selector, text: z.string(), delayMs: z.number().nonnegative().optional(), label: z.string().optional() }),
  z.strictObject({ press: z.string().min(1) }),
  z.strictObject({ hover: Selector }),
  z.strictObject({ scroll: z.strictObject({ y: z.number() }) }),
  z.strictObject({ wait: z.union([z.number().nonnegative(), z.strictObject({ selector: Selector })]) }),
  z.strictObject({ waitFor: z.strictObject({ url: z.string().optional(), selector: Selector.optional(), response: z.string().optional() })
    .refine((value) => !!(value.url || value.selector || value.response), "waitFor needs a condition") }),
  z.strictObject({ mark: z.string().min(1) }),
  z.strictObject({ eval: z.string().min(1) }),
]));

export type Steps = z.infer<typeof StepsSchema>;

/** Authored input schema; the waitFor refinement is enforced by zod at runtime. */
export function stepsJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(StepsSchema, { target: "draft-2020-12", io: "input" });
}
