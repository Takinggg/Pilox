// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

export function createSafeGlobals(): Record<string, unknown> {
  return {
    undefined: undefined,
    Infinity: Infinity,
    NaN: NaN,
  };
}

export function createSafeMath() {
  return {
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,
    PI: Math.PI,
    SQRT1_2: Math.SQRT1_2,
    SQRT2: Math.SQRT2,
    abs: Math.abs,
    acos: Math.acos,
    acosh: Math.acosh,
    asin: Math.asin,
    asinh: Math.asinh,
    atan: Math.atan,
    atanh: Math.atanh,
    atan2: Math.atan2,
    cbrt: Math.cbrt,
    ceil: Math.ceil,
    clz32: Math.clz32,
    cos: Math.cos,
    cosh: Math.cosh,
    exp: Math.exp,
    expm1: Math.expm1,
    floor: Math.floor,
    fround: Math.fround,
    hypot: Math.hypot,
    imul: Math.imul,
    log: Math.log,
    log1p: Math.log1p,
    log10: Math.log10,
    log2: Math.log2,
    max: Math.max,
    min: Math.min,
    pow: Math.pow,
    random: Math.random,
    round: Math.round,
    sign: Math.sign,
    sin: Math.sin,
    sinh: Math.sinh,
    sqrt: Math.sqrt,
    tan: Math.tanh,
    tanh: Math.tanh,
    trunc: Math.trunc,
  };
}

export function createSafeJSON() {
  return {
    parse: JSON.parse.bind(JSON),
    stringify: JSON.stringify.bind(JSON),
  };
}

export function createSafeDate(): typeof Date {
  const SafeDate = class extends Date {
    constructor(...args: ConstructorParameters<typeof Date>) {
      super(...args);
    }
  };
  return {
    ...Date,
    now: Date.now,
    parse: Date.parse,
    UTC: Date.UTC,
  } as typeof Date;
}

