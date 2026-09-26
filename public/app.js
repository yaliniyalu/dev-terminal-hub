const socket = io();

const elements = {
  appTitle: document.getElementById('appTitle'),
  configPath: document.getElementById('configPath'),
  commandCount: document.getElementById('commandCount'),
  commandList: document.getElementById('commandList'),
  activeName: document.getElementById('activeName'),
  activeMeta: document.getElementById('activeMeta'),
  activeStatus: document.getElementById('activeStatus'),
  notice: document.getElementById('notice'),
  noticeText: document.getElementById('noticeText'),
  noticeCloseBtn: document.getElementById('noticeCloseBtn'),
  runAllBtn: document.getElementById('runAllBtn'),
  stopAllBtn: document.getElementById('stopAllBtn'),
  restartAllBtn: document.getElementById('restartAllBtn'),
  reloadConfigBtn: document.getElementById('reloadConfigBtn'),
  globalMenuBtn: document.getElementById('globalMenuBtn'),
  globalMenu: document.getElementById('globalMenu'),
  termRunBtn: document.getElementById('termRunBtn'),
  termStopBtn: document.getElementById('termStopBtn'),
  termRestartBtn: document.getElementById('termRestartBtn'),
  termScrollBtn: document.getElementById('termScrollBtn'),
  termUrlActions: document.getElementById('termUrlActions'),
  terminalMount: document.getElementById('terminal'),
  themeTglBtn: document.getElementById('themeTglBtn'),
  viewTerminalBtn: document.getElementById('viewTerminalBtn'),
  viewOverviewBtn: document.getElementById('viewOverviewBtn'),
  terminalPanel: document.getElementById('terminal-panel'),
  overviewPanel: document.getElementById('overview-panel'),
  overviewGrid: document.getElementById('overviewGrid')
};

const term = new Terminal({
  cursorBlink: true,
  fontFamily: 'IBM Plex Mono, Consolas, monospace',
  fontSize: 13,
  theme: {
    background: '#0f1722'
  }
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(elements.terminalMount);
fitAddon.fit();

const state = {
  global: {},
  configPath: '',
  commands: new Map(),
  selectedId: null,
  view: 'terminal',
  miniTerms: new Map(),
  theme: localStorage.getItem('theme') || 'dark',
  noticeTimeout: null
};

function stripAnsi(str) {
  if (!str) return '';
  return str
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/\x1B\]8;;[^\x1B\x07]*(\x1B\\|\x07)/g, '');
}

