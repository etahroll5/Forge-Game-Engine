// Scene variables panel.

import { el, clear, num } from '../util.js';

export function initVarsPanel(rootEl, store) {
  function render() {
    clear(rootEl);
    const scene = store.scene();
    const entries = Object.entries(scene.vars || {});

    rootEl.appendChild(
      el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' } }, [
        el('span', { style: { color: '#5f7291', fontSize: '11px' }, text: `Variables on “${scene.name}” — usable in events and scripts` }),
        el('button', {
          class: 'btn tiny primary',
          text: '+ Add variable',
          style: { marginLeft: 'auto' },
          on: {
            click: () => {
              let i = 1;
              let name = 'variable';
              while (name in (scene.vars || {})) name = `variable${++i}`;
              store.setVariable(name, 0);
            },
          },
        }),
      ]),
    );

    if (!entries.length) {
      rootEl.appendChild(el('div', { class: 'tree-empty', text: 'No variables yet.' }));
      return;
    }

    for (const [name, value] of entries) {
      const nameInput = el('input', { type: 'text', value: name });
      nameInput.addEventListener('change', () => {
        const next = nameInput.value.trim();
        if (!next || next === name) {
          nameInput.value = name;
          return;
        }
        store.setVariable(next, value, name);
      });

      const isNumber = typeof value === 'number';
      const valueInput = el('input', { type: isNumber ? 'number' : 'text', value: String(value) });
      valueInput.addEventListener('change', () => {
        const raw = valueInput.value;
        store.setVariable(name, isNumber ? num(raw, 0) : raw);
      });

      rootEl.appendChild(
        el('div', { class: 'var-row' }, [
          nameInput,
          valueInput,
          el('button', {
            class: 'row-x',
            text: '×',
            title: 'Delete variable',
            on: { click: () => store.removeVariable(name) },
          }),
        ]),
      );
    }
  }

  store.subscribe((reason) => {
    if (reason === 'transform') return;
    render();
  });
  render();
  return { render };
}
