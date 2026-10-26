import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNode,
  createScene,
  createProject,
  addNode,
  duplicateNode,
  findNode,
  findEntry,
  removeNode,
  moveNode,
  insertNode,
  flatNodes,
  uniqueName,
  normalizeNode,
  normalizeProject,
  normalizeEvent,
  addBehavior,
  removeBehavior,
  isDescendant,
  allTags,
} from '../src/project.js';

test('createNode applies schema defaults and overrides', () => {
  const rect = createNode('rect');
  assert.equal(rect.type, 'rect');
  assert.equal(rect.w, 80);
  assert.equal(rect.solid, false);
  assert.deepEqual(rect.children, []);
  assert.deepEqual(rect.behaviors, []);

  const custom = createNode('circle', { name: 'Coin', x: 12, color: '#fff' });
  assert.equal(custom.name, 'Coin');
  assert.equal(custom.x, 12);
  assert.equal(custom.color, '#fff');
  assert.equal(custom.h, 32);
});

test('createNode falls back to rect for unknown types', () => {
  const node = createNode('does-not-exist');
  assert.equal(node.type, 'rect');
});

test('createProject has one scene and empty assets', () => {
  const project = createProject('Demo');
  assert.equal(project.name, 'Demo');
  assert.equal(project.scenes.length, 1);
  assert.deepEqual(project.assets, {});
  assert.ok(project.scenes[0].id);
});

test('addNode gives unique names and nests under a group', () => {
  const scene = createScene();
  const group = addNode(scene, 'group');
  const a = addNode(scene, 'rect', group.id);
  const b = addNode(scene, 'rect', group.id);
  assert.equal(a.name, 'Rectangle');
  assert.equal(b.name, 'Rectangle 2');
  assert.equal(group.children.length, 2);
  assert.equal(scene.nodes.length, 1);
  assert.equal(flatNodes(scene).length, 3);
});

test('findNode / findEntry locate nested nodes', () => {
  const scene = createScene();
  const group = addNode(scene, 'group');
  const child = addNode(scene, 'circle', group.id);
  assert.equal(findNode(scene.nodes, child.id), child);
  const entry = findEntry(scene.nodes, child.id);
  assert.equal(entry.parent, group);
  assert.equal(entry.depth, 1);
  assert.equal(findNode(scene.nodes, 'nope'), null);
});

test('removeNode detaches a nested node', () => {
  const scene = createScene();
  const group = addNode(scene, 'group');
  const child = addNode(scene, 'circle', group.id);
  const removed = removeNode(scene, child.id);
  assert.equal(removed, child);
  assert.equal(group.children.length, 0);
  assert.equal(findNode(scene.nodes, child.id), null);
});

test('duplicateNode deep-copies with fresh ids', () => {
  const scene = createScene();
  const group = addNode(scene, 'group');
  const child = addNode(scene, 'rect', group.id);
  const copy = duplicateNode(scene, group.id);
  assert.notEqual(copy.id, group.id);
  assert.equal(copy.children.length, 1);
  assert.notEqual(copy.children[0].id, child.id);
  assert.match(copy.name, /copy/);
  assert.notEqual(findNode(scene.nodes, copy.id), null);
});

test('moveNode refuses to create cycles and preserves order', () => {
  const scene = createScene();
  const outer = addNode(scene, 'group');
  const inner = addNode(scene, 'group', outer.id);
  assert.equal(moveNode(scene, outer.id, inner.id), false);
  assert.equal(isDescendant(outer, inner.id), true);

  const plain = addNode(scene, 'rect');
  assert.equal(moveNode(scene, plain.id, outer.id), true);
  assert.equal(findNode(scene.nodes, plain.id), plain);
  assert.equal(outer.children.at(-1).id, plain.id);
});

test('insertNode clamps out-of-range indexes', () => {
  const scene = createScene();
  const a = addNode(scene, 'rect');
  const b = createNode('rect');
  b.name = 'B';
  insertNode(scene, b, null, 99);
  assert.equal(scene.nodes[1].id, b.id);
  assert.equal(scene.nodes[0].id, a.id);
});

test('uniqueName appends counters', () => {
  const scene = createScene();
  addNode(scene, 'rect', null, { name: 'Player' });
  assert.equal(uniqueName(scene, 'Player'), 'Player 2');
  assert.equal(uniqueName(scene, 'Other'), 'Other');
});

test('behaviors can be attached and removed', () => {
  const node = createNode('rect');
  const behavior = addBehavior(node, 'platformer');
  assert.equal(behavior.type, 'platformer');
  assert.equal(behavior.speed, 230);
  assert.equal(addBehavior(node, 'nope'), null);
  assert.equal(removeBehavior(node, 0), true);
  assert.equal(node.behaviors.length, 0);
  assert.equal(removeBehavior(node, 5), false);
});

test('allTags collects and dedupes tags', () => {
  const scene = createScene();
  addNode(scene, 'rect', null, { tags: 'player, hero' });
  addNode(scene, 'circle', null, { tags: 'player' });
  assert.deepEqual(allTags(scene).sort(), ['hero', 'player']);
});

test('normalizeNode repairs a hand-edited node', () => {
  const node = normalizeNode({
    type: 'sprite',
    name: 'Hero',
    x: '42',
    scaleX: 'nope',
    behaviors: [{ type: 'platformer', speed: 100 }, { type: 'bogus' }],
    children: [{ type: 'text', text: 'hi' }],
    script: 42,
  });
  assert.equal(node.type, 'sprite');
  assert.equal(node.x, 42);
  assert.equal(node.scaleX, 1);
  assert.equal(node.behaviors.length, 1);
  assert.equal(node.behaviors[0].speed, 100);
  assert.equal(node.behaviors[0].jump, 560); // defaults merged in
  assert.equal(node.children.length, 1);
  assert.equal(node.children[0].type, 'text');
  assert.equal(node.script, '');
});

test('normalizeProject rejects junk and keeps valid data', () => {
  assert.throws(() => normalizeProject(null), /Project JSON/);
  assert.throws(() => normalizeProject({ scenes: [] }), /at least one scene/);

  const project = normalizeProject({
    name: 'Imported',
    scenes: [{ name: 'One', width: 1280, nodes: [{ type: 'rect', x: 1, y: 2 }] }],
  });
  assert.equal(project.name, 'Imported');
  assert.equal(project.scenes.length, 1);
  assert.equal(project.scenes[0].width, 1280);
  assert.equal(project.scenes[0].height, 540);
  assert.equal(project.scenes[0].nodes.length, 1);
});

test('normalizeEvent fills defaults', () => {
  const event = normalizeEvent({ trigger: 'start' });
  assert.equal(event.enabled, true);
  assert.equal(event.trigger, 'start');
  assert.deepEqual(event.conditions, []);
  assert.deepEqual(event.actions, []);
  assert.ok(event.id);
});

test('project JSON round-trips without loss', () => {
  const scene = createScene('Roundtrip');
  const group = addNode(scene, 'group', null, { name: 'Layer' });
  addNode(scene, 'circle', group.id, { name: 'Dot', tags: 'player' });
  const project = createProject('RT');
  project.scenes = [scene];
  project.assets = { as_1: { id: 'as_1', name: 'tex', dataUrl: 'data:image/png;base64,AA' } };

  const copy = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(copy.scenes[0].name, 'Roundtrip');
  assert.equal(copy.scenes[0].nodes[0].children[0].name, 'Dot');
  assert.equal(copy.assets.as_1.name, 'tex');
});
