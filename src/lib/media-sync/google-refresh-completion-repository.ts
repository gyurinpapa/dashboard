import type { Dependencies, Scope, Witness } from './google-refresh-completion-controller';

export const GOOGLE_REFRESH_COMPLETION_READ_RPC = 'read_google_refresh_completion';
type Rpc = (name: string, args: { p_payload: unknown }) => Promise<{ data: unknown; error: unknown }>;

/** No client construction or credentials. Only inject a server-owned RPC client.
 * The controller authorizes before reading; the locked mutation RPC rechecks SQL invariants.
 * No route or worker imports this module. Runtime enablement remains false.
 */
export function createGoogleRefreshCompletionDependencies(authorize: Dependencies['authorize'], rpc: Rpc): Dependencies {
  const call = async (name: string, payload: unknown) => {
    const { data, error } = await rpc(name, { p_payload: payload });
    if (error) throw new Error('GOOGLE_REFRESH_COMPLETION_DATABASE_ERROR');
    return data;
  };
  return {
    authorize,
    read: async (scope: Scope) => {
      const data = await call(GOOGLE_REFRESH_COMPLETION_READ_RPC, scope);
      if (data === null) return null;
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('GOOGLE_REFRESH_COMPLETION_INVALID_RESULT');
      // Field/state validation belongs to the controller, including exact scope equality.
      return data as Witness;
    },
    step: payload => call('step_google_refresh_revision', payload),
  };
}
