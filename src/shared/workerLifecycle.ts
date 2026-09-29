/** Manager-spawned agents are hires. Automatic reaping is opt-in for one-off work. */
export function isEphemeralSpawnRequest(request: { ephemeral?: unknown }): boolean {
  return request.ephemeral === true;
}
