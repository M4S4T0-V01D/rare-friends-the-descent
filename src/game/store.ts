/** A tiny external store for React's useSyncExternalStore. Snapshots are replaced, never mutated. */
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private state: T) {}
  get = (): T => this.state;
  set(next: T) { this.state = next; for (const listener of this.listeners) listener(); }
  update(patch: Partial<T>) { this.set({ ...this.state, ...patch }); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
}
