/**
 * In-memory, process-scoped cache. The engine is STATELESS: nothing is ever
 * written to disk. This cache exists only to avoid re-fetching the same
 * inventory twice within a single run; it lives in the heap and disappears the
 * moment the process exits. No files, no directories, no cross-run state.
 */
const store = new Map<string, unknown>();

export async function readCache<T>(key: string): Promise<T | null> {
  return store.has(key) ? (store.get(key) as T) : null;
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  store.set(key, value);
}
