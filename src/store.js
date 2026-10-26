// ============================================================================
// Central editor store: current project, selection, undo/redo history,
// localStorage persistence and change notifications.
// ============================================================================

import { uid } from './util.js';
import {
  createProject,
  createScene,
  normalizeProject,
  findNode,
  findEntry,
  removeNode as removeNodeModel,
  insertNode,
  addNode as addNodeModel,
  duplicateNode as duplicateNodeModel,
  moveNode as moveNodeModel,
  STORAGE_KEY,
} from './project.js';
import { defaultProject } from './demo.js';
import { logInfo, logWarn, logError } from './console.js';

class Store {
  constructor() {
    this.project = defaultProject();
    this.sceneId = this.project.scenes[0].id;
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.subs = new Set();
    this.saveTimer = null;
    this.playing = false;
  }

  // ---------------------------------------------------------------- reading
  scene() {
    return this.project.scenes.find((s) => s.id === this.sceneId) || this.project.scenes[0];
  }

  sceneById(id) {
    return this.project.scenes.find((s) => s.id === id) || null;
  }

  selected() {
    return findNode(this.scene().nodes, this.selectedId);
  }

  selectedEntry() {
    return findEntry(this.scene().nodes, this.selectedId);
  }

  // ----------------------------------------------------------- subscription
  subscribe(fn) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  emit(reason = 'change') {
    for (const fn of this.subs) {
      try {
        fn(reason);
      } catch (err) {
        logError(`UI error (${reason}): ${err.message}`);
      }
    }
  }

  // -------------------------------------------------------------- selection
  select(id, reason = 'select') {
    this.selectedId = id || null;
    this.emit(reason);
  }

  setScene(id) {
    if (!this.sceneById(id)) return;
    this.sceneId = id;
    this.selectedId = null;
    this.emit('scene');
  }

  // ---------------------------------------------------------------- history
  snapshot() {
    return JSON.stringify({
      name: this.project.name,
      version: this.project.version,
      scenes: this.project.scenes,
      settings: this.project.settings,
    });
  }

  restore(snapshot) {
    const data = JSON.parse(snapshot);
    const assets = this.project.assets;
    this.project = { ...data, assets };
    if (!this.sceneById(this.sceneId)) this.sceneId = this.project.scenes[0].id;
    if (this.selectedId && !findNode(this.scene().nodes, this.selectedId)) this.selectedId = null;
    this.queueSave();
    this.emit('change');
  }

