/**
 * Diagnostic levels for students. Pyright can report a great deal; a
 * beginner's editor should not look like a wall of warnings.
 *
 * - essential: what stops the code running or is a clear mistake
 * - standard: pyright's standard mode, unfiltered
 * - strict: pyright's strict mode
 */

export type DiagnosticLevel = "essential" | "standard" | "strict";

export const DIAGNOSTIC_LEVELS: readonly DiagnosticLevel[] = ["essential", "standard", "strict"];

export const LEVEL_LABELS: Record<DiagnosticLevel, string> = {
  essential: "Essential: mistakes that stop the code running",
  standard: "Standard: pyright's default checks",
  strict: "Strict: every check pyright has",
};

/** Rules kept in essential mode. Syntax errors carry no code and are always kept. */
export const ESSENTIAL_RULES = new Set([
  "reportUndefinedVariable",
  "reportMissingImports",
  "reportMissingModuleSource",
  "reportCallIssue",
  "reportArgumentType",
  "reportAttributeAccessIssue",
  "reportIndexIssue",
  "reportOptionalSubscript",
  "reportOptionalMemberAccess",
  "reportOptionalCall",
  "reportReturnType",
  "reportAssignmentType",
  "reportOperatorIssue",
  "reportPossiblyUnbound",
  "reportRedeclaration",
  "reportSelfClsParameterName",
  "reportGeneralTypeIssues",
  "reportInvalidStringEscapeSequence",
  "reportUnhashable",
  "reportAbstractUsage",
  "reportNoOverloadImplementation",
]);

/** Subset of the LSP Diagnostic shape we need. */
export interface LspDiagnostic {
  severity?: number;
  code?: string | number;
  tags?: number[];
  message: string;
  [key: string]: unknown;
}

const SEVERITY_HINT = 4;
const TAG_UNNECESSARY = 1;

/** Which diagnostics to show at a level. Pure, so it can be tested. */
export function keepDiagnostic(level: DiagnosticLevel, d: LspDiagnostic): boolean {
  if (level === "strict") return true;
  if (d.severity === SEVERITY_HINT) return false;
  if (d.tags?.includes(TAG_UNNECESSARY)) return false;
  if (level === "standard") return true;
  if (d.code === undefined || d.code === null) return true; // syntax errors
  return ESSENTIAL_RULES.has(String(d.code));
}

export function filterDiagnostics<T extends LspDiagnostic>(level: DiagnosticLevel, list: T[]): T[] {
  return list.filter((d) => keepDiagnostic(level, d));
}

/** The pyright settings that back each level (sent as workspace configuration). */
export function pyrightSettings(level: DiagnosticLevel, pythonPath: string | null) {
  return {
    python: {
      ...(pythonPath ? { pythonPath } : {}),
      analysis: {
        typeCheckingMode:
          level === "strict" ? "strict" : level === "standard" ? "standard" : "basic",
        autoSearchPaths: true,
        useLibraryCodeForTypes: true,
        diagnosticMode: "openFilesOnly",
        autoImportCompletions: true,
      },
    },
  };
}
