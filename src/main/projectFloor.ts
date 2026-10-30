/** Pure config transitions for independent project floors. Kept out of the IPC
 *  handler so switching back and forth can be checked without launching Electron. */
import type { HarnessConfig, ScheduledMission } from './config';

type Automation = NonNullable<HarnessConfig['floorAutomation']>[string];

function activeAutomation(cfg: HarnessConfig): Automation {
  return {
    missions: cfg.missions ?? [],
    slackEnabled: cfg.slackEnabled ?? false,
    webhookEnabled: cfg.webhookEnabled ?? false,
    webhookTriggers: cfg.webhookTriggers ?? []
  };
}

export function prepareProjectFloorSelections(
  cfg: HarnessConfig, oldHome: string, newHome: string, projectPath: string, initialMissions: ScheduledMission[]
): Pick<HarnessConfig, 'floorRepoSelections' | 'floorAutomation'> {
  return {
    floorRepoSelections: {
      ...(cfg.floorRepoSelections ?? {}),
      [oldHome]: cfg.registeredRepos,
      [newHome]: [projectPath]
    },
    floorAutomation: {
      ...(cfg.floorAutomation ?? {}),
      [oldHome]: activeAutomation(cfg),
      [newHome]: { missions: initialMissions, slackEnabled: false, webhookEnabled: false, webhookTriggers: [] }
    }
  };
}

export function settingsForFloorSwitch(
  cfg: HarnessConfig, oldHome: string | null, newHome: string, mode: 'move' | 'fresh'
): Partial<HarnessConfig> {
  const floorRepoSelections = {
    ...(cfg.floorRepoSelections ?? {}),
    ...(oldHome ? { [oldHome]: cfg.registeredRepos } : {})
  };
  const floorAutomation = {
    ...(cfg.floorAutomation ?? {}),
    ...(oldHome ? { [oldHome]: activeAutomation(cfg) } : {})
  };
  if (mode === 'move' && oldHome) {
    floorRepoSelections[newHome] = cfg.registeredRepos;
    floorAutomation[newHome] = activeAutomation(cfg);
  }
  const targetAutomation = floorAutomation[newHome];
  return {
    harnessHome: newHome,
    floorRepoSelections,
    floorAutomation,
    registeredRepos: floorRepoSelections[newHome] ?? cfg.registeredRepos,
    ...(targetAutomation ? {
      missions: targetAutomation.missions,
      slackEnabled: targetAutomation.slackEnabled,
      webhookEnabled: targetAutomation.webhookEnabled,
      webhookTriggers: targetAutomation.webhookTriggers
    } : {})
  };
}
