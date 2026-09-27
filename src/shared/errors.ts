/** Error codes and exit codes: the public failure contract of every vid2 command (structure/cli-contract.md). */

export const EXIT = { OK: 0, INTERNAL: 1, INPUT: 2, CAPABILITY: 3, ACCESS: 4, RENDER: 5, QA: 6, INTERRUPTED: 7 } as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export type ErrorCode =
  | "E_INPUT" | "E_SCHEMA" | "E_NOT_FOUND" | "E_CAPABILITY" | "E_FFMPEG_MISSING" | "E_ACCESS"
  | "E_PROVIDER" | "E_RENDER" | "E_QA" | "E_TIMEOUT" | "E_INTERRUPTED" | "E_INTERNAL";

const EXIT_BY_CODE: Record<ErrorCode, ExitCode> = {
  E_INPUT: EXIT.INPUT, E_SCHEMA: EXIT.INPUT, E_NOT_FOUND: EXIT.INPUT,
  E_CAPABILITY: EXIT.CAPABILITY, E_FFMPEG_MISSING: EXIT.CAPABILITY,
  E_ACCESS: EXIT.ACCESS, E_PROVIDER: EXIT.ACCESS,
  E_RENDER: EXIT.RENDER, E_QA: EXIT.QA,
  E_TIMEOUT: EXIT.INTERRUPTED, E_INTERRUPTED: EXIT.INTERRUPTED,
  E_INTERNAL: EXIT.INTERNAL,
};

export function exitFor(code: ErrorCode): ExitCode {
  return EXIT_BY_CODE[code];
}

export interface Vid2ErrorOptions {
  details?: Record<string, unknown>;
  retryable?: boolean;
  fix?: string;
  cause?: unknown;
}

export class Vid2Error extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;
  readonly retryable: boolean;
  readonly fix: string | undefined;

  constructor(code: ErrorCode, message: string, opts: Vid2ErrorOptions = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "Vid2Error";
    this.code = code;
    this.details = opts.details;
    this.retryable = opts.retryable ?? false;
    this.fix = opts.fix;
  }

  get exit(): ExitCode {
    return exitFor(this.code);
  }
}

export function isVid2Error(e: unknown): e is Vid2Error {
  return e instanceof Vid2Error;
}

