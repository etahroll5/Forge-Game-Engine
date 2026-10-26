// Console dock: editor messages, runtime logs and script errors.

import { el, clear } from '../util.js';
import { logs, subscribeLogs, clearLogs, formatTime } from '../console.js';

export function initConsolePanel(rootEl, badgeEl) {
  let unread = 0;
  let visible = false;

  const toolbar = el('div', { class: 'dock-toolbar' }, [
    el('button', {
      class: 'btn tiny',
      text: 'Clear',
      on: {
        click: () => {
          clearLogs();
          unread = 0;
          updateBadge();
        },
      },
    }),
  ]);
  const list = el('div', { class: 'console' });
  rootEl.append(toolbar, list);

  function updateBadge() {
    if (!badgeEl) return;
    badgeEl.hidden = unread === 0;
    badgeEl.textContent = String(unread);
  }

  function appendLine(entry) {
    if (!entry) return;
    const line = el('div', { class: `log-line ${entry.level}` }, [
      el('span', { class: 't', text: formatTime(entry.t) }),
      el('span', { text: entry.message }),
    ]);
    list.appendChild(line);
    while (list.children.length > 300) list.removeChild(list.firstChild);
    if (!visible) {
      unread += 1;
      updateBadge();
    }
    rootEl.scrollTop = rootEl.scrollHeight;
  }

  function renderAll() {
    clear(list);
    for (const entry of logs) appendLine(entry);
  }

  subscribeLogs((entry) => {
    if (!entry) {
      clear(list);
      return;
    }
    appendLine(entry);
  });

  renderAll();

  return {
    render: renderAll,
    setVisible(value) {
      visible = value;
      if (value) {
        unread = 0;
        updateBadge();
        rootEl.scrollTop = rootEl.scrollHeight;
      }
    },
  };
}
