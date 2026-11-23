import type { TFunction } from 'i18next';
import { useStore, type Agent } from '@/store/store';
import { disposeTerminal } from './terminalPool';

/** The UI "fire" button (agent panel and focus mode): confirm, kill the PTY,
 *  archive in the hive, then free the pooled xterm and drop the agent (even
 *  when the archive save fails — it's reported, not left half-fired).
 *  archiveAgent re-homes focus mode to the next agent, so callers must not
 *  clear fullscreen themselves. */
export async function fireAgent(agent: Pick<Agent, 'id' | 'name' | 'ptyId'>, t: TFunction): Promise<void> {
  if (!confirm(t('agentDetail.killConfirm', { name: agent.name }))) return;
  if (agent.ptyId) {
    const result = await window.cth.killPty(agent.ptyId);
    if (!result.ok && !/^no pty:/.test(result.error ?? '')) {
      alert(result.error ?? 'Could not fire the agent. Try again.');
      return;
    }
  }
  // The terminal is already stopped, so the card goes even if the registry
  // save fails; the error (registry.json path + why) tells the user what to fix.
  const fired = await window.cth.hiveSetArchived(agent.id, true);
  if (agent.ptyId) disposeTerminal(agent.ptyId);
  useStore.getState().archiveAgent(agent.id);
  if (!fired.ok) alert(`${agent.name} was stopped, but the fire wasn't saved: ${fired.error ?? 'unknown error'}`);
}
