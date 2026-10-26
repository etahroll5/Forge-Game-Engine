// UI smoke test: boots the real editor inside jsdom (with a stubbed 2D canvas)
// and exercises selection, property editing, undo, events and play mode.
//
// Skipped automatically when jsdom is not installed (`npm i -D jsdom`).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let JSDOM = null;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  JSDOM = null;
}

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function noop() {}

function stub2dContext() {
  return {
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop, setTransform: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, ellipse: noop, rect: noop, roundRect: noop,
    fill: noop, stroke: noop, setLineDash: noop, fillText: noop, drawImage: noop,
    measureText: () => ({ width: 10 }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
  };
}

async function boot() {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => stub2dContext();
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.devicePixelRatio = 1;

  global.window = window;
  global.document = window.document;
  global.navigator = window.navigator;
  global.HTMLElement = window.HTMLElement;
  global.HTMLCanvasElement = window.HTMLCanvasElement;
  global.Image = window.Image;
  global.FileReader = window.FileReader;
  global.ResizeObserver = window.ResizeObserver;
  global.localStorage = window.localStorage;
  global.Blob = window.Blob;
  global.URL.createObjectURL = noop;
  global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  global.KeyboardEvent = window.KeyboardEvent;
  global.MouseEvent = window.MouseEvent;
  global.Event = window.Event;

  window.localStorage.clear();
  await import('../src/editor/app.js');
  return { window, document: window.document };
}

const skip = JSDOM ? false : 'jsdom not installed';

test('editor UI smoke suite', { skip }, async (t) => {
  const { window, document } = await boot();
  const { store } = window.appjet;

  await t.test('boots and renders every panel', () => {
    assert.ok(store, 'app exposes the store for debugging');
    assert.equal(document.querySelectorAll('.scene-item').length, 2, 'demo project has two scenes');
    assert.ok(document.querySelectorAll('.tree-item').length >= 10, 'hierarchy lists the demo nodes');
    assert.ok(document.querySelectorAll('.event-card').length >= 4, 'event sheet renders demo events');
    assert.ok(document.querySelectorAll('.var-row').length >= 2, 'variables panel lists demo variables');
    assert.match(document.querySelector('.insp-head').textContent, /Stage/);
    assert.match(document.querySelector('.log-line').textContent, /demo project|saved project/i);
    assert.ok(document.querySelectorAll('.hud-chip').length >= 2, 'viewport HUD is populated');
  });

  await t.test('selecting a node drives the inspector', () => {
    const player = store.scene().nodes.find((n) => n.name === 'Player');
    store.select(player.id);

    assert.match(document.querySelector('.insp-head').textContent, /Rectangle/);
    assert.equal(document.querySelectorAll('.behavior-item').length, 1, 'platformer behavior is listed');
    assert.ok(document.querySelector('textarea'), 'script editor is present');

    const xInput = document.querySelector('#inspector input[data-field="x"]');
    assert.ok(xInput, 'transform X field exists');
    xInput.value = '333';
    xInput.dispatchEvent(new window.Event('change'));
    assert.equal(store.selected().x, 333, 'editing a field writes to the project');
    assert.equal(store.canUndo(), true);
  });

  await t.test('undo and redo restore project state', () => {
    const node = store.scene().nodes.find((n) => n.name === 'Player');
    store.select(node.id);
    store.setNode(node.id, 'x', 999);
    assert.equal(store.selected().x, 999);
    store.undo();
    assert.notEqual(store.selected().x, 999);
    store.redo();
    assert.equal(store.selected().x, 999);
    store.undo();
  });

  await t.test('adding nodes, events and scenes works from the UI', () => {
    const before = store.scene().nodes.length;
    store.addNode('circle');
    assert.equal(store.scene().nodes.length, before + 1);
    assert.ok(store.selectedId, 'new node is selected');
    assert.match(document.querySelector('.insp-head').textContent, /Circle/);

    const eventsBefore = store.scene().events.length;
    const addEventBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('+ Add event'));
    assert.ok(addEventBtn, '+ Add event button exists');
    addEventBtn.dispatchEvent(new window.Event('click'));
    assert.equal(store.scene().events.length, eventsBefore + 1);

    const scenesBefore = store.project.scenes.length;
    document.getElementById('btn-scene-add').dispatchEvent(new window.Event('click'));
    assert.equal(store.project.scenes.length, scenesBefore + 1);
    assert.equal(document.querySelectorAll('.scene-item').length, scenesBefore + 1);
  });

  await t.test('play mode starts the runtime and stop returns to editing', async () => {
    store.setScene(store.project.scenes[0].id); // scene 0 is the demo platformer
    document.getElementById('btn-play').dispatchEvent(new window.Event('click'));
    await new Promise((resolve) => setTimeout(resolve, 120));

    const engine = window.appjet.engine;
    assert.ok(engine, 'engine is running');
    assert.equal(engine.running, true);
    assert.ok(engine.instances.length > 5, 'runtime instantiates the scene');
    assert.equal(document.getElementById('play-badge').hidden, false);

    // Let a few frames tick so physics/behaviors/events actually execute.
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(engine.frame > 0, 'game loop advanced');
    assert.equal(engine.reportedErrors.size, 0, 'no runtime errors in the demo scene');

    document.getElementById('btn-stop').dispatchEvent(new window.Event('click'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(window.appjet.engine, null);
    assert.equal(document.getElementById('play-badge').hidden, true);
    assert.ok(store.scene(), 'editor scene is untouched');
  });

  await t.test('exported JSON round-trips through import', () => {
    const json = store.exportJSON();
    const parsed = JSON.parse(json);
    assert.ok(parsed.scenes.length >= 2);
    store.reset(false);
    assert.equal(store.project.scenes.length, 1);
    store.importJSON(json);
    assert.equal(store.project.scenes.length, parsed.scenes.length);
    assert.equal(store.scene().nodes.length, parsed.scenes[0].nodes.length);
  });

  await t.test('keyboard shortcuts delete and duplicate', () => {
    const scene = store.scene();
    const target = scene.nodes[0];
    store.select(target.id);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
    assert.ok(scene.nodes.length > 1, 'Ctrl+D duplicates');
    const count = scene.nodes.length;
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    assert.equal(scene.nodes.length, count - 1, 'Delete removes the selected node');
  });

  await t.test('editing shortcuts are inert while the game is playing', async () => {
    store.setScene(store.project.scenes[0].id);
    const before = store.scene().nodes.length;
    store.select(store.scene().nodes[0].id);

    document.getElementById('btn-play').dispatchEvent(new window.Event('click'));
    await new Promise((resolve) => setTimeout(resolve, 60));

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
    assert.equal(store.scene().nodes.length, before, 'play mode must not delete or duplicate editor nodes');
    assert.equal(store.canUndo(), true, 'play mode must not push history entries');

    document.getElementById('btn-stop').dispatchEvent(new window.Event('click'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(store.scene().nodes.length, before);
  });

  // Tear the jsdom window down so pending timers/frames do not keep node alive.
  if (window.appjet.engine) document.getElementById('btn-stop').dispatchEvent(new window.Event('click'));
  window.close();
});
