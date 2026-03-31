import { z } from "zod";

export const cpuLimitSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Must be a number (e.g. '2' or '0.5')")
  .refine(
    (v) => { const n = parseFloat(v); return n >= 0.1 && n <= 16; },
    "CPU must be between 0.1 and 16",
  )
  .optional();

export const memoryLimitSchema = z
  .string()
  .regex(/^\d+(m|g)$/i, "Must be like '512m' or '4g'")
  .refine(
    (v) => {
      const m = v.match(/^(\d+)(m|g)$/i);
      if (!m) return false;
      const mib = m[2].toLowerCase() === "g" ? parseInt(m[1]) * 1024 : parseInt(m[1]);
      return mib >= 64 && mib <= 32768;
    },
    "Memory must be between 64m and 32g",
  )
  .optional();