function isLocalhost(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

function extractUrls(output) {
  if (!output) return [];
  const text = stripAnsi(output);
  const regex = /https?:\/\/[^\s'"<>`()[\]{}]+/gi;
  const rawMatches = text.match(regex) || [];

  const uniqueUrls = [];
  const seen = new Set();

  for (let raw of rawMatches) {
    const cleaned = raw.replace(/[.,;:!?)]+$/, '');
    try {
      const parsed = new URL(cleaned);
      if (!seen.has(parsed.href)) {
        seen.add(parsed.href);
        uniqueUrls.push(parsed.href);
      }
    } catch {
      // Ignore invalid URL
    }
  }

  // Sort so localhost/127.0.0.1 URLs come first as default
  uniqueUrls.sort((a, b) => {
    const aIsLocal = isLocalhost(a);
    const bIsLocal = isLocalhost(b);
    if (aIsLocal && !bIsLocal) return -1;
    if (!aIsLocal && bIsLocal) return 1;
    return 0;
  });

  return uniqueUrls;
}

function openAllUrls(urls) {
  if (!urls || !urls.length) return;
  urls.forEach((url) => {
    window.open(url, '_blank');
  });
  setNotice(`Opened ${urls.length} URLs in browser tabs.`);
}

function renderUrlActions(container, urls, isMini = false) {
  if (!container) return;
  container.innerHTML = '';

  if (!urls || urls.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'inline-flex';

  const defaultUrl = urls[0];

  if (urls.length === 1) {
    // Single URL button
    const btn = document.createElement('a');
    btn.href = defaultUrl;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.className = `btn btn-term btn-url ${isMini ? 'btn-url-mini' : ''}`;
    btn.title = `Open ${defaultUrl}`;

    btn.innerHTML = `
      <svg class="url-btn-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
      <span>Open URL</span>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    container.appendChild(btn);
  } else {
    // Multiple URLs: Split Button
    const splitGroup = document.createElement('div');
    splitGroup.className = `url-split-group ${isMini ? 'url-split-mini' : ''}`;

    // Main button (opens default URL e.g. localhost)
    const mainBtn = document.createElement('a');
    mainBtn.href = defaultUrl;
    mainBtn.target = '_blank';
    mainBtn.rel = 'noopener noreferrer';
    mainBtn.className = `btn btn-term btn-url btn-split-main ${isMini ? 'btn-url-mini' : ''}`;
    mainBtn.title = `Open default URL: ${defaultUrl}`;
    mainBtn.innerHTML = `
      <svg class="url-btn-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
      <span>Open URL</span>
    `;
    mainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Arrow wrapper (hovering or clicking only on arrow area controls the popover)
    const arrowWrap = document.createElement('div');
    arrowWrap.className = 'url-split-arrow-wrap';

    // Arrow button: toggles the popover dropdown menu to select links or open all
    const arrowBtn = document.createElement('button');
    arrowBtn.type = 'button';
    arrowBtn.className = `btn btn-term btn-url btn-split-arrow ${isMini ? 'btn-url-mini' : ''}`;
    arrowBtn.title = `Show URLs / Options (${urls.length})`;
    arrowBtn.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

    // Dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'url-dropdown-menu';

    // Dropdown item: Open All URLs
    const openAllBtn = document.createElement('button');
    openAllBtn.type = 'button';
    openAllBtn.className = 'url-dropdown-item url-dropdown-item-all';
    openAllBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      <div class="url-dropdown-text">
        <strong>Open All URLs (${urls.length})</strong>
      </div>
    `;
    openAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      arrowWrap.classList.remove('menu-open');
      openAllUrls(urls);
    });

    dropdown.appendChild(openAllBtn);

    // Divider
    const divider = document.createElement('div');
    divider.className = 'url-dropdown-divider';
    dropdown.appendChild(divider);

    // List each URL item
    urls.forEach((url, i) => {
      const item = document.createElement('a');
      item.href = url;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
      item.className = 'url-dropdown-item';

      item.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        <span class="url-dropdown-link-text">${url}</span>
        ${i === 0 ? '<span class="url-default-badge">default</span>' : ''}
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        arrowWrap.classList.remove('menu-open');
      });

      dropdown.appendChild(item);
    });

    // Arrow button click toggles the popover
    arrowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close any other open menus first
      document.querySelectorAll('.url-split-arrow-wrap.menu-open').forEach((el) => {
        if (el !== arrowWrap) el.classList.remove('menu-open');
      });
      arrowWrap.classList.toggle('menu-open');
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    arrowWrap.append(arrowBtn, dropdown);
    splitGroup.append(mainBtn, arrowWrap);
    container.appendChild(splitGroup);
  }
}

function updateActiveUrlActions(output) {
  if (!elements.termUrlActions) return;
  const urls = extractUrls(output);
  const key = urls.join('|');
  const existingWrap = elements.termUrlActions.querySelector('.url-split-arrow-wrap');
  const wasOpen = existingWrap ? existingWrap.classList.contains('menu-open') : false;
  if (elements.termUrlActions.dataset.lastUrlsKey === key) {
    return;
  }
  elements.termUrlActions.dataset.lastUrlsKey = key;
  renderUrlActions(elements.termUrlActions, urls);
  if (wasOpen) {
    const newWrap = elements.termUrlActions.querySelector('.url-split-arrow-wrap');
    if (newWrap) newWrap.classList.add('menu-open');
  }
}

