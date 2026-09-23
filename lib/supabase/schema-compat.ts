/**
 * Helper utility to detect if a Supabase PostgREST error is due to
 * a missing column in the database schema or PostgREST schema cache.
 *
 * - PostgreSQL error code '42703' represents 'undefined_column' (common on SELECT queries).
 * - PostgREST error code 'PGRST204' represents a column missing from the schema cache (common on UPDATE/UPSERT/INSERT payloads).
 * - Also inspects error message, details, and hint strings for column name matches.
 */
export function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const code = err.code ?? "";
  const message = (err.message ?? "").toLowerCase();
  const details = (err.details ?? "").toLowerCase();
  const hint = (err.hint ?? "").toLowerCase();
  const fullText = `${code} ${message} ${details} ${hint}`;
  const targetCol = columnName.toLowerCase();

  return (
    (code === "42703" || code === "PGRST204") &&
    fullText.includes(targetCol)
  );
}
