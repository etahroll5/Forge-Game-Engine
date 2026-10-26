// UI smoke test: boots the real editor inside jsdom (with a stubbed 2D canvas)
// and exercises selection, property editing, undo and play mode.
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

const htmlPath = new URL('../index.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');

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
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => stub2dContext();
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.devicePixelRatio = 1;
  if (!window.AudioContext) window.AudioContext = undefined;

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
  return { dom, window, document: window.document };
}

const available = Boolean(JSDOM);

test('editor boots and renders all panels', { skip: !available ? 'jsdom not installed' : false }, async () => {
  const { document, window } = await boot();
  const { store } = window.appjet;

  assert.ok(store, 'app should expose the store for debugging');
  assert.equal(document.querySelectorAll('.scene-item').length, 2, 'demo project has two scenes');
  assert.ok(document.querySelectorAll('.tree-item').length >= 10, 'hierarchy should list the demo nodes');
  assert.ok(document.querySelectorAll('.event-card').length >= 4, 'event sheet should render demo events');
  assert.ok(document.querySelectorAll('.var-row').length >= 2, 'variables panel should list demo variables');
  assert.match(document.querySelector('.insp-head').textContent, /Stage/);
  assert.match(document.querySelector('.log-line').textContent, /demo project|saved project/i);
});

test('selecting a node drives the inspector', { skip: !available ? 'jsdom not installed' : false }, async () => {
  const { document, window } = await boot();
  const { store } = window.appjet;

  const player = store.scene().nodes.find((n) => n.name === 'Player');
  store.select(player.id);
  await new Promise((r) => setTimeout(r, 0));

  const header = document.querySelector('.insp-head').textContent;
  assert.match(header, /Rectangle/);
  assert.equal(document.querySelectorAll('.behavior-item').length, 1, 'platformer behavior should be listed');
  assert.ok(document.querySelector('textarea'), 'script editor should be present');

  const xInput = document.querySelector('input[data-field="x"]');
  assert.ok(xInput, 'transform X field should exist');
  xInput.value = '333';
  xInput.dispatchEvent(new window.Event('change'));
  assert.equal(store.selected().x, 333, 'editing a field writes to the project');
  assert.equal(store.canUndo(), true);
});

test('undo/redo restores project state', { skip: !available ? 'jsdom not installed' : false }, async () => {
  const { window } = await boot();
  const { store } = window.appjet;

  const node = store.scene().nodes.find((n) => n.name === 'Player');
  store.select(node.id);
  store.setNode(node.id, 'x', 999);
  assert.equal(store.selected().x, 999);
  store.undo();
  assert.notEqual(store.selected().x, 999);
  store.redo();
  assert.equal(store.selected().x, 999);
});

test('adding nodes, events and scenes works from the UI', { skip: !available ? 'jsdom not installed' : false }, async () => {
  const { document, window } = await boot();
  const { store } = window.appjet;

  const before = store.scene().nodes.length;
  store.addNode('circle');
  assert.equal(store.scene().nodes.length, before + 1);
  assert.ok(store.selectedId, 'new node should be selected');

  const eventsBefore = store.scene().events.length;
  const addEventBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('+ Add event'));
  addEventBtn.dispatchEvent(new window.Event('click'));
  assert.equal(store.scene().events.length, eventsBefore + 1);

  const scenesBefore = store.project.scenes.length;
  document.getElementById('btn-scene-add').dispatchEvent(new window.Event('click'));
  assert.equal(store.project.scenes.length, scenesBefore + 1);
  assert.equal(store.project.scenes.length, 3);
});

test('play mode starts the runtime and stop returns to editing', { skip: !available ? 'jsdom not installed' : false }, async () => {
  const { document, window } = await boot();
  const { store } = window.appjet;

  document.getElementById('btn-play').dispatchEvent(new window.Event('click'));
  await new Promise((r) => setTimeout(r, 120));

  const engine = window.appjet.engine;
  assert.ok(engine, 'engine should be running');
  assert.equal(engine.running, true);
  assert.ok(engine.instances.length > 5, 'runtime should instantiate the scene');
  assert.equal(document.getElementById('play-badge').hidden, false);

  document.getElementById('btn-stop').dispatchEvent(new window.Event('click'));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(window.appjet.engine, null);
  assert.equal(document.getElementById('play-badge').hidden, true);
  assert.ok(store.scene(), 'editor scene should be untouched');
});

test('exported JSON round-trips through import', { skip: !available ? 'jsdom not installed' : false }, async () => {
  const { window } = await boot();
  const { store } = window.appjet;

  const json = store.exportJSON();
  const parsed = JSON.parse(json);
  assert.equal(parsed.scenes.length, 2);
  store.reset(false);
  assert.equal(store.project.scenes.length, 1);
  store.importJSON(json);
  assert.equal(store.project.scenes.length, 2);
  assert.equal(store.scene().nodes.length, parsed.scenes[0].nodes.length);
});
