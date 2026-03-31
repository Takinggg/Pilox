// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/** Shared focus rings + press feedback for marketplace UI. */
export const mpFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D0D]";

export const mpFocusTab =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]";

export const mpBtn =
  `${mpFocus} motion-safe:active:scale-[0.98] transition-transform duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100`;

export const mpCard =
  "motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none hover:border-[#3F3F46] hover:shadow-lg hover:shadow-black/20 motion-safe:hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 focus-within:ring-2 focus-within:ring-violet-500/35 focus-within:ring-offset-2 focus-within:ring-offset-[#0a0a0a]";

export const mpInput =
  `${mpFocus} transition-[border-color,box-shadow] duration-150`;
