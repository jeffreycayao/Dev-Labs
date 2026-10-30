const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { prepareProjectFloorSelections, settingsForFloorSwitch } = loadTs('src/main/projectFloor.ts');

test('new project floor has its own repo and no old inbound automation', () => {
  const old = {
    harnessHome: '/floors/old', registeredRepos: ['/repos/old', '/repos/shared'],
    missions: [{ id: 'old-mission' }], slackEnabled: true, webhookEnabled: true,
    webhookTriggers: [{ id: 'old-hook', enabled: true }]
  };
  const prepared = prepareProjectFloorSelections(old, '/floors/old', '/floors/new', '/repos/new', [{ id: 'standup' }]);
  const next = settingsForFloorSwitch({ ...old, ...prepared }, '/floors/old', '/floors/new', 'fresh');
  assert.deepEqual(next.registeredRepos, ['/repos/new']);
  assert.deepEqual(next.missions, [{ id: 'standup' }]);
  assert.equal(next.slackEnabled, false);
  assert.equal(next.webhookEnabled, false);
  assert.deepEqual(next.webhookTriggers, []);
  assert.deepEqual(next.floorRepoSelections['/floors/old'], ['/repos/old', '/repos/shared']);

  const back = settingsForFloorSwitch({ ...old, ...next }, '/floors/new', '/floors/old', 'fresh');
  assert.deepEqual(back.registeredRepos, ['/repos/old', '/repos/shared']);
  assert.deepEqual(back.missions, [{ id: 'old-mission' }]);
  assert.equal(back.slackEnabled, true);
  assert.equal(back.webhookEnabled, true);
  assert.deepEqual(back.webhookTriggers, [{ id: 'old-hook', enabled: true }]);
});

test('moving a floor carries its repo and automation to the copied home', () => {
  const current = {
    registeredRepos: ['/repos/current'], missions: [{ id: 'current-mission' }],
    slackEnabled: true, webhookEnabled: false, webhookTriggers: []
  };
  const moved = settingsForFloorSwitch(current, '/floors/old', '/floors/copied', 'move');
  assert.deepEqual(moved.registeredRepos, current.registeredRepos);
  assert.deepEqual(moved.missions, current.missions);
  assert.equal(moved.slackEnabled, true);
});
