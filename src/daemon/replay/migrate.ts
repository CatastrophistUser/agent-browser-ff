/** Macro file migrations. Add a step here whenever the macro format `version` is bumped. */
export const CURRENT_MACRO_VERSION = 1;

export function migrate(raw: unknown): unknown {
  // Only version 1 exists; future versions chain migrations here (v1 -> v2 -> ...).
  return raw;
}