function setNotice(message) {
  // Clear any pending auto-dismiss
  if (state.noticeTimeout) {
    clearTimeout(state.noticeTimeout);
    state.noticeTimeout = null;
  }
  elements.noticeText.textContent = message || 'Ready';
  elements.notice.classList.add('visible');
  // Auto-dismiss after 4 seconds (only if message is not 'Ready')
  if (message && message !== 'Ready') {
    state.noticeTimeout = setTimeout(() => {
      elements.notice.classList.remove('visible');
      state.noticeTimeout = null;
    }, 4000);
  }
}

function statusClass(status) {
  const safe = status || 'stopped';
  return `status-${safe}`;
}

function ensureSelection() {
  if (state.selectedId && state.commands.has(state.selectedId)) {
    return;
  }
  const first = state.commands.values().next().value;
  state.selectedId = first ? first.id : null;
}

function writeActiveTerminal() {
  term.reset();
  const active = state.commands.get(state.selectedId);
  if (!active) {
    term.writeln('No command selected.');
    return;
  }
  if (active.output) {
    term.write(active.output);
  } else {
    term.writeln(`${active.name} has no output yet.`);
  }
  scrollTerminalToBottom(term);
}

function renderHeader() {
  elements.appTitle.textContent = state.global.title || 'Terminal Manager';
  elements.configPath.textContent = state.configPath ? `Config: ${state.configPath}` : 'Config not loaded';
  elements.commandCount.textContent = `${state.commands.size} commands`;

  const active = state.commands.get(state.selectedId);

  if (!active) {
    elements.activeName.textContent = 'No command selected';
    elements.activeMeta.textContent = 'Select a command on the left.';
    elements.activeStatus.textContent = 'stopped';
    elements.termRunBtn.disabled = true;
    elements.termStopBtn.disabled = true;
    elements.termRestartBtn.disabled = true;
    if (elements.termUrlActions) {
      elements.termUrlActions.style.display = 'none';
      elements.termUrlActions.innerHTML = '';
      elements.termUrlActions.dataset.lastUrlsKey = '';
    }
    return;
  }

  elements.activeName.textContent = active.name;
  elements.activeMeta.textContent = active.command;
  elements.activeStatus.textContent = active.status;

  const s = active.status;
  const isStarting = s === 'starting';
  const isStopped = s === 'stopped' || s === 'error';

  elements.termRunBtn.disabled = !isStopped;
  elements.termStopBtn.disabled = isStopped;
  elements.termRestartBtn.disabled = isStarting || isStopped;

  updateActiveUrlActions(active.output);
}

