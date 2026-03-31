/**
 * Consistent stderr/stdout prefix for Hive CLI scripts (grep-friendly in CI logs).
 * Do not use for lines that must be machine-parseable JSON on stdout.
 */
export const HIVE_CLI_PREFIX = "[hive]";

export function cliLog(...args) {
  console.log(HIVE_CLI_PREFIX, ...args);
}

export function cliWarn(...args) {
  console.warn(HIVE_CLI_PREFIX, ...args);
}

export function cliErr(...args) {
  console.error(HIVE_CLI_PREFIX, ...args);
}
