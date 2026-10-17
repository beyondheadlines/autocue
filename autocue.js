/**
 * BEYOND HEADLINES // AUTOCUE
 * Pure Black & White Installable Teleprompter Web App
 * Backed 100% by Neon Postgres Database (Multi-Device Real-Time Sync)
 *
 * Features:
 * - All documents & settings stored directly in Neon Postgres (`autocue_documents` & `autocue_settings`)
 * - Press Enter to Start / Stop scrolling
 * - While playing, clicking/tapping anywhere on the screen pauses immediately
 * - Flicker-free pointer-captured 2-Line Focus Slide Shade (remains visible while playing)
 * - Absolute Top Header & Bottom HUD Controls turn invisible while playing
 * - Tap & Hold (or Tab & Hold) to focus on the main content player part
 * - Up/Down arrows move text up/down; Left/Right arrows decrease/increase speed
 */

(() => {
  'use strict';

  // Neon Serverless Postgres Configuration (SQL-over-HTTP Protocol)
  const NEON_CONNECTION_URI =
    'postgresql://neondb_owner:npg_p9zU8rnvPiaD@ep-withered-base-a1nixm16-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
  const NEON_SQL_ENDPOINT =
    'https://ep-withered-base-a1nixm16-pooler.ap-southeast-1.aws.neon.tech/sql';

  const LINE_HEIGHT_RATIO = 1.42;

  const DEFAULT_SETTINGS = {
    activeDocId: 'doc-welcome',
    speed: 28,           // 1 - 100
    fontSize: 56,        // 22 - 130 (px)
    widthPercent: 72,    // 30 - 100 (%)
    mirrorX: false,
    mirrorY: false,
    shadeEnabled: true,
    shadeOpacity: 78,    // 20 - 95 (%)
    shadeTopPercent: 34  // 6 - 75 (% from top of stage)
  };

  // Application State (Synced with Neon Postgres Database)
  const state = {
    mode: 'prompter', // 'prompter' | 'editor'
    docs: [],
    searchQuery: '',
    ...DEFAULT_SETTINGS,

    // Playback & Scroll Physics
    isPlaying: false,
    playerFocused: false,
    scrollOffset: 0,
    targetScrollOffset: 0,
    maxScroll: 0,
    lastFrameTime: 0,

    // Shade dragging state
    isDraggingShade: false,
    justDraggedShade: false,

    // Database sync tracking
    isSyncing: false,
    schemaReady: false,
    settingsUpdatedAt: 0
  };

  const AUTHOR_STORAGE_KEY = 'bh_autocue_author_name';
  const SHORTCUTS_STORAGE_KEY = 'bh_autocue_custom_shortcuts_v1';

  // DOM Elements
  const dom = {
    topBar: document.getElementById('top-bar'),
    tabPrompter: document.getElementById('tab-prompter'),
    tabEditor: document.getElementById('tab-editor'),
    docCountBadge: document.getElementById('doc-count-badge'),
    quickDocSelect: document.getElementById('quick-doc-select'),
    btnQuickNewDoc: document.getElementById('btn-quick-new-doc'),
    btnSyncRefresh: document.getElementById('btn-sync-refresh'),
    syncDot: document.getElementById('sync-dot'),
    syncBtnLabel: document.getElementById('sync-btn-label'),
    btnShortcuts: document.getElementById('btn-shortcuts'),

    // Views
    viewPrompter: document.getElementById('view-prompter'),
    viewEditor: document.getElementById('view-editor'),

    // Prompter Stage
    prompterStage: document.getElementById('prompter-stage'),
    mirrorViewport: document.getElementById('mirror-viewport'),
    prompterColumn: document.getElementById('prompter-column'),
    prompterTrack: document.getElementById('prompter-track'),
    prompterText: document.getElementById('prompter-text'),

    // 2-Line Slide Shade
    focusShadeContainer: document.getElementById('focus-shade-container'),
    shadeTop: document.getElementById('shade-top'),
    shadeWindow: document.getElementById('shade-window'),
    shadeBottom: document.getElementById('shade-bottom'),
    shadeDragHandle: document.getElementById('shade-drag-handle'),

    // HUD Controls
    hudBar: document.getElementById('hud-bar'),
    progressBarTrack: document.getElementById('progress-bar-track'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    btnPlayPause: document.getElementById('btn-play-pause'),
    svgPlay: document.getElementById('svg-play'),
    svgPause: document.getElementById('svg-pause'),
    playBtnLabel: document.getElementById('play-btn-label'),
    btnReset: document.getElementById('btn-reset'),
    btnNudgeUp: document.getElementById('btn-nudge-up'),
    btnNudgeDown: document.getElementById('btn-nudge-down'),

    valSpeed: document.getElementById('val-speed'),
    sliderSpeed: document.getElementById('slider-speed'),
    btnSpeedDec: document.getElementById('btn-speed-dec'),
    btnSpeedInc: document.getElementById('btn-speed-inc'),

    valFontsize: document.getElementById('val-fontsize'),
    sliderFontsize: document.getElementById('slider-fontsize'),
    btnFontDec: document.getElementById('btn-font-dec'),
    btnFontInc: document.getElementById('btn-font-inc'),

    valWidth: document.getElementById('val-width'),
    sliderWidth: document.getElementById('slider-width'),
    btnWidthDec: document.getElementById('btn-width-dec'),
    btnWidthInc: document.getElementById('btn-width-inc'),

    valShade: document.getElementById('val-shade'),
    sliderShade: document.getElementById('slider-shade'),
    btnShadeToggle: document.getElementById('btn-shade-toggle'),
    btnShadeCenter: document.getElementById('btn-shade-center'),

    btnMirrorX: document.getElementById('btn-mirror-x'),
    btnMirrorY: document.getElementById('btn-mirror-y'),
    btnOpenEditorQuick: document.getElementById('btn-open-editor-quick'),
    btnFullscreen: document.getElementById('btn-fullscreen'),

    // Editor View & Mobile Sub-tabs
    btnMobileShowList: document.getElementById('btn-mobile-show-list'),
    btnMobileShowWrite: document.getElementById('btn-mobile-show-write'),
    mobileDocCount: document.getElementById('mobile-doc-count'),
    editorLayout: document.getElementById('editor-layout'),
    sidebarSyncSubtitle: document.getElementById('sidebar-sync-subtitle'),
    btnCreateDoc: document.getElementById('btn-create-doc'),
    inputSearchDocs: document.getElementById('input-search-docs'),
    docsList: document.getElementById('docs-list'),
    inputImportFile: document.getElementById('input-import-file'),
    btnExportDoc: document.getElementById('btn-export-doc'),
    inputDocTitle: document.getElementById('input-doc-title'),
    inputDocAuthor: document.getElementById('input-doc-author'),
    btnSaveDefaultAuthor: document.getElementById('btn-save-default-author'),
    saveStatusPill: document.getElementById('save-status-pill'),
    btnDuplicateDoc: document.getElementById('btn-duplicate-doc'),
    btnClearDoc: document.getElementById('btn-clear-doc'),
    btnDeleteDoc: document.getElementById('btn-delete-doc'),
    btnLaunchPrompter: document.getElementById('btn-launch-prompter'),
    textareaDocContent: document.getElementById('textarea-doc-content'),
    statAuthor: document.getElementById('stat-author'),
    statWords: document.getElementById('stat-words'),
    statChars: document.getElementById('stat-chars'),
    statLines: document.getElementById('stat-lines'),
    statReadtime: document.getElementById('stat-readtime'),
    statUpdated: document.getElementById('stat-updated'),

    // First-Time Author Modal
    authorModalBackdrop: document.getElementById('author-modal-backdrop'),
    authorSetupForm: document.getElementById('author-setup-form'),
    inputFirstTimeAuthor: document.getElementById('input-first-time-author'),

    // Shortcuts Modal
    modalBackdrop: document.getElementById('modal-backdrop'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnResetShortcuts: document.getElementById('btn-reset-shortcuts'),
    detectorStatusText: document.getElementById('detector-status-text'),
    detectorDetailRow: document.getElementById('detector-detail-row'),
    shortcutCaptureBanner: document.getElementById('shortcut-capture-banner'),
    shortcutCapturePrompt: document.getElementById('shortcut-capture-prompt'),
    btnCancelCapture: document.getElementById('btn-cancel-capture'),
    shortcutsListContainer: document.getElementById('shortcuts-list-container')
  };

  let saveIndicatorTimeout = null;
  let docSaveDebounceTimeout = null;
  let settingsSaveDebounceTimeout = null;
  let lastLocalEditTime = 0;
  let lastLocalSettingsTime = 0;
  let localMutationVersion = 0;
  let pendingSavesCount = 0;

  /* ========================================================================
     0. AUTHOR NAME MANAGEMENT (STORED IN LOCALSTORAGE FOR NEW DOC DEFAULT)
     ======================================================================== */
  function getDefaultAuthorName() {
    try {
      return (localStorage.getItem(AUTHOR_STORAGE_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  function saveDefaultAuthorName(name) {
    const clean = String(name || '').trim();
    try {
      if (clean) {
        localStorage.setItem(AUTHOR_STORAGE_KEY, clean);
      }
    } catch {
      // Ignore storage error
    }
    return clean;
  }

  function checkFirstTimeAuthorPrompt() {
    const savedAuthor = getDefaultAuthorName();
    if (!savedAuthor && dom.authorModalBackdrop) {
      dom.authorModalBackdrop.classList.remove('hidden');
      setTimeout(() => {
        dom.inputFirstTimeAuthor?.focus();
      }, 60);
    }
  }

  /* ========================================================================
     0B. CUSTOMIZABLE SHORTCUTS & LIVE REMOTE INPUT DETECTOR
     ======================================================================== */
  const SHORTCUT_ACTIONS_META = [
    {
      id: 'playPause',
      title: 'Start / Stop Teleprompter',
      defaults: [
        { token: 'Key:Enter', label: 'Enter' },
        { token: 'Mouse:0', label: 'Left Click' },
        { token: 'Key: ', label: 'Space' },
        { token: 'Key:MediaPlayPause', label: 'Media Play/Pause' },
        { token: 'KeyCode:23', label: 'Remote OK (23)' }
      ]
    },
    {
      id: 'nudgeUp',
      title: 'Move Text UP a bit',
      defaults: [{ token: 'Key:ArrowUp', label: '↑ Up Arrow' }]
    },
    {
      id: 'nudgeDown',
      title: 'Move Text DOWN a bit',
      defaults: [{ token: 'Key:ArrowDown', label: '↓ Down Arrow' }]
    },
    {
      id: 'speedDec',
      title: 'Decrease Scroll Speed',
      defaults: [{ token: 'Key:ArrowLeft', label: '← Left Arrow' }]
    },
    {
      id: 'speedInc',
      title: 'Increase Scroll Speed',
      defaults: [{ token: 'Key:ArrowRight', label: '→ Right Arrow' }]
    },
    {
      id: 'widthDec',
      title: 'Decrease Text Column Width',
      defaults: [{ token: 'Key:[', label: '[' }]
    },
    {
      id: 'widthInc',
      title: 'Increase Text Column Width',
      defaults: [{ token: 'Key:]', label: ']' }]
    },
    {
      id: 'fontDec',
      title: 'Decrease Font Size',
      defaults: [
        { token: 'Key:-', label: '−' },
        { token: 'Key:_', label: '_' }
      ]
    },
    {
      id: 'fontInc',
      title: 'Increase Font Size',
      defaults: [
        { token: 'Key:=', label: '=' },
        { token: 'Key:+', label: '+' }
      ]
    },
    {
      id: 'mirrorX',
      title: 'Toggle Horizontal Mirror',
      defaults: [{ token: 'Key:m', label: 'M' }]
    },
    {
      id: 'mirrorY',
      title: 'Toggle Vertical Flip',
      defaults: [{ token: 'Key:v', label: 'V' }]
    },
    {
      id: 'reset',
      title: 'Reset to Top of Script',
      defaults: [{ token: 'Key:r', label: 'R' }]
    },
    {
      id: 'editor',
      title: 'Toggle Script Studio Editor',
      defaults: [{ token: 'Key:e', label: 'E' }]
    },
    {
      id: 'fullscreen',
      title: 'Toggle Fullscreen',
      defaults: [{ token: 'Key:f', label: 'F' }]
    },
    {
      id: 'focusPlayer',
      title: 'Focus Main Player (Hide Header/Footer)',
      defaults: [
        { token: 'Hold:Touch', label: 'Tap & Hold' },
        { token: 'Hold:Tab', label: 'Tab & Hold' }
      ]
    }
  ];

  function getDefaultShortcutsMap() {
    const map = {};
    SHORTCUT_ACTIONS_META.forEach((action) => {
      map[action.id] = action.defaults.map((b) => ({ ...b }));
    });
    return map;
  }

  function loadShortcutsMap() {
    const defaults = getDefaultShortcutsMap();
    try {
      const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;
      SHORTCUT_ACTIONS_META.forEach((action) => {
        if (Array.isArray(parsed[action.id])) {
          defaults[action.id] = parsed[action.id].filter(
            (b) => b && typeof b.token === 'string' && typeof b.label === 'string'
          );
        }
      });
      return defaults;
    } catch {
      return defaults;
    }
  }

  function saveShortcutsMap() {
    try {
      localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(state.shortcuts));
    } catch {
      // Ignore storage error
    }
  }

  state.shortcuts = loadShortcutsMap();

  const captureState = {
    active: false,
    actionId: null,
    mode: 'add', // 'add' | 'replace'
    startedAt: 0
  };

  function isShortcutsModalOpen() {
    return Boolean(dom.modalBackdrop && !dom.modalBackdrop.classList.contains('hidden'));
  }

  function startShortcutCapture(actionId, mode = 'add') {
    const meta = SHORTCUT_ACTIONS_META.find((a) => a.id === actionId);
    if (!meta) return;
    captureState.active = true;
    captureState.actionId = actionId;
    captureState.mode = mode === 'replace' ? 'replace' : 'add';
    captureState.startedAt = performance.now();

    if (dom.shortcutCaptureBanner && dom.shortcutCapturePrompt) {
      dom.shortcutCaptureBanner.classList.remove('hidden');
      const verb = captureState.mode === 'replace' ? 'Replacing' : 'Adding to';
      dom.shortcutCapturePrompt.textContent = `${verb} "${meta.title}" — Press any key, mouse click, or remote button now…`;
    }
    renderShortcutsModal();
  }

  function cancelShortcutCapture() {
    captureState.active = false;
    captureState.actionId = null;
    if (dom.shortcutCaptureBanner) {
      dom.shortcutCaptureBanner.classList.add('hidden');
    }
    renderShortcutsModal();
  }

  function removeShortcutBinding(actionId, token) {
    if (!Array.isArray(state.shortcuts[actionId])) return;
    state.shortcuts[actionId] = state.shortcuts[actionId].filter((b) => b.token !== token);
    saveShortcutsMap();
    renderShortcutsModal();
  }

  function resetAllShortcutsToDefaults() {
    state.shortcuts = getDefaultShortcutsMap();
    saveShortcutsMap();
    cancelShortcutCapture();
    if (dom.detectorStatusText) {
      dom.detectorStatusText.textContent = '✓ Restored all default shortcuts';
    }
  }

  function updateLiveDetectorDisplay(signal) {
    if (!isShortcutsModalOpen() || !signal) return;
    if (dom.detectorStatusText) {
      dom.detectorStatusText.textContent = `Detected: ${signal.label} [${signal.token}]`;
    }
    if (dom.detectorDetailRow) {
      dom.detectorDetailRow.textContent = signal.rawSummary || `Token: ${signal.token}`;
    }
  }

  function handleIncomingSignalForModal(signal) {
    if (!isShortcutsModalOpen() || !signal) return false;
    updateLiveDetectorDisplay(signal);

    if (!captureState.active || !captureState.actionId) {
      return false;
    }

    // Ignore the pointer/click event that clicked the "+ Add" or "Replace" button itself
    if (performance.now() - captureState.startedAt < 180) {
      return false;
    }

    const actionId = captureState.actionId;
    const current = Array.isArray(state.shortcuts[actionId]) ? [...state.shortcuts[actionId]] : [];

    const newBinding = {
      token: signal.token,
      label: signal.label,
      altTokens: Array.isArray(signal.altTokens) ? signal.altTokens : []
    };

    if (captureState.mode === 'replace') {
      state.shortcuts[actionId] = [newBinding];
    } else {
      const exists = current.some((b) => b.token === newBinding.token);
      if (!exists) {
        current.push(newBinding);
      }
      state.shortcuts[actionId] = current;
    }

    saveShortcutsMap();
    cancelShortcutCapture();
    return true;
  }

  function renderShortcutsModal() {
    if (!dom.shortcutsListContainer) return;

    dom.shortcutsListContainer.innerHTML = SHORTCUT_ACTIONS_META.map((action) => {
      const bindings = state.shortcuts[action.id] || [];
      const isCapturingThis = captureState.active && captureState.actionId === action.id;

      const chipsHtml =
        bindings.length > 0
          ? bindings
              .map(
                (b) => `
              <span class="shortcut-chip">
                <span>${escapeHtml(b.label)}</span>
                <button
                  type="button"
                  class="shortcut-chip-remove"
                  data-remove-action="${escapeHtml(action.id)}"
                  data-remove-token="${escapeHtml(b.token)}"
                  title="Remove ${escapeHtml(b.label)}"
                  aria-label="Remove ${escapeHtml(b.label)}"
                >×</button>
              </span>
            `
              )
              .join('')
          : '<span class="shortcut-empty-label">No shortcut assigned</span>';

      return `
        <div class="shortcut-row ${isCapturingThis ? 'capturing' : ''}">
          <div class="shortcut-info-col">
            <span class="shortcut-action-title">${escapeHtml(action.title)}</span>
            <div class="shortcut-keys">${chipsHtml}</div>
          </div>
          <div class="shortcut-row-actions">
            <button
              type="button"
              class="shortcut-edit-btn ${isCapturingThis && captureState.mode === 'add' ? 'active' : ''}"
              data-capture-action="${escapeHtml(action.id)}"
              data-capture-mode="add"
              title="Add another key or remote button for ${escapeHtml(action.title)}"
            >+ Add</button>
            <button
              type="button"
              class="shortcut-edit-btn ${isCapturingThis && captureState.mode === 'replace' ? 'active' : ''}"
              data-capture-action="${escapeHtml(action.id)}"
              data-capture-mode="replace"
              title="Replace shortcut for ${escapeHtml(action.title)}"
            >Replace</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function buildSignalFromKeyboardEvent(e) {
    const rawKey = e.key || '';
    const rawCode = e.code || '';
    const rawKeyCode = Number(e.keyCode || e.which || 0);

    let normalizedKey = rawKey;
    if (rawKey.length === 1 && rawKey !== ' ') {
      normalizedKey = rawKey.toLowerCase();
    }

    let token = '';
    let label = '';
    const altTokens = [];

    if (rawKey && rawKey !== 'Unidentified' && rawKey !== 'Dead' && rawKey !== 'Process') {
      token = `Key:${normalizedKey}`;
      if (rawKey === ' ') label = 'Space';
      else if (rawKey === 'ArrowUp') label = '↑ Up Arrow';
      else if (rawKey === 'ArrowDown') label = '↓ Down Arrow';
      else if (rawKey === 'ArrowLeft') label = '← Left Arrow';
      else if (rawKey === 'ArrowRight') label = '→ Right Arrow';
      else if (rawKey.length === 1) label = rawKey.toUpperCase();
      else label = rawKey;

      if (rawCode) altTokens.push(`Code:${rawCode}`);
      if (rawKeyCode > 0) altTokens.push(`KeyCode:${rawKeyCode}`);
    } else if (rawCode) {
      token = `Code:${rawCode}`;
      label = `Key (${rawCode})`;
      if (rawKeyCode > 0) altTokens.push(`KeyCode:${rawKeyCode}`);
    } else if (rawKeyCode > 0) {
      token = `KeyCode:${rawKeyCode}`;
      label = `Remote Key (${rawKeyCode})`;
    } else {
      return null;
    }

    return {
      token,
      label,
      altTokens,
      rawSummary: `Type: ${e.type} | key: "${rawKey}" | code: "${rawCode}" | keyCode: ${rawKeyCode}`
    };
  }

  function buildSignalFromMouseButton(buttonNum, eventType = 'pointerdown') {
    const btn = buttonNum === undefined || buttonNum < 0 ? 0 : Number(buttonNum);
    const names = {
      0: 'Left Click',
      1: 'Middle Click',
      2: 'Right Click / Remote Back',
      3: 'Mouse Button 4 (Back)',
      4: 'Mouse Button 5 (Forward)'
    };
    const label = names[btn] || `Mouse Button ${btn}`;
    return {
      token: `Mouse:${btn}`,
      label,
      altTokens: [],
      rawSummary: `Type: ${eventType} | Mouse/Touchpad Button: ${btn} (${label})`
    };
  }

  function findActionMatchingSignal(signal) {
    if (!signal) return null;
    const candidateTokens = new Set([signal.token, ...(signal.altTokens || [])]);

    for (const action of SHORTCUT_ACTIONS_META) {
      const bindings = state.shortcuts[action.id] || [];
      for (const b of bindings) {
        if (candidateTokens.has(b.token)) {
          return action.id;
        }
        if (Array.isArray(b.altTokens) && b.altTokens.some((t) => candidateTokens.has(t))) {
          return action.id;
        }
      }
    }
    return null;
  }

  const REPEATABLE_SHORTCUT_ACTIONS = new Set([
    'nudgeUp',
    'nudgeDown',
    'speedDec',
    'speedInc',
    'widthDec',
    'widthInc',
    'fontDec',
    'fontInc'
  ]);

  let lastShortcutExecAt = 0;
  let lastShortcutExecToken = '';

  // Active press-and-hold repeat timers keyed by input token
  const activeHoldRepeats = new Map();

  function isRepeatableAction(actionId) {
    return REPEATABLE_SHORTCUT_ACTIONS.has(actionId);
  }

  function startHoldRepeat(actionId, token) {
    if (!isRepeatableAction(actionId) || !token) return;
    if (activeHoldRepeats.has(token)) return;

    const entry = {
      actionId,
      delayTimer: null,
      intervalTimer: null
    };

    entry.delayTimer = setTimeout(() => {
      entry.delayTimer = null;
      entry.intervalTimer = setInterval(() => {
        if (state.mode !== 'prompter' || isShortcutsModalOpen()) {
          stopHoldRepeat(token);
          return;
        }
        executeShortcutAction(actionId, token, true);
      }, 70);
    }, 240);

    activeHoldRepeats.set(token, entry);
  }

  function stopHoldRepeat(token) {
    if (!token) return;
    const entry = activeHoldRepeats.get(token);
    if (!entry) return;
    if (entry.delayTimer) clearTimeout(entry.delayTimer);
    if (entry.intervalTimer) clearInterval(entry.intervalTimer);
    activeHoldRepeats.delete(token);
  }

  function stopAllHoldRepeats() {
    for (const token of activeHoldRepeats.keys()) {
      stopHoldRepeat(token);
    }
  }

  function executeShortcutAction(actionId, token = '', isRepeatTick = false) {
    const now = performance.now();
    // Prevent duplicate firing when both keydown and keyup or pointerup and click fire for the same remote button press
    if (actionId === 'playPause' && now - lastShortcutExecAt < 220) {
      return true;
    }
    if (!isRepeatTick && !isRepeatableAction(actionId) && token && token === lastShortcutExecToken && now - lastShortcutExecAt < 140) {
      return true;
    }
    lastShortcutExecAt = now;
    lastShortcutExecToken = token;

    switch (actionId) {
      case 'playPause':
        triggerPlayToggleDebounced();
        return true;
      case 'nudgeUp':
        moveTextVertical('up');
        return true;
      case 'nudgeDown':
        moveTextVertical('down');
        return true;
      case 'speedDec':
        setSpeed(state.speed - 2);
        return true;
      case 'speedInc':
        setSpeed(state.speed + 2);
        return true;
      case 'widthDec':
        setWidthPercent(state.widthPercent - 4);
        return true;
      case 'widthInc':
        setWidthPercent(state.widthPercent + 4);
        return true;
      case 'fontDec':
        setFontSize(state.fontSize - 4);
        return true;
      case 'fontInc':
        setFontSize(state.fontSize + 4);
        return true;
      case 'mirrorX':
        setMirror('x');
        return true;
      case 'mirrorY':
        setMirror('y');
        return true;
      case 'reset':
        resetPrompter();
        return true;
      case 'editor':
        setViewMode('editor');
        return true;
      case 'fullscreen':
        toggleFullscreen();
        return true;
      case 'focusPlayer':
        toggleMainPlayerFocus();
        return true;
      default:
        return false;
    }
  }

  // Poll Bluetooth Gamepad API (many Android Autocue / Ring / VR remotes connect as HID Gamepads)
  const prevGamepadState = {};
  function pollGamepadInputs() {
    if (!navigator.getGamepads) return;
    let gamepads;
    try {
      gamepads = navigator.getGamepads();
    } catch {
      return;
    }
    if (!gamepads) return;

    for (let g = 0; g < gamepads.length; g++) {
      const gp = gamepads[g];
      if (!gp) continue;
      const gpKey = `${gp.index}:${gp.id}`;
      if (!prevGamepadState[gpKey]) {
        prevGamepadState[gpKey] = { buttons: [], axes: [] };
      }
      const prev = prevGamepadState[gpKey];

      // Check buttons (supports press-and-hold auto-repeat)
      for (let b = 0; b < gp.buttons.length; b++) {
        const pressed = Boolean(gp.buttons[b] && (gp.buttons[b].pressed || gp.buttons[b].value > 0.5));
        const wasPressed = Boolean(prev.buttons[b]);
        prev.buttons[b] = pressed;
        const btnToken = `Gamepad:Btn${b}`;

        if (pressed && !wasPressed) {
          const signal = {
            token: btnToken,
            label: `Remote/Gamepad Btn ${b}`,
            altTokens: [],
            rawSummary: `Gamepad "${gp.id}" | Button ${b} pressed`
          };
          if (isShortcutsModalOpen()) {
            handleIncomingSignalForModal(signal);
          } else if (state.mode === 'prompter') {
            const matchedAction = findActionMatchingSignal(signal) || (b === 0 ? 'playPause' : null);
            if (matchedAction) {
              executeShortcutAction(matchedAction, signal.token);
              startHoldRepeat(matchedAction, signal.token);
            }
          }
        } else if (!pressed && wasPressed) {
          stopHoldRepeat(btnToken);
        }
      }

      // Check axes (D-pad / stick on Bluetooth remotes, supports press-and-hold auto-repeat)
      for (let a = 0; a < gp.axes.length; a++) {
        const val = Number(gp.axes[a] || 0);
        const dir = val > 0.65 ? '+' : val < -0.65 ? '-' : '';
        const prevDir = prev.axes[a] || '';
        prev.axes[a] = dir;

        if (prevDir && prevDir !== dir) {
          stopHoldRepeat(`Gamepad:Axis${a}${prevDir}`);
        }

        if (dir && dir !== prevDir) {
          const signal = {
            token: `Gamepad:Axis${a}${dir}`,
            label: `Remote/Gamepad Axis ${a}${dir}`,
            altTokens: [],
            rawSummary: `Gamepad "${gp.id}" | Axis ${a} (${val.toFixed(2)})`
          };
          if (isShortcutsModalOpen()) {
            handleIncomingSignalForModal(signal);
          } else if (state.mode === 'prompter') {
            const matchedAction = findActionMatchingSignal(signal);
            if (matchedAction) {
              executeShortcutAction(matchedAction, signal.token);
              startHoldRepeat(matchedAction, signal.token);
            }
          }
        }
      }
    }
  }

  /* ========================================================================
     1. NEON POSTGRES DATABASE CLIENT (DIRECT HTTPS SQL + /api/docs FALLBACK)
     ======================================================================== */
  function clearLegacyLocalStorage() {
    try {
      localStorage.removeItem('mono_teleprompter_docs_v1');
      localStorage.removeItem('mono_teleprompter_settings_v1');
      localStorage.removeItem('tbh_autocue_sync_config_v1');
    } catch {
      // Ignore if storage is restricted
    }
  }

  /**
   * Executes parameterized SQL against Neon's Serverless HTTP endpoint (/sql).
   *
   * CRITICAL CORS NOTE (from Neon Serverless Driver spec):
   * Neon's /sql endpoint responds to OPTIONS preflight with:
   *   Access-Control-Allow-Origin: *
   *   Access-Control-Allow-Headers: Authorization, Neon-Connection-String,
   *     Neon-Raw-Text-Output, Neon-Array-Mode, Neon-Pool-Opt-In,
   *     Neon-Batch-Read-Only, Neon-Batch-Isolation-Level, Neon-Client-Info
   * Notice `Content-Type` is NOT in `Access-Control-Allow-Headers`.
   * Therefore, we MUST NOT set `Content-Type: application/json` in browser fetch(),
   * allowing the browser to send the CORS-safelisted `text/plain;charset=UTF-8`
   * header just like `@neondatabase/serverless` does.
   */
  async function executeNeonSql(query, params = []) {
    const response = await fetch(NEON_SQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Neon-Connection-String': NEON_CONNECTION_URI,
        'Neon-Raw-Text-Output': 'false',
        'Neon-Array-Mode': 'false'
      },
      body: JSON.stringify({ query, params })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Neon HTTP ${response.status}: ${errText.slice(0, 180)}`);
    }
    return response.json();
  }

  async function ensureNeonSchema() {
    if (state.schemaReady) return;
    await executeNeonSql(`
      CREATE TABLE IF NOT EXISTS autocue_documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Untitled Script',
        author TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);
    await executeNeonSql(`
      ALTER TABLE autocue_documents ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '';
    `);
    await executeNeonSql(`
      CREATE TABLE IF NOT EXISTS autocue_settings (
        id TEXT PRIMARY KEY,
        active_doc_id TEXT,
        speed INTEGER NOT NULL DEFAULT 28,
        font_size INTEGER NOT NULL DEFAULT 56,
        width_percent INTEGER NOT NULL DEFAULT 72,
        mirror_x BOOLEAN NOT NULL DEFAULT FALSE,
        mirror_y BOOLEAN NOT NULL DEFAULT FALSE,
        shade_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        shade_opacity INTEGER NOT NULL DEFAULT 78,
        shade_top_percent DOUBLE PRECISION NOT NULL DEFAULT 34,
        updated_at BIGINT NOT NULL
      );
    `);
    state.schemaReady = true;
  }

  async function loadAllFromDatabase(isInitial = false) {
    if (state.isSyncing) return;
    if (
      !isInitial &&
      (pendingSavesCount > 0 ||
        docSaveDebounceTimeout !== null ||
        Date.now() - lastLocalEditTime < 2200)
    ) {
      return;
    }

    const mutationSnapshot = localMutationVersion;
    state.isSyncing = true;
    setSyncStatusUI('syncing');

    try {
      let docs = [];
      let dbSettings = null;
      const defaultAuthor = getDefaultAuthorName();

      try {
        // Primary: Direct Neon Serverless HTTP SQL API (works on any static host or browser)
        if (isInitial && !state.schemaReady) {
          await ensureNeonSchema();
        }

        const [docsRes, settingsRes] = await Promise.all([
          executeNeonSql(
            'SELECT id, title, author, content, created_at, updated_at FROM autocue_documents ORDER BY updated_at DESC;'
          ),
          executeNeonSql('SELECT * FROM autocue_settings WHERE id = $1;', ['global'])
        ]);

        docs = (docsRes.rows || []).map((r) => ({
          id: String(r.id),
          title: String(r.title || 'Untitled Script'),
          author: String(r.author || defaultAuthor || ''),
          content: String(r.content || ''),
          createdAt: Number(r.created_at) || Date.now(),
          updatedAt: Number(r.updated_at) || Date.now()
        }));

        const sRow = (settingsRes.rows || [])[0];
        if (sRow) {
          dbSettings = {
            activeDocId: sRow.active_doc_id,
            speed: Number(sRow.speed),
            fontSize: Number(sRow.font_size),
            widthPercent: Number(sRow.width_percent),
            mirrorX: Boolean(sRow.mirror_x),
            mirrorY: Boolean(sRow.mirror_y),
            shadeEnabled: Boolean(sRow.shade_enabled),
            shadeOpacity: Number(sRow.shade_opacity),
            shadeTopPercent: Number(sRow.shade_top_percent),
            updatedAt: Number(sRow.updated_at) || 0
          };
        }
      } catch (directErr) {
        // Fallback: Server /api/docs endpoint (also backed by Neon Postgres)
        const res = await fetch('/api/docs');
        if (!res.ok) throw directErr;
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to load from Neon DB');
        docs = (data.docs || []).map((d) => ({
          ...d,
          author: String(d.author || defaultAuthor || '')
        }));
        dbSettings = data.settings || null;
      }

      if (docs.length === 0) {
        // Seed initial document into Neon DB if empty
        const now = Date.now();
        const seedDoc = {
          id: 'doc-welcome',
          title: '01 // Beyond Headlines Autocue Guide',
          author: defaultAuthor || 'Beyond Headlines',
          content:
            'Welcome to Beyond Headlines Autocue.\n\nPress ENTER to start scrolling. While playing, click or tap anywhere on the screen to pause.\n\nAll documents are stored directly in your Neon Postgres database and synced across all devices.',
          createdAt: now,
          updatedAt: now
        };
        await upsertDocumentInDatabase(seedDoc);
        docs = [seedDoc];
      }

      if (
        !isInitial &&
        (localMutationVersion !== mutationSnapshot ||
          pendingSavesCount > 0 ||
          docSaveDebounceTimeout !== null ||
          Date.now() - lastLocalEditTime < 2200)
      ) {
        setSyncStatusUI('synced');
        return;
      }

      const docsChanged = JSON.stringify(state.docs) !== JSON.stringify(docs);
      state.docs = docs;

      if (
        dbSettings &&
        (isInitial || dbSettings.updatedAt > state.settingsUpdatedAt) &&
        Date.now() - lastLocalSettingsTime > 1800 &&
        !state.isDraggingShade
      ) {
        state.settingsUpdatedAt = dbSettings.updatedAt;
        if (dbSettings.activeDocId && state.docs.some((d) => d.id === dbSettings.activeDocId)) {
          state.activeDocId = dbSettings.activeDocId;
        }
        state.speed = clamp(Number(dbSettings.speed) || 28, 1, 100);
        state.fontSize = clamp(Number(dbSettings.fontSize) || 56, 22, 130);
        state.widthPercent = clamp(Number(dbSettings.widthPercent) || 72, 30, 100);
        state.mirrorX = Boolean(dbSettings.mirrorX);
        state.mirrorY = Boolean(dbSettings.mirrorY);
        state.shadeEnabled = dbSettings.shadeEnabled !== undefined ? Boolean(dbSettings.shadeEnabled) : true;
        state.shadeOpacity = clamp(Number(dbSettings.shadeOpacity) || 78, 20, 95);
        state.shadeTopPercent = clamp(Number(dbSettings.shadeTopPercent) || 34, 6, 75);
        syncControlsFromState();
      }

      ensureValidActiveDoc();

      if (isInitial || docsChanged) {
        renderDocsUI();
      }

      setSyncStatusUI('synced');
    } catch (err) {
      console.warn('Neon DB sync error:', err);
      setSyncStatusUI('offline');
    } finally {
      state.isSyncing = false;
    }
  }

  async function upsertDocumentInDatabase(doc) {
    pendingSavesCount++;
    setSyncStatusUI('syncing');
    try {
      try {
        await executeNeonSql(
          `INSERT INTO autocue_documents (id, title, author, content, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             author = EXCLUDED.author,
             content = EXCLUDED.content,
             updated_at = EXCLUDED.updated_at;`,
          [
            String(doc.id),
            String(doc.title || 'Untitled Script'),
            String(doc.author || ''),
            String(doc.content || ''),
            Number(doc.createdAt) || Date.now(),
            Number(doc.updatedAt) || Date.now()
          ]
        );
      } catch (directErr) {
        const res = await fetch('/api/docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(doc)
        });
        if (!res.ok) throw directErr;
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to save doc');
      }
      setSyncStatusUI('synced');
      flashSaveIndicator('✓ Saved in Neon DB');
    } catch (err) {
      console.error('Failed to save doc to Neon DB:', err);
      setSyncStatusUI('offline');
      flashSaveIndicator('⚠ Save failed');
    } finally {
      pendingSavesCount = Math.max(0, pendingSavesCount - 1);
    }
  }

  async function deleteDocumentFromDatabase(docId) {
    pendingSavesCount++;
    setSyncStatusUI('syncing');
    try {
      try {
        await executeNeonSql('DELETE FROM autocue_documents WHERE id = $1;', [String(docId)]);
      } catch (directErr) {
        const res = await fetch(`/api/docs?id=${encodeURIComponent(docId)}`, { method: 'DELETE' });
        if (!res.ok) throw directErr;
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to delete doc');
      }
      setSyncStatusUI('synced');
      flashSaveIndicator('✓ Deleted from Neon DB');
    } catch (err) {
      console.error('Failed to delete doc from Neon DB:', err);
      setSyncStatusUI('offline');
    } finally {
      pendingSavesCount = Math.max(0, pendingSavesCount - 1);
    }
  }

  function scheduleDocumentSave(doc) {
    lastLocalEditTime = Date.now();
    localMutationVersion++;
    flashSaveIndicator('↻ Saving to Neon DB...');
    clearTimeout(docSaveDebounceTimeout);
    docSaveDebounceTimeout = setTimeout(() => {
      docSaveDebounceTimeout = null;
      upsertDocumentInDatabase(doc);
    }, 350);
  }

  function scheduleSettingsSave() {
    lastLocalSettingsTime = Date.now();
    state.settingsUpdatedAt = lastLocalSettingsTime;
    clearTimeout(settingsSaveDebounceTimeout);
    settingsSaveDebounceTimeout = setTimeout(async () => {
      settingsSaveDebounceTimeout = null;
      const now = Date.now();
      state.settingsUpdatedAt = now;
      try {
        try {
          await executeNeonSql(
            `INSERT INTO autocue_settings (
               id, active_doc_id, speed, font_size, width_percent,
               mirror_x, mirror_y, shade_enabled, shade_opacity, shade_top_percent, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO UPDATE SET
               active_doc_id = EXCLUDED.active_doc_id,
               speed = EXCLUDED.speed,
               font_size = EXCLUDED.font_size,
               width_percent = EXCLUDED.width_percent,
               mirror_x = EXCLUDED.mirror_x,
               mirror_y = EXCLUDED.mirror_y,
               shade_enabled = EXCLUDED.shade_enabled,
               shade_opacity = EXCLUDED.shade_opacity,
               shade_top_percent = EXCLUDED.shade_top_percent,
               updated_at = EXCLUDED.updated_at;`,
            [
              'global',
              state.activeDocId || null,
              state.speed,
              state.fontSize,
              state.widthPercent,
              state.mirrorX,
              state.mirrorY,
              state.shadeEnabled,
              state.shadeOpacity,
              state.shadeTopPercent,
              now
            ]
          );
        } catch (directErr) {
          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              activeDocId: state.activeDocId,
              speed: state.speed,
              fontSize: state.fontSize,
              widthPercent: state.widthPercent,
              mirrorX: state.mirrorX,
              mirrorY: state.mirrorY,
              shadeEnabled: state.shadeEnabled,
              shadeOpacity: state.shadeOpacity,
              shadeTopPercent: state.shadeTopPercent
            })
          });
          if (!res.ok) throw directErr;
        }
      } catch (err) {
        console.warn('Could not save settings to Neon DB:', err);
      }
    }, 450);
  }

  async function manualSyncWithDatabase() {
    if (docSaveDebounceTimeout) {
      clearTimeout(docSaveDebounceTimeout);
      docSaveDebounceTimeout = null;
      const active = getActiveDoc();
      if (active) {
        await upsertDocumentInDatabase(active);
      }
    }
    await loadAllFromDatabase(true);
    flashSaveIndicator('✓ Synced with Neon DB');
  }

  function setSyncStatusUI(status) {
    if (!dom.syncDot) return;
    dom.syncDot.className = 'sync-dot';
    dom.syncBtnLabel.textContent = 'Sync';
    if (status === 'syncing') {
      dom.syncDot.classList.add('syncing');
    } else if (status === 'offline') {
      dom.syncDot.classList.add('offline');
    }
  }

  function flashSaveIndicator(text) {
    if (!dom.saveStatusPill) return;
    dom.saveStatusPill.textContent = text;
    dom.saveStatusPill.style.borderColor = 'rgba(255,255,255,0.55)';
    clearTimeout(saveIndicatorTimeout);
    saveIndicatorTimeout = setTimeout(() => {
      dom.saveStatusPill.style.borderColor = '';
    }, 900);
  }

  /* ========================================================================
     2. MULTI-DOCUMENT MANAGEMENT (BACKED BY NEON POSTGRES DB)
     ======================================================================== */
  function ensureValidActiveDoc() {
    if (state.docs.length > 0 && !state.docs.some((d) => d.id === state.activeDocId)) {
      state.activeDocId = state.docs[0].id;
    }
  }

  function getActiveDoc() {
    return state.docs.find((d) => d.id === state.activeDocId) || state.docs[0] || null;
  }

  function renderDocsUI() {
    ensureValidActiveDoc();
    const activeDoc = getActiveDoc();
    const defaultAuthor = getDefaultAuthorName();

    // Update badge counts
    dom.docCountBadge.textContent = String(state.docs.length);
    if (dom.mobileDocCount) {
      dom.mobileDocCount.textContent = String(state.docs.length);
    }

    // Update Top Quick Select Dropdown
    dom.quickDocSelect.innerHTML = '';
    state.docs.forEach((doc) => {
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = doc.title || 'Untitled Script';
      if (activeDoc && doc.id === activeDoc.id) opt.selected = true;
      dom.quickDocSelect.appendChild(opt);
    });

    // Update Sidebar List
    const q = state.searchQuery.trim().toLowerCase();
    const filteredDocs = state.docs.filter((doc) => {
      if (!q) return true;
      return (
        (doc.title || '').toLowerCase().includes(q) ||
        (doc.author || '').toLowerCase().includes(q) ||
        (doc.content || '').toLowerCase().includes(q)
      );
    });

    dom.docsList.innerHTML = '';
    filteredDocs.forEach((doc) => {
      const li = document.createElement('li');
      const isSelected = activeDoc && doc.id === activeDoc.id;
      li.className = `doc-item${isSelected ? ' active' : ''}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', isSelected ? 'true' : 'false');

      const words = countWords(doc.content);
      const snippet = (doc.content || '').replace(/\s+/g, ' ').trim() || 'Empty script...';
      const authorLabel = (doc.author || defaultAuthor || '').trim();

      li.innerHTML = `
        <div class="doc-item-top">
          <span class="doc-item-title">${escapeHtml(doc.title || 'Untitled Script')}</span>
        </div>
        <div class="doc-item-snippet">${escapeHtml(snippet.slice(0, 65))}</div>
        <div class="doc-item-meta">
          <span>${authorLabel ? escapeHtml(authorLabel) + ' · ' : ''}${words}w</span>
          <span>${formatRelativeTime(doc.updatedAt)}</span>
        </div>
      `;

      li.addEventListener('click', () => {
        selectDocument(doc.id);
        setMobileEditorSubtab('write');
      });

      dom.docsList.appendChild(li);
    });

    if (activeDoc) {
      if (document.activeElement !== dom.inputDocTitle) {
        dom.inputDocTitle.value = activeDoc.title || '';
      }
      if (dom.inputDocAuthor && document.activeElement !== dom.inputDocAuthor) {
        dom.inputDocAuthor.value = activeDoc.author || defaultAuthor || '';
      }
      if (document.activeElement !== dom.textareaDocContent) {
        dom.textareaDocContent.value = activeDoc.content || '';
      }
    }

    updateEditorStats();
    renderPrompterScript();
  }

  function selectDocument(docId, resetScroll = true) {
    const target = state.docs.find((d) => d.id === docId);
    if (!target) return;
    state.activeDocId = docId;
    dom.inputDocTitle.value = target.title || '';
    if (dom.inputDocAuthor) {
      dom.inputDocAuthor.value = target.author || getDefaultAuthorName() || '';
    }
    dom.textareaDocContent.value = target.content || '';

    if (resetScroll) {
      pausePrompter();
      state.scrollOffset = 0;
      state.targetScrollOffset = 0;
    }

    scheduleSettingsSave();
    renderDocsUI();
  }

  async function createNewDocument(switchToEditor = true, customTitle = '', customContent = '', customAuthor = '') {
    const num = state.docs.length + 1;
    const now = Date.now();
    const defaultAuthor = getDefaultAuthorName();
    const newDoc = {
      id: 'doc-' + now + '-' + Math.random().toString(36).slice(2, 7),
      title: customTitle || `${String(num).padStart(2, '0')} // Untitled Script`,
      author: customAuthor || defaultAuthor || '',
      content: customContent,
      createdAt: now,
      updatedAt: now
    };

    lastLocalEditTime = now;
    localMutationVersion++;
    state.docs.unshift(newDoc);
    state.activeDocId = newDoc.id;
    state.scrollOffset = 0;
    state.targetScrollOffset = 0;
    pausePrompter();

    renderDocsUI();
    await upsertDocumentInDatabase(newDoc);
    scheduleSettingsSave();

    if (switchToEditor) {
      setViewMode('editor');
      setMobileEditorSubtab('write');
      setTimeout(() => {
        dom.textareaDocContent.focus();
      }, 40);
    }
  }

  function duplicateActiveDocument() {
    const active = getActiveDoc();
    if (!active) return;
    createNewDocument(
      true,
      `${active.title || 'Untitled'} (Copy)`,
      active.content || '',
      active.author || getDefaultAuthorName()
    );
  }

  async function deleteActiveDocument() {
    const active = getActiveDoc();
    if (!active) return;

    const now = Date.now();
    lastLocalEditTime = now;
    localMutationVersion++;

    if (state.docs.length <= 1) {
      active.title = '01 // Untitled Script';
      active.author = getDefaultAuthorName();
      active.content = '';
      active.updatedAt = now;
      renderDocsUI();
      await upsertDocumentInDatabase(active);
      return;
    }

    const deletedId = active.id;
    const idx = state.docs.findIndex((d) => d.id === deletedId);
    state.docs.splice(idx, 1);
    state.activeDocId = state.docs[Math.min(idx, state.docs.length - 1)].id;
    state.scrollOffset = 0;
    state.targetScrollOffset = 0;

    renderDocsUI();
    await deleteDocumentFromDatabase(deletedId);
    scheduleSettingsSave();
  }

  function setMobileEditorSubtab(subtab) {
    const showList = subtab === 'list';
    dom.editorLayout.classList.toggle('mobile-show-list', showList);
    dom.btnMobileShowList.classList.toggle('active', showList);
    dom.btnMobileShowWrite.classList.toggle('active', !showList);
  }

  function updateEditorStats() {
    const active = getActiveDoc();
    const content = active ? active.content || '' : '';
    const authorName = (active?.author || getDefaultAuthorName() || '—').trim() || '—';
    const words = countWords(content);
    const chars = content.length;
    const lines = content ? content.split(/\r\n|\r|\n/).length : 0;

    const estimatedWpm = Math.round(70 + state.speed * 2.1);
    const totalSeconds = words > 0 ? Math.max(1, Math.round((words / estimatedWpm) * 60)) : 0;
    const mins = Math.floor(totalSeconds / 60);
    const secs = String(totalSeconds % 60).padStart(2, '0');

    if (dom.statAuthor) {
      dom.statAuthor.textContent = `Author: ${authorName}`;
    }
    dom.statWords.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
    dom.statChars.textContent = `${chars} chars`;
    dom.statLines.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'}`;
    dom.statReadtime.textContent = `Est. ${mins}:${secs} @ speed ${state.speed}`;
    dom.statUpdated.textContent = `Neon DB · ${formatRelativeTime(active?.updatedAt)}`;
  }

  /* ========================================================================
     3. TELEPROMPTER RENDERING, LAYOUT & 2-LINE FOCUS SHADE
     ======================================================================== */
  function renderPrompterScript() {
    const active = getActiveDoc();
    const text = (active && active.content && active.content.trim().length > 0)
      ? active.content
      : 'Loading script from Neon Postgres DB...';

    dom.prompterText.textContent = text;
    updateLayoutAndShadeMetrics(true);
  }

  function getMaxShadeTopPercent() {
    const stageHeight = dom.prompterStage.clientHeight || window.innerHeight;
    const singleLinePx = state.fontSize * LINE_HEIGHT_RATIO;
    const twoLineWindowPx = Math.round(singleLinePx * 2 + 16);
    return Math.max(10, Math.min(78, ((stageHeight - twoLineWindowPx - 20) / stageHeight) * 100));
  }

  function updateLayoutAndShadeMetrics(preserveRelativeProgress = true) {
    const prevRatio = state.maxScroll > 0 ? state.scrollOffset / state.maxScroll : 0;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--prompter-font-size', `${state.fontSize}px`);
    rootStyle.setProperty('--prompter-line-height', String(LINE_HEIGHT_RATIO));
    rootStyle.setProperty('--prompter-width', `${state.widthPercent}%`);
    rootStyle.setProperty('--shade-opacity', String(state.shadeOpacity / 100));

    const singleLinePx = state.fontSize * LINE_HEIGHT_RATIO;
    const twoLineWindowPx = Math.round(singleLinePx * 2 + 16);
    rootStyle.setProperty('--shade-window-height', `${twoLineWindowPx}px`);

    const stageHeight = dom.prompterStage.clientHeight || window.innerHeight;
    const maxTopPercent = getMaxShadeTopPercent();
    state.shadeTopPercent = clamp(state.shadeTopPercent, 6, maxTopPercent);
    rootStyle.setProperty('--shade-top-height', `${state.shadeTopPercent}%`);

    const topShadePx = Math.round((state.shadeTopPercent / 100) * stageHeight);
    const bottomShadePx = Math.max(80, stageHeight - topShadePx - twoLineWindowPx);

    dom.prompterText.style.paddingTop = `${topShadePx + 8}px`;
    dom.prompterText.style.paddingBottom = `${bottomShadePx + 8}px`;

    const totalTrackHeight = dom.prompterTrack.scrollHeight;
    state.maxScroll = Math.max(0, totalTrackHeight - stageHeight);

    if (preserveRelativeProgress && state.maxScroll > 0) {
      state.scrollOffset = clamp(prevRatio * state.maxScroll, 0, state.maxScroll);
      state.targetScrollOffset = state.scrollOffset;
    } else {
      state.scrollOffset = clamp(state.scrollOffset, 0, state.maxScroll);
      state.targetScrollOffset = clamp(state.targetScrollOffset, 0, state.maxScroll);
    }

    applyScrollTransform();
  }

  function applyScrollTransform() {
    dom.prompterTrack.style.transform = `translate3d(0, ${-state.scrollOffset}px, 0)`;

    const pct = state.maxScroll > 0
      ? Math.round((state.scrollOffset / state.maxScroll) * 100)
      : 0;

    dom.progressBarFill.style.width = `${pct}%`;
  }

  /* ========================================================================
     4. SCROLL PHYSICS LOOP & CONTROLS
     ======================================================================== */
  function speedToPixelsPerSecond(speedVal) {
    return 8 + Math.pow(speedVal, 1.48) * 0.85;
  }

  function animationLoop(timestamp) {
    if (!state.lastFrameTime) state.lastFrameTime = timestamp;
    const dt = Math.min(0.064, (timestamp - state.lastFrameTime) / 1000);
    state.lastFrameTime = timestamp;

    pollGamepadInputs();

    let changed = false;

    if (state.isPlaying) {
      const pxPerSec = speedToPixelsPerSecond(state.speed);
      const delta = pxPerSec * dt;
      state.targetScrollOffset = clamp(state.targetScrollOffset + delta, 0, state.maxScroll);
      changed = true;

      if (state.targetScrollOffset >= state.maxScroll && state.maxScroll > 0) {
        pausePrompter();
      }
    }

    const diff = state.targetScrollOffset - state.scrollOffset;
    if (Math.abs(diff) > 0.15) {
      state.scrollOffset += diff * Math.min(1, dt * 18);
      changed = true;
    } else if (diff !== 0) {
      state.scrollOffset = state.targetScrollOffset;
      changed = true;
    }

    if (changed) {
      applyScrollTransform();
    }

    requestAnimationFrame(animationLoop);
  }

  let lastPlayToggleAt = 0;
  function triggerPlayToggleDebounced() {
    const now = performance.now();
    if (now - lastPlayToggleAt < 220) return;
    lastPlayToggleAt = now;
    togglePlay();
  }

  function togglePlay() {
    lastPlayToggleAt = performance.now();
    if (state.isPlaying) {
      pausePrompter();
    } else {
      startPrompter();
    }
  }

  function startPrompter() {
    updateLayoutAndShadeMetrics(false);

    if (state.maxScroll > 0 && state.scrollOffset >= state.maxScroll - 2) {
      state.scrollOffset = 0;
      state.targetScrollOffset = 0;
    }

    state.isPlaying = true;
    state.lastFrameTime = performance.now();
    updateTransportUI();
  }

  function pausePrompter() {
    state.isPlaying = false;
    updateTransportUI();
  }

  function resetPrompter() {
    pausePrompter();
    state.scrollOffset = 0;
    state.targetScrollOffset = 0;
    applyScrollTransform();
  }

  function moveTextVertical(direction) {
    const singleLinePx = state.fontSize * LINE_HEIGHT_RATIO;
    const stepPx = Math.round(singleLinePx * 0.9);

    if (direction === 'up') {
      state.targetScrollOffset = clamp(state.targetScrollOffset + stepPx, 0, state.maxScroll);
    } else {
      state.targetScrollOffset = clamp(state.targetScrollOffset - stepPx, 0, state.maxScroll);
    }
  }

  function toggleMainPlayerFocus() {
    if (state.isPlaying) {
      state.playerFocused = false;
      pausePrompter();
    } else {
      state.playerFocused = !state.playerFocused;
      document.body.classList.toggle('player-focused', state.playerFocused);
    }
    dom.prompterStage.focus({ preventScroll: true });
  }

  function updateTransportUI() {
    document.body.classList.toggle('is-playing', state.isPlaying);
    if (state.isPlaying) {
      dom.btnPlayPause.classList.add('playing');
      dom.svgPlay.classList.add('hidden');
      dom.svgPause.classList.remove('hidden');
      dom.playBtnLabel.textContent = 'STOP';
    } else {
      dom.btnPlayPause.classList.remove('playing');
      dom.svgPlay.classList.remove('hidden');
      dom.svgPause.classList.add('hidden');
      dom.playBtnLabel.textContent = 'START';
    }
  }

  /* ========================================================================
     5. PARAMETER SETTERS (SPEED, FONT SIZE, WIDTH, MIRROR, SHADE)
     ======================================================================== */
  function syncControlsFromState() {
    dom.sliderSpeed.value = String(state.speed);
    dom.valSpeed.textContent = String(state.speed);

    dom.sliderFontsize.value = String(state.fontSize);
    dom.valFontsize.textContent = `${state.fontSize}px`;

    dom.sliderWidth.value = String(state.widthPercent);
    dom.valWidth.textContent = `${state.widthPercent}%`;

    dom.sliderShade.value = String(state.shadeOpacity);
    dom.valShade.textContent = state.shadeEnabled ? `${state.shadeOpacity}%` : 'OFF';
    dom.focusShadeContainer.classList.toggle('shade-off', !state.shadeEnabled);
    dom.btnShadeToggle.classList.toggle('active', state.shadeEnabled);
    dom.btnShadeToggle.textContent = state.shadeEnabled ? 'ON' : 'OFF';

    dom.mirrorViewport.classList.toggle('mirror-x', state.mirrorX);
    dom.mirrorViewport.classList.toggle('mirror-y', state.mirrorY);
    dom.btnMirrorX.classList.toggle('active', state.mirrorX);
    dom.btnMirrorY.classList.toggle('active', state.mirrorY);

    updateLayoutAndShadeMetrics(true);
  }

  function setSpeed(newSpeed) {
    state.speed = clamp(Math.round(newSpeed), 1, 100);
    dom.sliderSpeed.value = String(state.speed);
    dom.valSpeed.textContent = String(state.speed);
    scheduleSettingsSave();
    updateEditorStats();
  }

  function setFontSize(newSize) {
    state.fontSize = clamp(Math.round(newSize), 22, 130);
    dom.sliderFontsize.value = String(state.fontSize);
    dom.valFontsize.textContent = `${state.fontSize}px`;
    updateLayoutAndShadeMetrics(true);
    scheduleSettingsSave();
  }

  function setWidthPercent(newWidth) {
    state.widthPercent = clamp(Math.round(newWidth), 30, 100);
    dom.sliderWidth.value = String(state.widthPercent);
    dom.valWidth.textContent = `${state.widthPercent}%`;
    updateLayoutAndShadeMetrics(true);
    scheduleSettingsSave();
  }

  function setMirror(axis, value) {
    if (axis === 'x') {
      state.mirrorX = value !== undefined ? Boolean(value) : !state.mirrorX;
    } else if (axis === 'y') {
      state.mirrorY = value !== undefined ? Boolean(value) : !state.mirrorY;
    }

    dom.mirrorViewport.classList.toggle('mirror-x', state.mirrorX);
    dom.mirrorViewport.classList.toggle('mirror-y', state.mirrorY);
    dom.btnMirrorX.classList.toggle('active', state.mirrorX);
    dom.btnMirrorY.classList.toggle('active', state.mirrorY);
    scheduleSettingsSave();
  }

  function setShadeOpacity(newOpacity) {
    state.shadeOpacity = clamp(Math.round(newOpacity), 20, 95);
    dom.sliderShade.value = String(state.shadeOpacity);
    dom.valShade.textContent = state.shadeEnabled ? `${state.shadeOpacity}%` : 'OFF';
    updateLayoutAndShadeMetrics(false);
    scheduleSettingsSave();
  }

  function toggleShadeEnabled() {
    state.shadeEnabled = !state.shadeEnabled;
    dom.focusShadeContainer.classList.toggle('shade-off', !state.shadeEnabled);
    dom.btnShadeToggle.classList.toggle('active', state.shadeEnabled);
    dom.btnShadeToggle.textContent = state.shadeEnabled ? 'ON' : 'OFF';
    dom.valShade.textContent = state.shadeEnabled ? `${state.shadeOpacity}%` : 'OFF';
    scheduleSettingsSave();
  }

  function centerShadePosition() {
    state.shadeTopPercent = 34;
    updateLayoutAndShadeMetrics(false);
    scheduleSettingsSave();
  }

  function setViewMode(mode) {
    state.mode = mode === 'editor' ? 'editor' : 'prompter';
    const isPrompter = state.mode === 'prompter';

    state.playerFocused = false;
    document.body.classList.remove('player-focused');

    dom.tabPrompter.classList.toggle('active', isPrompter);
    dom.tabEditor.classList.toggle('active', !isPrompter);
    dom.viewPrompter.classList.toggle('active', isPrompter);
    dom.viewEditor.classList.toggle('active', !isPrompter);

    if (isPrompter) {
      renderPrompterScript();
      dom.prompterStage.focus({ preventScroll: true });
    } else {
      pausePrompter();
      renderDocsUI();
    }
  }

  /* ========================================================================
     6. EVENT LISTENERS (FLICKER-FREE SHADE DRAG, CLICK-TO-PAUSE, KEYBOARD)
     ======================================================================== */
  function bindEvents() {
    // Mode Switcher
    dom.tabPrompter.addEventListener('click', () => setViewMode('prompter'));
    dom.tabEditor.addEventListener('click', () => setViewMode('editor'));
    dom.btnOpenEditorQuick.addEventListener('click', () => setViewMode('editor'));
    dom.btnLaunchPrompter.addEventListener('click', () => setViewMode('prompter'));

    // Mobile Editor Sub-Navigation
    dom.btnMobileShowList.addEventListener('click', () => setMobileEditorSubtab('list'));
    dom.btnMobileShowWrite.addEventListener('click', () => setMobileEditorSubtab('write'));

    // Quick Header Doc Selector, New Doc & Manual Sync on Button Click
    dom.quickDocSelect.addEventListener('change', (e) => {
      selectDocument(e.target.value, true);
    });
    dom.btnQuickNewDoc.addEventListener('click', () => createNewDocument(true));
    dom.btnSyncRefresh.addEventListener('click', () => manualSyncWithDatabase());

    // ======================================================================
    // FLICKER-FREE 2-LINE FOCUS SHADE DRAG HANDLE (Pointer Capture + Delta)
    // ======================================================================
    let shadeDragPointerId = null;
    let shadeDragStartY = 0;
    let shadeDragStartPercent = 34;

    dom.shadeDragHandle.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      shadeDragPointerId = e.pointerId;
      shadeDragStartY = e.clientY;
      shadeDragStartPercent = state.shadeTopPercent;
      state.isDraggingShade = true;

      dom.shadeDragHandle.classList.add('dragging');
      try {
        dom.shadeDragHandle.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
    });

    dom.shadeDragHandle.addEventListener('pointermove', (e) => {
      if (!state.isDraggingShade || e.pointerId !== shadeDragPointerId) return;
      e.stopPropagation();
      e.preventDefault();

      const stageHeight = dom.prompterStage.clientHeight || window.innerHeight;
      const deltaY = e.clientY - shadeDragStartY;
      const deltaPercent = (deltaY / stageHeight) * 100;
      const maxTopPercent = getMaxShadeTopPercent();

      state.shadeTopPercent = clamp(shadeDragStartPercent + deltaPercent, 6, maxTopPercent);
      document.documentElement.style.setProperty('--shade-top-height', `${state.shadeTopPercent}%`);
    });

    const finishShadeDrag = (e) => {
      if (!state.isDraggingShade) return;
      if (e && shadeDragPointerId !== null && e.pointerId !== shadeDragPointerId) return;

      state.isDraggingShade = false;
      state.justDraggedShade = true;
      dom.shadeDragHandle.classList.remove('dragging');

      try {
        if (shadeDragPointerId !== null) {
          dom.shadeDragHandle.releasePointerCapture(shadeDragPointerId);
        }
      } catch {
        // Ignore
      }
      shadeDragPointerId = null;

      updateLayoutAndShadeMetrics(false);
      scheduleSettingsSave();

      setTimeout(() => {
        state.justDraggedShade = false;
      }, 80);
    };

    dom.shadeDragHandle.addEventListener('pointerup', finishShadeDrag);
    dom.shadeDragHandle.addEventListener('pointercancel', finishShadeDrag);

    // ======================================================================
    // STAGE & REMOTE INTERACTIONS (Desktop Mouse, Android Touchpad/Mouse
    // Autocue Remote, and Touchscreen):
    // 1. Left Click / Remote Click / Tap: Start / Stop teleprompter (same as Enter)
    // 2. Touch Long-Press (900ms) when paused: Focus main content player part
    // ======================================================================
    let holdTimer = null;
    let pointerDownActive = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let touchScrollStartOffset = 0;
    let isTouchScrollingStage = false;
    let holdTriggered = false;

    const clearHoldTimer = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    const isInteractiveHudOrModalTarget = (target) => {
      if (!target || typeof target.closest !== 'function') return false;
      return Boolean(
        target.closest(
          'button, input, select, textarea, a, label, #shade-drag-handle, #progress-bar-track, .modal-card, #view-editor'
        )
      );
    };

    dom.prompterStage.addEventListener('pointerdown', (e) => {
      // Allow primary button (0) or Android remote virtual touchpad/mouse (-1 or 0)
      if (e.button !== undefined && e.button > 0) return;
      if (state.isDraggingShade || e.target.closest('#shade-drag-handle')) return;

      pointerDownActive = true;
      holdTriggered = false;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      touchScrollStartOffset = state.targetScrollOffset;
      isTouchScrollingStage = false;

      clearHoldTimer();

      // Only start long-press timer for direct finger touch when paused
      // (Never for mouse/touchpad remotes, which may hold button >400ms on click)
      if (e.pointerType === 'touch' && !state.isPlaying) {
        holdTimer = setTimeout(() => {
          holdTimer = null;
          if (pointerDownActive && !isTouchScrollingStage && !state.isDraggingShade && !state.isPlaying) {
            holdTriggered = true;
            toggleMainPlayerFocus();
          }
        }, 900);
      }
    });

    dom.prompterStage.addEventListener('pointermove', (e) => {
      if (state.isDraggingShade) {
        clearHoldTimer();
        return;
      }
      if (!pointerDownActive) return;

      const dx = Math.abs(e.clientX - pointerStartX);
      const dy = e.clientY - pointerStartY;

      // Require >28px vertical finger drag before entering manual touch-scroll
      // so slight touchpad/air-mouse jitter on Android remotes still counts as a click
      if (dx > 28 || Math.abs(dy) > 28) {
        clearHoldTimer();
        if (e.pointerType === 'touch' && !state.isDraggingShade && !state.isPlaying) {
          isTouchScrollingStage = true;
        }
      }

      if (isTouchScrollingStage && e.pointerType === 'touch') {
        state.targetScrollOffset = clamp(touchScrollStartOffset - dy * 1.15, 0, state.maxScroll);
        state.scrollOffset = state.targetScrollOffset;
        applyScrollTransform();
      }
    });

    dom.prompterStage.addEventListener('pointerup', (e) => {
      clearHoldTimer();
      if (!pointerDownActive) return;
      pointerDownActive = false;

      if (state.justDraggedShade || state.isDraggingShade) return;
      if (e.target.closest('#shade-drag-handle')) return;

      if (holdTriggered) {
        holdTriggered = false;
        return;
      }
      if (isTouchScrollingStage) {
        isTouchScrollingStage = false;
        return;
      }

      const mouseSignal = buildSignalFromMouseButton(e.button, 'pointerup');
      stopHoldRepeat(mouseSignal.token);
      const matchedAction = findActionMatchingSignal(mouseSignal);
      if (matchedAction) {
        if (!isRepeatableAction(matchedAction)) {
          executeShortcutAction(matchedAction, mouseSignal.token);
        }
      } else if (state.isPlaying && (e.button === undefined || e.button <= 0)) {
        triggerPlayToggleDebounced();
      }
    });

    dom.prompterStage.addEventListener('click', (e) => {
      if (state.justDraggedShade || state.isDraggingShade) return;
      if (e.target.closest('#shade-drag-handle')) return;
      if (holdTriggered) {
        holdTriggered = false;
        return;
      }
      if (isTouchScrollingStage) {
        isTouchScrollingStage = false;
        return;
      }
      const mouseSignal = buildSignalFromMouseButton(e.button, 'click');
      stopHoldRepeat(mouseSignal.token);
      const matchedAction = findActionMatchingSignal(mouseSignal);
      if (matchedAction) {
        if (!isRepeatableAction(matchedAction)) {
          executeShortcutAction(matchedAction, mouseSignal.token);
        }
      } else if (state.isPlaying && (e.button === undefined || e.button <= 0)) {
        triggerPlayToggleDebounced();
      }
    });

    // Helper to bind press-and-hold multi-input repeat on HUD step buttons
    const bindHoldableHudButton = (btnEl, actionId, stepFn) => {
      if (!btnEl) return;
      const holdToken = `HUD:${actionId}`;
      let handledByPointerDown = false;

      btnEl.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        handledByPointerDown = true;
        stepFn();
        startHoldRepeat(actionId, holdToken);
      });

      const stopHudHold = () => {
        stopHoldRepeat(holdToken);
      };

      btnEl.addEventListener('pointerup', stopHudHold);
      btnEl.addEventListener('pointerleave', stopHudHold);
      btnEl.addEventListener('pointercancel', stopHudHold);

      btnEl.addEventListener('click', (e) => {
        stopHudHold();
        if (handledByPointerDown) {
          handledByPointerDown = false;
          return;
        }
        stepFn();
      });
    };

    // Track mouse buttons & keyboard tokens that started a press-and-hold action
    const heldKeyboardTokens = new Set();
    const heldMouseTokens = new Set();
    let lastMouseRepeatableHandledAt = 0;

    window.addEventListener('pointerdown', (e) => {
      if (isShortcutsModalOpen()) return;
      if (state.mode !== 'prompter') return;
      if (dom.authorModalBackdrop && !dom.authorModalBackdrop.classList.contains('hidden')) return;
      if (isInteractiveHudOrModalTarget(e.target)) return;

      const sig = buildSignalFromMouseButton(e.button, 'pointerdown');
      const matched = findActionMatchingSignal(sig);
      if (matched && isRepeatableAction(matched)) {
        heldMouseTokens.add(sig.token);
        lastMouseRepeatableHandledAt = performance.now();
        executeShortcutAction(matched, sig.token);
        startHoldRepeat(matched, sig.token);
      }
    });

    // Global window click / pointerup / contextmenu fallback for Android Bluetooth
    // remotes and custom mouse button bindings
    window.addEventListener('click', (e) => {
      if (isShortcutsModalOpen()) {
        // Ignore clicks on modal action buttons themselves when capturing
        if (
          e.target.closest(
            '.shortcut-edit-btn, .shortcut-chip-remove, #btn-cancel-capture, #btn-reset-shortcuts, #btn-close-modal'
          )
        ) {
          return;
        }
        const sig = buildSignalFromMouseButton(e.button, 'click');
        handleIncomingSignalForModal(sig);
        return;
      }

      const sig = buildSignalFromMouseButton(e.button, 'click');
      stopHoldRepeat(sig.token);
      if (heldMouseTokens.has(sig.token) || performance.now() - lastMouseRepeatableHandledAt < 450) {
        heldMouseTokens.delete(sig.token);
        return;
      }

      if (state.mode !== 'prompter') return;
      if (dom.authorModalBackdrop && !dom.authorModalBackdrop.classList.contains('hidden')) return;
      if (state.justDraggedShade || state.isDraggingShade) return;

      // When playing, clicking anywhere on screen pauses immediately
      if (state.isPlaying) {
        if (!e.target.closest('#btn-play-pause')) {
          triggerPlayToggleDebounced();
        }
        return;
      }

      if (!isInteractiveHudOrModalTarget(e.target)) {
        const matched = findActionMatchingSignal(sig);
        if (matched) {
          executeShortcutAction(matched, sig.token);
        }
      }
    });

    window.addEventListener('pointerup', (e) => {
      const wasHold = holdTriggered;
      const wasScroll = isTouchScrollingStage;
      clearHoldTimer();
      pointerDownActive = false;
      holdTriggered = false;
      isTouchScrollingStage = false;

      const sig = buildSignalFromMouseButton(e.button, 'pointerup');
      stopHoldRepeat(sig.token);

      if (isShortcutsModalOpen()) {
        if (
          e.target.closest(
            '.shortcut-edit-btn, .shortcut-chip-remove, #btn-cancel-capture, #btn-reset-shortcuts, #btn-close-modal'
          )
        ) {
          return;
        }
        handleIncomingSignalForModal(sig);
        return;
      }

      if (heldMouseTokens.has(sig.token)) {
        lastMouseRepeatableHandledAt = performance.now();
        heldMouseTokens.delete(sig.token);
        return;
      }

      if (state.mode !== 'prompter') return;
      if (dom.authorModalBackdrop && !dom.authorModalBackdrop.classList.contains('hidden')) return;
      if (state.justDraggedShade || state.isDraggingShade || wasHold || wasScroll) return;

      if (state.isPlaying) {
        if (!e.target.closest('#btn-play-pause')) {
          triggerPlayToggleDebounced();
        }
        return;
      }

      if (!isInteractiveHudOrModalTarget(e.target)) {
        const matched = findActionMatchingSignal(sig);
        if (matched) {
          executeShortcutAction(matched, sig.token);
        }
      }
    });

    // Support Right-Click / Android Remote Back Button (Mouse:2 / contextmenu) and Aux Buttons (Mouse:1,3,4)
    window.addEventListener('contextmenu', (e) => {
      const sig = buildSignalFromMouseButton(2, 'contextmenu');
      if (isShortcutsModalOpen()) {
        e.preventDefault();
        handleIncomingSignalForModal(sig);
        return;
      }
      if (state.mode === 'prompter') {
        const matched = findActionMatchingSignal(sig);
        if (matched) {
          e.preventDefault();
          if (!isRepeatableAction(matched)) {
            executeShortcutAction(matched, sig.token);
          }
        }
      }
    });

    window.addEventListener('auxclick', (e) => {
      if (e.button === 0) return;
      const sig = buildSignalFromMouseButton(e.button, 'auxclick');
      stopHoldRepeat(sig.token);
      if (isShortcutsModalOpen()) {
        e.preventDefault();
        handleIncomingSignalForModal(sig);
        return;
      }
      if (state.mode === 'prompter') {
        const matched = findActionMatchingSignal(sig);
        if (matched) {
          e.preventDefault();
          if (!isRepeatableAction(matched)) {
            executeShortcutAction(matched, sig.token);
          }
        }
      }
    });

    window.addEventListener('pointercancel', () => {
      clearHoldTimer();
      pointerDownActive = false;
      holdTriggered = false;
      isTouchScrollingStage = false;
      heldMouseTokens.clear();
      stopAllHoldRepeats();
    });

    // Keep focus on prompterStage after clicking any toolbar button in prompter mode
    // so Android remotes don't re-click a focused toolbar button when pressing Play
    document.querySelectorAll('#top-bar button, #hud-bar button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.mode === 'prompter') {
          btn.blur();
          dom.prompterStage.focus({ preventScroll: true });
        }
      });
    });

    // Mouse wheel manual scroll on prompter stage
    dom.prompterStage.addEventListener('wheel', (e) => {
      e.preventDefault();
      state.targetScrollOffset = clamp(
        state.targetScrollOffset + e.deltaY * 0.65,
        0,
        state.maxScroll
      );
    }, { passive: false });

    // HUD Transport & Progress Scrubber
    dom.btnPlayPause.addEventListener('click', () => triggerPlayToggleDebounced());
    dom.btnReset.addEventListener('click', resetPrompter);
    bindHoldableHudButton(dom.btnNudgeUp, 'nudgeUp', () => moveTextVertical('up'));
    bindHoldableHudButton(dom.btnNudgeDown, 'nudgeDown', () => moveTextVertical('down'));

    dom.progressBarTrack.addEventListener('click', (e) => {
      const rect = dom.progressBarTrack.getBoundingClientRect();
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      state.scrollOffset = ratio * state.maxScroll;
      state.targetScrollOffset = state.scrollOffset;
      applyScrollTransform();
    });

    // HUD Speed Controls
    dom.sliderSpeed.addEventListener('input', (e) => setSpeed(Number(e.target.value)));
    bindHoldableHudButton(dom.btnSpeedDec, 'speedDec', () => setSpeed(state.speed - 2));
    bindHoldableHudButton(dom.btnSpeedInc, 'speedInc', () => setSpeed(state.speed + 2));

    // HUD Font Size Controls
    dom.sliderFontsize.addEventListener('input', (e) => setFontSize(Number(e.target.value)));
    bindHoldableHudButton(dom.btnFontDec, 'fontDec', () => setFontSize(state.fontSize - 4));
    bindHoldableHudButton(dom.btnFontInc, 'fontInc', () => setFontSize(state.fontSize + 4));

    // HUD Width Controls
    dom.sliderWidth.addEventListener('input', (e) => setWidthPercent(Number(e.target.value)));
    bindHoldableHudButton(dom.btnWidthDec, 'widthDec', () => setWidthPercent(state.widthPercent - 4));
    bindHoldableHudButton(dom.btnWidthInc, 'widthInc', () => setWidthPercent(state.widthPercent + 4));

    // HUD 2-Line Shade Controls
    dom.sliderShade.addEventListener('input', (e) => setShadeOpacity(Number(e.target.value)));
    dom.btnShadeToggle.addEventListener('click', toggleShadeEnabled);
    dom.btnShadeCenter.addEventListener('click', centerShadePosition);

    // HUD Mirror & Fullscreen
    dom.btnMirrorX.addEventListener('click', () => setMirror('x'));
    dom.btnMirrorY.addEventListener('click', () => setMirror('y'));
    dom.btnFullscreen.addEventListener('click', toggleFullscreen);

    // KEYBOARD & ANDROID REMOTE SHORTCUTS (CUSTOMIZABLE + LIVE CAPTURE + PRESS-AND-HOLD REPEAT)
    let tabHoldTimer = null;
    let tabHoldTriggered = false;
    let lastKeyDownHandledCode = '';
    let lastKeyDownHandledAt = 0;

    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;

      // If Controls & Shortcuts Modal is open, capture or inspect any pressed key/button
      if (isShortcutsModalOpen()) {
        if (e.key === 'Escape' && !captureState.active) {
          dom.modalBackdrop.classList.add('hidden');
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const sig = buildSignalFromKeyboardEvent(e);
        if (sig) {
          lastKeyDownHandledCode = sig.token;
          lastKeyDownHandledAt = performance.now();
          heldKeyboardTokens.add(sig.token);
          handleIncomingSignalForModal(sig);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (state.playerFocused) {
          state.playerFocused = false;
          document.body.classList.remove('player-focused');
          return;
        }
      }

      if (e.key === 'Tab' && state.mode === 'prompter') {
        const hasTabHoldBinding = (state.shortcuts.focusPlayer || []).some((b) => b.token === 'Hold:Tab');
        if (hasTabHoldBinding) {
          if (e.repeat) {
            e.preventDefault();
            if (!tabHoldTriggered) {
              tabHoldTriggered = true;
              clearTimeout(tabHoldTimer);
              toggleMainPlayerFocus();
            }
            return;
          }
          if (!tabHoldTimer) {
            tabHoldTriggered = false;
            tabHoldTimer = setTimeout(() => {
              tabHoldTriggered = true;
              toggleMainPlayerFocus();
            }, 380);
          }
        }
      }

      if (isTyping) return;

      if (state.mode === 'prompter') {
        if (e.key === '?') {
          e.preventDefault();
          openShortcutsModal();
          return;
        }

        const sig = buildSignalFromKeyboardEvent(e);
        if (!sig) return;

        const matchedAction = findActionMatchingSignal(sig);
        if (matchedAction) {
          e.preventDefault();
          lastKeyDownHandledCode = sig.token;
          lastKeyDownHandledAt = performance.now();
          heldKeyboardTokens.add(sig.token);

          if (isRepeatableAction(matchedAction)) {
            if (!e.repeat) {
              executeShortcutAction(matchedAction, sig.token);
              startHoldRepeat(matchedAction, sig.token);
            } else if (!activeHoldRepeats.has(sig.token)) {
              executeShortcutAction(matchedAction, sig.token);
              startHoldRepeat(matchedAction, sig.token);
            }
          } else if (!e.repeat) {
            executeShortcutAction(matchedAction, sig.token);
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Tab') {
        clearTimeout(tabHoldTimer);
        tabHoldTimer = null;
        tabHoldTriggered = false;
      }

      const sig = buildSignalFromKeyboardEvent(e);
      if (sig) {
        stopHoldRepeat(sig.token);
        if (heldKeyboardTokens.has(sig.token)) {
          heldKeyboardTokens.delete(sig.token);
          return;
        }
      }

      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      if (isTyping) return;
      if (!sig) return;

      if (
        sig.token === lastKeyDownHandledCode &&
        performance.now() - lastKeyDownHandledAt < 500
      ) {
        return;
      }

      if (isShortcutsModalOpen()) {
        e.preventDefault();
        handleIncomingSignalForModal(sig);
        return;
      }

      // Fallback for Android Bluetooth remotes that ONLY emit keyup (without keydown)
      if (state.mode === 'prompter') {
        const matchedAction = findActionMatchingSignal(sig);
        if (matchedAction) {
          e.preventDefault();
          executeShortcutAction(matchedAction, sig.token);
        }
      }
    });

    window.addEventListener('blur', () => {
      heldKeyboardTokens.clear();
      heldMouseTokens.clear();
      stopAllHoldRepeats();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        heldKeyboardTokens.clear();
        heldMouseTokens.clear();
        stopAllHoldRepeats();
      }
    });

    // EDITOR & MULTI-DOCUMENT EVENTS (SAVED DIRECTLY TO NEON POSTGRES DB)
    dom.btnCreateDoc.addEventListener('click', () => createNewDocument(true));

    dom.inputSearchDocs.addEventListener('input', (e) => {
      state.searchQuery = e.target.value || '';
      renderDocsUI();
    });

    dom.inputDocTitle.addEventListener('input', (e) => {
      const active = getActiveDoc();
      if (!active) return;
      active.title = e.target.value;
      active.updatedAt = Date.now();
      renderDocsUI();
      scheduleDocumentSave(active);
    });

    if (dom.inputDocAuthor) {
      dom.inputDocAuthor.addEventListener('input', (e) => {
        const active = getActiveDoc();
        if (!active) return;
        active.author = e.target.value;
        active.updatedAt = Date.now();
        updateEditorStats();
        renderDocsUI();
        scheduleDocumentSave(active);
      });
    }

    if (dom.btnSaveDefaultAuthor) {
      dom.btnSaveDefaultAuthor.addEventListener('click', () => {
        const val = (dom.inputDocAuthor?.value || '').trim();
        if (!val) {
          dom.inputDocAuthor?.focus();
          return;
        }
        saveDefaultAuthorName(val);
        const active = getActiveDoc();
        if (active) {
          active.author = val;
          active.updatedAt = Date.now();
          renderDocsUI();
          scheduleDocumentSave(active);
        }
        flashSaveIndicator(`✓ Default author set: ${val}`);
      });
    }

    if (dom.authorSetupForm) {
      dom.authorSetupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = (dom.inputFirstTimeAuthor?.value || '').trim();
        if (!val) {
          dom.inputFirstTimeAuthor?.focus();
          return;
        }
        const saved = saveDefaultAuthorName(val);
        dom.authorModalBackdrop?.classList.add('hidden');

        // Apply to current active doc if it had no custom author yet
        const active = getActiveDoc();
        if (active && (!active.author || active.author === 'Beyond Headlines')) {
          active.author = saved;
          active.updatedAt = Date.now();
          scheduleDocumentSave(active);
        }
        renderDocsUI();
      });
    }

    dom.textareaDocContent.addEventListener('input', (e) => {
      const active = getActiveDoc();
      if (!active) return;
      active.content = e.target.value;
      active.updatedAt = Date.now();
      updateEditorStats();
      renderPrompterScript();
      renderDocsUI();
      scheduleDocumentSave(active);
    });

    dom.btnDuplicateDoc.addEventListener('click', duplicateActiveDocument);

    dom.btnClearDoc.addEventListener('click', () => {
      const active = getActiveDoc();
      if (!active) return;
      active.content = '';
      active.updatedAt = Date.now();
      dom.textareaDocContent.value = '';
      renderDocsUI();
      scheduleDocumentSave(active);
      dom.textareaDocContent.focus();
    });

    dom.btnDeleteDoc.addEventListener('click', deleteActiveDocument);

    // Import .docx, .doc, .rtf, .txt, .md, .srt, .vtt, .html, or any text file into Neon DB
    dom.inputImportFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      flashSaveIndicator(`↻ Importing ${file.name}...`);
      try {
        const extractedText = await extractTextFromImportedFile(file);
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
        await createNewDocument(true, cleanTitle, extractedText, getDefaultAuthorName());
        flashSaveIndicator('✓ Imported & saved to Neon DB');
      } catch (err) {
        console.error('File import error:', err);
        flashSaveIndicator('⚠ Could not parse file');
      } finally {
        dom.inputImportFile.value = '';
      }
    });

    // Export active document as .txt
    dom.btnExportDoc.addEventListener('click', () => {
      const active = getActiveDoc();
      if (!active) return;
      const blob = new Blob([active.content || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (active.title || 'autocue-script').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
      a.href = url;
      a.download = `${safeName}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Customizable Controls & Shortcuts Modal
    const openShortcutsModal = () => {
      cancelShortcutCapture();
      renderShortcutsModal();
      dom.modalBackdrop.classList.remove('hidden');
    };

    dom.btnShortcuts.addEventListener('click', (e) => {
      e.stopPropagation();
      openShortcutsModal();
    });

    dom.btnCloseModal.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelShortcutCapture();
      dom.modalBackdrop.classList.add('hidden');
    });

    if (dom.btnResetShortcuts) {
      dom.btnResetShortcuts.addEventListener('click', (e) => {
        e.stopPropagation();
        resetAllShortcutsToDefaults();
      });
    }

    if (dom.btnCancelCapture) {
      dom.btnCancelCapture.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelShortcutCapture();
      });
    }

    if (dom.shortcutsListContainer) {
      dom.shortcutsListContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-remove-action]');
        if (removeBtn) {
          e.stopPropagation();
          const actionId = removeBtn.getAttribute('data-remove-action');
          const token = removeBtn.getAttribute('data-remove-token');
          removeShortcutBinding(actionId, token);
          return;
        }

        const captureBtn = e.target.closest('[data-capture-action]');
        if (captureBtn) {
          e.stopPropagation();
          const actionId = captureBtn.getAttribute('data-capture-action');
          const mode = captureBtn.getAttribute('data-capture-mode') || 'add';
          startShortcutCapture(actionId, mode);
        }
      });
    }

    dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.modalBackdrop && !captureState.active) {
        cancelShortcutCapture();
        dom.modalBackdrop.classList.add('hidden');
      }
    });

    window.addEventListener('resize', () => {
      updateLayoutAndShadeMetrics(true);
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => updateLayoutAndShadeMetrics(true), 120);
    });
  }

  /* ========================================================================
     7. MULTI-FORMAT DOCUMENT IMPORTER (.DOCX, .DOC, .RTF, .TXT, .MD, ETC.)
     ======================================================================== */
  async function extractTextFromImportedFile(file) {
    const fileName = (file.name || '').toLowerCase();
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 1. Check for ZIP magic header (PK\x03\x04) -> .docx / OpenXML document
    if (
      fileName.endsWith('.docx') ||
      (bytes.length > 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04)
    ) {
      return await extractTextFromDocxBuffer(buffer);
    }

    // 2. Check for RTF (.rtf or .doc saved as RTF starting with "{\rtf")
    const asciiPrefix = new TextDecoder('ascii').decode(bytes.subarray(0, 64)).trimStart();
    if (fileName.endsWith('.rtf') || asciiPrefix.startsWith('{\\rtf')) {
      const rtfRaw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return parseRtfToPlainText(rtfRaw);
    }

    // 3. Check for Legacy Binary Word .doc (OLE2 Compound Document: D0 CF 11 E0 A1 B1 1A E1)
    if (
      bytes.length > 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0
    ) {
      return extractTextFromBinaryDoc(bytes);
    }

    // 4. Decode as UTF-8 text (covers .txt, .md, .srt, .vtt, .html, .xml, .csv, .json, HTML/XML .doc)
    let rawText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    // If HTML or Word XML (.doc saved as HTML/XML, .html, .htm)
    const trimmed = rawText.trimStart();
    if (
      fileName.endsWith('.html') ||
      fileName.endsWith('.htm') ||
      (fileName.endsWith('.doc') &&
        (trimmed.startsWith('<') || trimmed.startsWith('MIME-Version:')))
    ) {
      return extractTextFromHtmlOrXml(rawText);
    }

    // If .srt or .vtt subtitle file, clean timestamp lines for teleprompter reading
    if (fileName.endsWith('.srt') || fileName.endsWith('.vtt')) {
      return cleanSubtitleText(rawText);
    }

    return rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  /**
   * Native browser .docx extractor:
   * Locates `word/document.xml` in the ZIP Central Directory / Local Headers,
   * decompresses it with Web `DecompressionStream('deflate-raw')`, and parses
   * `<w:p>`, `<w:br/>`, `<w:tab/>`, and `<w:t>` elements into clean script text.
   */
  async function extractTextFromDocxBuffer(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8');

    // Locate End of Central Directory (EOCD) signature 0x06054b50
    let eocdOffset = -1;
    const minEocdSearch = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= minEocdSearch; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    let docXmlBytes = null;
    let compressionMethod = 0;

    if (eocdOffset !== -1) {
      const cdCount = view.getUint16(eocdOffset + 10, true);
      const cdOffset = view.getUint32(eocdOffset + 16, true);
      let ptr = cdOffset;

      for (let i = 0; i < cdCount && ptr + 46 <= bytes.length; i++) {
        if (view.getUint32(ptr, true) !== 0x02014b50) break;
        const compMethod = view.getUint16(ptr + 10, true);
        const compSize = view.getUint32(ptr + 20, true);
        const nameLen = view.getUint16(ptr + 28, true);
        const extraLen = view.getUint16(ptr + 30, true);
        const commentLen = view.getUint16(ptr + 32, true);
        const localHeaderOffset = view.getUint32(ptr + 42, true);
        const entryName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

        if (entryName === 'word/document.xml') {
          const localNameLen = view.getUint16(localHeaderOffset + 26, true);
          const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
          const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
          docXmlBytes = bytes.subarray(dataStart, dataStart + compSize);
          compressionMethod = compMethod;
          break;
        }
        ptr += 46 + nameLen + extraLen + commentLen;
      }
    }

    if (!docXmlBytes) {
      throw new Error('word/document.xml not found in .docx archive');
    }

    let xmlString = '';
    if (compressionMethod === 0) {
      xmlString = decoder.decode(docXmlBytes);
    } else if (compressionMethod === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(docXmlBytes);
      writer.close();
      const decompressedBuffer = await new Response(ds.readable).arrayBuffer();
      xmlString = decoder.decode(decompressedBuffer);
    } else {
      throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
    }

    const xmlDoc = new DOMParser().parseFromString(xmlString, 'application/xml');
    const paragraphs = [];
    const pNodes = xmlDoc.getElementsByTagNameNS('*', 'p');

    for (let i = 0; i < pNodes.length; i++) {
      const p = pNodes[i];
      let pText = '';
      const walk = (node) => {
        for (let c = node.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 1) {
            const local = c.localName;
            if (local === 't') {
              pText += c.textContent || '';
            } else if (local === 'tab') {
              pText += '\t';
            } else if (local === 'br' || local === 'cr') {
              pText += '\n';
            } else {
              walk(c);
            }
          }
        }
      };
      walk(p);
      if (pText.trim().length > 0) {
        paragraphs.push(pText.trimEnd());
      }
    }

    return paragraphs.join('\n\n').trim();
  }

  /**
   * Extracts clean readable text from legacy OLE2 binary .doc files
   * by scanning both UTF-16LE and 8-bit character runs inside the WordDocument stream.
   */
  function extractTextFromBinaryDoc(bytes) {
    // 1. Try extracting UTF-16LE runs (even-aligned printable characters with 0x00 high bytes)
    const utf16Chunks = [];
    let currentUtf16 = '';
    for (let i = 512; i + 1 < bytes.length; i += 2) {
      const lo = bytes[i];
      const hi = bytes[i + 1];
      if (
        hi === 0x00 &&
        ((lo >= 0x20 && lo <= 0x7e) || lo === 0x0d || lo === 0x0a || lo === 0x09)
      ) {
        currentUtf16 += lo === 0x0d ? '\n' : String.fromCharCode(lo);
      } else if (hi >= 0x20 && hi <= 0x20 && lo >= 0x10) {
        currentUtf16 += String.fromCharCode((hi << 8) | lo);
      } else {
        if (currentUtf16.trim().length >= 24) {
          utf16Chunks.push(currentUtf16.trim());
        }
        currentUtf16 = '';
      }
    }
    if (currentUtf16.trim().length >= 24) {
      utf16Chunks.push(currentUtf16.trim());
    }

    // 2. Also scan 8-bit ANSI/CP1252 printable runs inside the WordDocument stream
    const ansiChunks = [];
    let currentAnsi = '';
    for (let i = 512; i < bytes.length; i++) {
      const b = bytes[i];
      if ((b >= 0x20 && b <= 0x7e) || b === 0x0d || b === 0x0a || b === 0x09) {
        currentAnsi += b === 0x0d ? '\n' : String.fromCharCode(b);
      } else {
        const cleaned = currentAnsi.trim();
        if (
          cleaned.length >= 28 &&
          !/^(Root Entry|WordDocument|CompObj|SummaryInformation|DocumentSummaryInformation|Normal\.dot|Microsoft Word|MSWordDoc)/i.test(
            cleaned
          )
        ) {
          ansiChunks.push(cleaned);
        }
        currentAnsi = '';
      }
    }

    const bestAnsi = ansiChunks.join('\n\n');
    const bestUtf16 = utf16Chunks.join('\n\n');
    const chosen = bestAnsi.length >= bestUtf16.length ? bestAnsi : bestUtf16;
    return chosen.replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * Parses Rich Text Format (.rtf) into plain text.
   */
  function parseRtfToPlainText(rtf) {
    let out = '';
    let i = 0;
    const len = rtf.length;
    const stack = [];
    let ignorable = false;
    let ucSkip = 1;

    const skipDestinations = new Set([
      'fonttbl',
      'colortbl',
      'stylesheet',
      'info',
      'pict',
      'object',
      'header',
      'footer',
      'headerl',
      'headerr',
      'footerl',
      'footerr',
      'footnote',
      'xmlopen'
    ]);

    while (i < len) {
      const ch = rtf[i];
      if (ch === '{') {
        stack.push({ ignorable, ucSkip });
        i++;
      } else if (ch === '}') {
        const prev = stack.pop();
        if (prev) {
          ignorable = prev.ignorable;
          ucSkip = prev.ucSkip;
        }
        i++;
      } else if (ch === '\\') {
        i++;
        if (i >= len) break;
        const next = rtf[i];
        if (next === '*') {
          ignorable = true;
          i++;
        } else if (next === "'" && i + 2 < len) {
          const hex = rtf.slice(i + 1, i + 3);
          if (!ignorable) {
            const code = parseInt(hex, 16);
            if (!Number.isNaN(code)) out += String.fromCharCode(code);
          }
          i += 3;
        } else if (next === '\\' || next === '{' || next === '}') {
          if (!ignorable) out += next;
          i++;
        } else if (next === '~') {
          if (!ignorable) out += ' ';
          i++;
        } else if (next === '\n' || next === '\r') {
          if (!ignorable) out += '\n';
          i++;
        } else {
          let word = '';
          while (i < len && /[a-zA-Z]/.test(rtf[i])) {
            word += rtf[i++];
          }
          let param = '';
          if (i < len && (rtf[i] === '-' || /[0-9]/.test(rtf[i]))) {
            param += rtf[i++];
            while (i < len && /[0-9]/.test(rtf[i])) {
              param += rtf[i++];
            }
          }
          if (i < len && rtf[i] === ' ') {
            i++;
          }

          if (skipDestinations.has(word)) {
            ignorable = true;
          } else if (!ignorable) {
            if (word === 'par' || word === 'line' || word === 'sect' || word === 'row') {
              out += '\n';
            } else if (word === 'tab' || word === 'cell') {
              out += '\t';
            } else if (word === 'emdash') {
              out += '—';
            } else if (word === 'endash') {
              out += '–';
            } else if (word === 'lquote') {
              out += '‘';
            } else if (word === 'rquote') {
              out += '’';
            } else if (word === 'ldblquote') {
              out += '“';
            } else if (word === 'rdblquote') {
              out += '”';
            } else if (word === 'uc' && param !== '') {
              ucSkip = Math.max(0, parseInt(param, 10) || 1);
            } else if (word === 'u' && param !== '') {
              let code = parseInt(param, 10);
              if (code < 0) code += 65536;
              out += String.fromCodePoint(code);
              for (let s = 0; s < ucSkip && i < len; s++) {
                if (rtf.startsWith("\\'", i)) {
                  i += 4;
                } else {
                  i++;
                }
              }
            }
          }
        }
      } else if (ch === '\r' || ch === '\n') {
        i++;
      } else {
        if (!ignorable) out += ch;
        i++;
      }
    }

    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  function extractTextFromHtmlOrXml(raw) {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script, style, head, meta, link').forEach((el) => el.remove());
    doc.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6, tr').forEach((el) => {
      el.after(document.createTextNode('\n'));
    });
    return (doc.body?.textContent || raw).replace(/\n{3,}/g, '\n\n').trim();
  }

  function cleanSubtitleText(raw) {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/^WEBVTT.*$/gm, '')
      .replace(/^\d+\s*$/gm, '')
      .replace(/^\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /* ========================================================================
     8. SERVICE WORKER REGISTRATION
     ======================================================================== */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
          console.warn('Service worker registration skipped:', err);
        });
      });
    }
  }

  /* ========================================================================
     9. UTILITIES
     ======================================================================== */
  function isRunningAsPwa() {
    return (
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true
    );
  }

  function requestHardwareFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    if (el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      return true;
    }
    if (el.webkitRequestFullscreen) {
      try {
        el.webkitRequestFullscreen();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  function ensurePwaFullscreen() {
    if (isRunningAsPwa()) {
      requestHardwareFullscreen();
    }
  }

  function toggleFullscreen() {
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFs) {
      const supported = requestHardwareFullscreen();
      if (!supported) {
        // Fallback for iOS / standalone PWA where Fullscreen API is unavailable:
        // toggle full-canvas player focus (hiding top & bottom bars)
        toggleMainPlayerFocus();
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      try {
        document.webkitExitFullscreen();
      } catch {
        // Ignore
      }
    }
  }

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function countWords(str) {
    if (!str || !str.trim()) return 0;
    return str.trim().split(/\s+/).length;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return 'just now';
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 45) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  }

  /* ========================================================================
     10. INITIALIZATION
     ======================================================================== */
  async function init() {
    clearLegacyLocalStorage();

    // Responsive default font size before Neon DB settings arrive
    if (window.innerWidth <= 540) {
      state.fontSize = 36;
      state.widthPercent = 92;
    }

    syncControlsFromState();
    renderShortcutsModal();
    bindEvents();
    registerServiceWorker();

    // Prompt for user's default Author name on first open (stored in localStorage)
    checkFirstTimeAuthorPrompt();

    // Load all documents & settings once on startup from Neon Postgres Database
    // Subsequent syncs happen only when clicking the Sync button
    await loadAllFromDatabase(true);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        updateLayoutAndShadeMetrics(true);
      });
    }

    requestAnimationFrame(animationLoop);
  }

  init();
})();
