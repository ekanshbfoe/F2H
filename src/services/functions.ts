import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** Error shape every Edge Function returns: `{ error: { code, message } }` plus optional extras. */
export class FunctionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly payload: Record<string, unknown> | null = null,
  ) {
    super(code);
    this.name = 'FunctionError';
  }
}

/** Calls an Edge Function through the shared client, so the JWT and the device header ride along. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const code =
        (payload?.error as { code?: string } | undefined)?.code ?? `http_${error.context.status}`;
      throw new FunctionError(error.context.status, code, payload);
    }
    if (error instanceof FunctionsFetchError) throw new FunctionError(0, 'network');
    throw new FunctionError(0, 'unknown');
  }
  return data as T;
}