  /** Record the current state before a burst of mutations (e.g. drag). */
  beginBatch() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack = [];
  }

  commit(_label, fn) {
    const before = this.snapshot();
    const result = fn();
    if (this.snapshot() !== before) {
      this.undoStack.push(before);
      if (this.undoStack.length > 120) this.undoStack.shift();
      this.redoStack = [];
      this.queueSave();
    }
    this.emit('change');
    return result;
  }

  /** Mutate during a batch started with beginBatch() — no new history entry. */
  type(_label) {
    this.queueSave();
    this.emit('transform');
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.undoStack.length) {
      logWarn('Nothing to undo');
      return false;
    }
    this.redoStack.push(this.snapshot());
    const snapshot = this.undoStack.pop();
    this.restore(snapshot);
    logInfo('Undo');
    return true;
  }

  redo() {
    if (!this.redoStack.length) {
      logWarn('Nothing to redo');
      return false;
    }
    this.undoStack.push(this.snapshot());
    const snapshot = this.redoStack.pop();
    this.restore(snapshot);
    logInfo('Redo');
    return true;
  }

  // ------------------------------------------------------------- node edits
  addNode(type, parentId = null, overrides = {}) {
    return this.commit('add node', () => {
      const scene = this.scene();
      const node = addNodeModel(scene, type, parentId, overrides);
      this.selectedId = node.id;
      return node;
    });
  }

  removeNode(id = this.selectedId) {
    if (!id) return false;
    return this.commit('delete node', () => {
      const removed = removeNodeModel(this.scene(), id);
      if (removed) this.selectedId = null;
      return Boolean(removed);
    });
  }

  duplicateNode(id = this.selectedId) {
    if (!id) return null;
    return this.commit('duplicate node', () => {
      const copy = duplicateNodeModel(this.scene(), id);
      if (copy) this.selectedId = copy.id;
      return copy;
    });
  }

  moveNode(id, parentId, index = null) {
    return this.commit('reparent', () => moveNodeModel(this.scene(), id, parentId, index));
  }

  setNode(id, key, value) {
    return this.commit('set property', () => {
      const node = findNode(this.scene().nodes, id);
      if (!node) return false;
      node[key] = value;
      return true;
    });
  }

  // ------------------------------------------------------------ scene edits
  addScene(name) {
    return this.commit('add scene', () => {
      const scene = createScene(name || `Scene ${this.project.scenes.length + 1}`);
      this.project.scenes.push(scene);
      this.sceneId = scene.id;
      this.selectedId = null;
      return scene;
    });
  }

  removeScene(id) {
    if (this.project.scenes.length <= 1) {
      logWarn('A project needs at least one scene');
      return false;
    }
    return this.commit('delete scene', () => {
      const idx = this.project.scenes.findIndex((s) => s.id === id);
      if (idx < 0) return false;
      this.project.scenes.splice(idx, 1);
      if (this.sceneId === id) {
        this.sceneId = this.project.scenes[Math.max(0, idx - 1)].id;
        this.selectedId = null;
      }
      return true;
    });
  }

  renameScene(id, name) {
    return this.commit('rename scene', () => {
      const scene = this.sceneById(id);
      if (!scene) return false;
      scene.name = name;
      return true;
    });
  }

  setSceneSetting(key, value) {
    return this.commit('scene setting', () => {
      this.scene()[key] = value;
      return true;
    });
  }

  setProjectSetting(key, value) {
    return this.commit('project setting', () => {
      this.project.settings[key] = value;
      return true;
    });
  }

  // ----------------------------------------------------------- event sheet
  addEvent(event) {
    return this.commit('add event', () => {
      this.scene().events.push(event);
      return event;
    });
  }

  removeEvent(id) {
    return this.commit('delete event', () => {
      const events = this.scene().events;
      const idx = events.findIndex((e) => e.id === id);
      if (idx < 0) return false;
      events.splice(idx, 1);
      return true;
    });
  }

  moveEvent(id, delta) {
    return this.commit('reorder event', () => {
      const events = this.scene().events;
      const idx = events.findIndex((e) => e.id === id);
      const next = idx + delta;
      if (idx < 0 || next < 0 || next >= events.length) return false;
      const [event] = events.splice(idx, 1);
      events.splice(next, 0, event);
      return true;
    });
  }

  updateEvent(id, fn) {
    return this.commit('edit event', () => {
      const event = this.scene().events.find((e) => e.id === id);
      if (!event) return false;
      fn(event);
      return true;
    });
  }

  // -------------------------------------------------------------- variables
  setVariable(name, value, previousName) {
    return this.commit('set variable', () => {
      const vars = this.scene().vars;
      if (previousName && previousName !== name && previousName in vars) delete vars[previousName];
      vars[name] = value;
      return true;
    });
  }

  removeVariable(name) {
    return this.commit('delete variable', () => {
      delete this.scene().vars[name];
      return true;
    });
  }

  // ----------------------------------------------------------------- assets
  addAsset(name, dataUrl, meta = {}) {
    const id = uid('as');
    this.project.assets[id] = { id, name, dataUrl, ...meta };
    this.queueSave();
    this.emit('change');
    return id;
  }

  removeAsset(id) {
    delete this.project.assets[id];
    this.queueSave();
    this.emit('change');
  }

  // ------------------------------------------------------------ persistence
  queueSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 500);
  }

  save(silent = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      if (!silent) logInfo('Project saved to this browser');
      return true;
    } catch (err) {
      if (!silent) logError(`Could not save: ${err.message}`);
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const project = normalizeProject(JSON.parse(raw));
      this.project = project;
      this.sceneId = project.scenes[0].id;
      this.selectedId = null;
      this.undoStack = [];
      this.redoStack = [];
      return true;
    } catch (err) {
      logWarn(`Saved project could not be loaded: ${err.message}`);
      return false;
    }
  }

  hasSaved() {
    try {
      return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch {
      return false;
    }
  }

  reset(toDemo = true) {
    this.project = toDemo ? defaultProject() : createProject();
    this.sceneId = this.project.scenes[0].id;
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.queueSave();
    this.emit('change');
    return this.project;
  }

  importJSON(text) {
    const project = normalizeProject(JSON.parse(text));
    this.project = project;
    this.sceneId = project.scenes[0].id;
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.queueSave();
    this.emit('change');
    logInfo(`Imported "${project.name}" (${project.scenes.length} scene(s))`);
    return project;
  }

  exportJSON() {
    return JSON.stringify(this.project, null, 2);
  }

  /** Copy of the scene for the runtime so play mode never mutates the project. */
  sceneForRuntime(sceneId = this.sceneId) {
    return JSON.parse(JSON.stringify(this.sceneById(sceneId) || this.scene()));
  }

  insertExisting(node, parentId = null) {
    return this.commit('add node', () => {
      insertNode(this.scene(), node, parentId);
      this.selectedId = node.id;
      return node;
    });
  }
}

export const store = new Store();
