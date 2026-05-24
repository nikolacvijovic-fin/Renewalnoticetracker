type SupabaseWriteOperation = "insert" | "update" | "delete" | "upsert";

type SupabaseWriteResult<TData = unknown> = {
  data?: TData | null;
  error: unknown | null;
};

export class PrivilegedWriteError extends Error {
  constructor(
    public readonly operation: SupabaseWriteOperation,
    public readonly table: string,
    public readonly cause: unknown,
    public readonly context?: string
  ) {
    super(
      `Privileged ${operation} failed for "${table}"${context ? ` during ${context}` : ""}.`
    );
    this.name = "PrivilegedWriteError";
  }
}

export async function checkedPrivilegedWrite<TData>(
  write: PromiseLike<SupabaseWriteResult<TData>>,
  input: {
    operation: SupabaseWriteOperation;
    table: string;
    context?: string;
  }
) {
  const result = await write;
  if (result.error) {
    throw new PrivilegedWriteError(
      input.operation,
      input.table,
      result.error,
      input.context
    );
  }
  return result;
}
