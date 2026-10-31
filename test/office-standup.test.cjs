'use strict';

// Standup cards: one per agent, built from hive tasks and recent commits.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const s = loadTs('src/shared/office/standup.ts');

const agents = [{ id: 'a1', name: 'Pam' }, { id: 'a2', name: 'Jim' }];
const tasks = {
  tasks: [
    { id: 't1', title: 'Write docs', assignee: 'a1', status: 'todo' },
    { id: 't2', title: 'Fix login', assignee: 'a1', status: 'doing' },
    { id: 't3', title: 'Ship it', assignee: 'a1', status: 'done' },
    { id: 't4', title: 'Deploy', assignee: 'a1', status: 'blocked', humanQA: [
      { q: 'Which region?' },
      { q: 'Old question', a: 'eu' },
      { q: 'Dismissed', dismissedAt: '2026-01-01' }
    ] },
    { id: 't5', title: 'Nobody', status: 'doing' },
    'junk',
    null
  ]
};
const commits = { a2: [1, 2, 3, 4].map((i) => ({ sha: `abcdef${i}0000`, subject: `commit ${i}`, author: 'Jim' })) };

test('one card per agent, in agent order', () => {
  const cards = s.buildStandupCards(agents, tasks, commits);
  assert.deepEqual(cards.map((c) => c.agentId), ['a1', 'a2']);
});

test('doing task is current; open tasks listed doing → blocked → todo; done skipped', () => {
  const [pam] = s.buildStandupCards(agents, tasks, commits);
  assert.equal(pam.currentTask, 'Fix login');
  assert.deepEqual(pam.activeTickets.map((t) => t.id), ['t2', 't4', 't1']);
  assert.deepEqual(pam.activeTickets.map((t) => t.status), ['In progress', 'Blocked', 'To do']);
});

test('blocked tasks and unanswered questions are blockers', () => {
  const [pam] = s.buildStandupCards(agents, tasks, commits);
  assert.deepEqual(pam.blockers, ['"Deploy" is blocked', 'Waiting on your answer: Which region?']);
  assert.equal(pam.speech, 'Pam: Fix login. Blocker: "Deploy" is blocked.');
});

test('no tasks: last commit is the current task, at most 3 commits', () => {
  const [, jim] = s.buildStandupCards(agents, tasks, commits);
  assert.equal(jim.currentTask, 'Last commit: commit 1');
  assert.equal(jim.recentCommits.length, 3);
  assert.equal(jim.recentCommits[0].subtitle, 'abcdef1 · Jim');
  assert.deepEqual(jim.blockers, []);
});

test('nothing at all', () => {
  const [card] = s.buildStandupCards([{ id: 'x', name: 'X' }], null, {});
  assert.equal(card.currentTask, 'No task on the board.');
  assert.equal(card.speech, 'X: No task on the board.');
});

test('long speech is cut to 120 chars', () => {
  const speech = s.standupSpeech('A', 'x'.repeat(200), []);
  assert.equal(speech.length, 120);
  assert.ok(speech.endsWith('...'));
});