function button(label, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-mini ${className}`;
  btn.textContent = label;
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return btn;
}

function renderCommandList() {
  elements.commandList.innerHTML = '';

  for (const command of state.commands.values()) {
    const item = document.createElement('div');
    item.className = `command-item${state.selectedId === command.id ? ' active' : ''}`;
    item.addEventListener('click', () => {
      state.selectedId = command.id;
      render();
      writeActiveTerminal();
      fitAddon.fit();
    });

    const title = document.createElement('div');
    title.className = 'command-title';

    const name = document.createElement('div');
    name.className = 'command-name';
    name.textContent = command.name;

    const pill = document.createElement('div');
    pill.className = `status-pill ${statusClass(command.status)}`;

    const dot = document.createElement('span');
    dot.className = 'status-dot';

    const statusText = document.createElement('span');
    statusText.textContent = command.status;

    pill.append(dot, statusText);
    title.append(name, pill);

    const meta = document.createElement('div');
    meta.className = 'command-meta';
    meta.textContent = command.command;

    item.append(title, meta);
    elements.commandList.append(item);
  }
}

function mergeCommand(command) {
  if (!command || !command.id) {
    return;
  }
  state.commands.set(command.id, {
    ...state.commands.get(command.id),
    ...command
  });
}

function scrollTerminalToBottom(terminal) {
  try {
    terminal.scrollToBottom();
  } catch (e) {
    // fallback if scrollToBottom not available
  }
}

function applyTheme(themeName) {
  state.theme = themeName;
  localStorage.setItem('theme', themeName);
  if (themeName === 'dark') {
    document.body.classList.add('dark-mode');
    elements.themeTglBtn.textContent = '☀️ Light Mode';
  } else {
    document.body.classList.remove('dark-mode');
    elements.themeTglBtn.textContent = '🌙 Dark Mode';
  }
}

function toggleTheme() {
  const newTheme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

function switchView(v) {
  state.view = v;
  const isTerminal = v === 'terminal';
  elements.terminalPanel.hidden = !isTerminal;
  elements.overviewPanel.hidden = isTerminal;
  elements.viewTerminalBtn.classList.toggle('active', isTerminal);
  elements.viewOverviewBtn.classList.toggle('active', !isTerminal);
  if (isTerminal) {
    fitAddon.fit();
    scrollTerminalToBottom(term);
  }
}

function renderOverview() {
  elements.overviewGrid.innerHTML = '';

  // Dispose old mini terminals
  state.miniTerms.forEach(t => t.dispose());
  state.miniTerms.clear();

  for (const cmd of state.commands.values()) {
    const card = document.createElement('div');
    card.className = 'overview-card';
    card.style.cursor = 'pointer';
    card.style.transition = 'transform 0.18s ease, box-shadow 0.18s ease';

    const header = document.createElement('div');
    header.className = 'overview-card-header';

    const name = document.createElement('div');
    name.className = 'overview-card-name';
    name.textContent = cmd.name;

    const pill = document.createElement('div');
    pill.className = `status-pill ${statusClass(cmd.status)}`;
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    const statusText = document.createElement('span');
    statusText.textContent = cmd.status;
    pill.append(dot, statusText);

    header.append(name, pill);

    // Create mini terminal
    const miniTermMount = document.createElement('div');
    miniTermMount.className = 'overview-card-mini-terminal';

    const miniTerm = new Terminal({
      cursorBlink: false,
      fontFamily: 'IBM Plex Mono, Consolas, monospace',
      fontSize: 10,
      rows: 4,
      cols: 24,
      theme: {
        background: '#0f1722'
      }
    });
    miniTerm.open(miniTermMount);

    // Write command output to mini terminal
    if (cmd.output) {
      miniTerm.write(cmd.output);
    } else {
      miniTerm.writeln('[No output yet]');
    }

    // Scroll mini terminal to bottom
    scrollTerminalToBottom(miniTerm);

    // Store mini terminal reference
    state.miniTerms.set(cmd.id, miniTerm);

    // Make card clickable to open terminal and select command
    card.addEventListener('click', (e) => {
      // Don't trigger on button clicks
      if (e.target.closest('.overview-card-actions')) {
        return;
      }
      state.selectedId = cmd.id;
      switchView('terminal');
      render();
      writeActiveTerminal();
    });

    // Hover effect
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 8px 24px rgba(9, 26, 43, 0.12)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '0 4px 16px rgba(9, 26, 43, 0.08)';
    });

    const actions = document.createElement('div');
    actions.className = 'overview-card-actions';

    const s = cmd.status;
    const isStarting = s === 'starting';
    const isStopped = s === 'stopped' || s === 'error';

    const cardUrls = extractUrls(cmd.output);
    if (cardUrls.length > 0) {
      const cardUrlContainer = document.createElement('div');
      cardUrlContainer.className = 'url-actions-container overview-url-actions';
      renderUrlActions(cardUrlContainer, cardUrls, true);
      actions.append(cardUrlContainer);
    }

    const runBtn = button('Run', 'btn-term', () => socket.emit('command:run', { id: cmd.id }));
    runBtn.disabled = !isStopped;

    const stopBtn = button('Stop', 'btn-term', () => socket.emit('command:stop', { id: cmd.id }));
    stopBtn.disabled = isStopped;

    const restartBtn = button('Restart', 'btn-term', () => socket.emit('command:restart', { id: cmd.id }));
    restartBtn.disabled = isStarting || isStopped;

    actions.append(runBtn, stopBtn, restartBtn);
    card.append(header, miniTermMount, actions);
    elements.overviewGrid.append(card);
  }
}

function render() {
  ensureSelection();
  renderHeader();
  renderCommandList();
  renderOverview();
}

socket.on('state:snapshot', (payload) => {
  state.global = payload.global || {};
  state.configPath = payload.configPath || '';
  state.commands = new Map();

  for (const command of payload.commands || []) {
    mergeCommand(command);
  }

  render();
  writeActiveTerminal();
  setNotice('');
});

socket.on('command:status', (command) => {
  mergeCommand(command);
  render();

  if (state.selectedId === command.id) {
    writeActiveTerminal();
  }
});

socket.on('command:output', ({ id, data }) => {
  const command = state.commands.get(id);
  if (!command) {
    return;
  }

  command.output = `${command.output || ''}${data || ''}`;
  mergeCommand(command);

  if (state.selectedId === id) {
    term.write(data);
    scrollTerminalToBottom(term);
    updateActiveUrlActions(command.output);
  }

  // Update mini terminal if it exists
  const miniTerm = state.miniTerms.get(id);
  if (miniTerm) {
    miniTerm.write(data);
    scrollTerminalToBottom(miniTerm);
  }
});

socket.on('operation:error', ({ message }) => {
  setNotice(message || 'Operation failed.');
});



// Terminal header buttons — operate on the currently selected command
elements.termRunBtn.addEventListener('click', () => {
  if (state.selectedId) socket.emit('command:run', { id: state.selectedId });
});

elements.termStopBtn.addEventListener('click', () => {
  if (state.selectedId) socket.emit('command:stop', { id: state.selectedId });
});

elements.termRestartBtn.addEventListener('click', () => {
  if (state.selectedId) socket.emit('command:restart', { id: state.selectedId });
});

// Gear popover toggle
elements.globalMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  elements.globalMenu.classList.toggle('open');
});

document.addEventListener('click', () => {
  elements.globalMenu.classList.remove('open');
  document.querySelectorAll('.url-split-arrow-wrap.menu-open').forEach((el) => {
    el.classList.remove('menu-open');
  });
});

elements.globalMenu.addEventListener('click', (e) => {
  e.stopPropagation();
});

elements.runAllBtn.addEventListener('click', () => {
  socket.emit('commands:runAll');
  setNotice('Requested: run all commands.');
});

elements.stopAllBtn.addEventListener('click', () => {
  socket.emit('commands:stopAll');
  setNotice('Requested: stop all commands.');
});

elements.restartAllBtn.addEventListener('click', () => {
  socket.emit('commands:restartAll');
  setNotice('Requested: restart all commands.');
});

elements.reloadConfigBtn.addEventListener('click', () => {
  socket.emit('config:reload');
  setNotice('Reloading config: stopping all commands first...');
});

window.addEventListener('resize', () => {
  fitAddon.fit();
});

elements.viewTerminalBtn.addEventListener('click', () => switchView('terminal'));
elements.viewOverviewBtn.addEventListener('click', () => switchView('overview'));

elements.termScrollBtn.addEventListener('click', () => scrollTerminalToBottom(term));

elements.themeTglBtn.addEventListener('click', () => {
  toggleTheme();
});

// Initialize theme
applyTheme(state.theme);

// Notice close button
elements.noticeCloseBtn.addEventListener('click', () => {
  elements.notice.classList.remove('visible');
  if (state.noticeTimeout) {
    clearTimeout(state.noticeTimeout);
    state.noticeTimeout = null;
  }
});
