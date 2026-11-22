export const EXIT = {
  OK: 0, GENERIC: 1, BAD_ARGS: 2, TIMEOUT: 3, NOT_FOUND: 4, ASSERT: 5, DAEMON: 6, AUTH: 7,
} as const;

export const ERROR_CODES = {
  E_GENERIC: EXIT.GENERIC,
  E_BAD_ARGS: EXIT.BAD_ARGS,
  E_TIMEOUT: EXIT.TIMEOUT,
  E_NOT_FOUND: EXIT.NOT_FOUND,
  E_STALE_REF: EXIT.NOT_FOUND,
  E_ASSERT: EXIT.ASSERT,
  E_DAEMON: EXIT.DAEMON,
  E_VAULT: EXIT.AUTH,
  E_NO_DISPLAY: EXIT.GENERIC,
  E_NO_SESSION: EXIT.GENERIC,
  E_MACRO_STEP_FAILED: EXIT.GENERIC,
  E_UNSUPPORTED: EXIT.GENERIC,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class FpError extends Error {
  constructor(public code: ErrorCode, message: string, public hint?: string) {
    super(message);
  }
  get exitCode(): number { return ERROR_CODES[this.code]; }
  toJSON() { return { code: this.code, message: this.message, hint: this.hint }; }
}
