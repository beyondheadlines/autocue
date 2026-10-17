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
    btnCloseModal: document.getElementById('btn-close-modal')
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

  function togglePlay() {
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
    // STAGE INTERACTIONS:
    // 1. When playing: Clicking anywhere on the screen pauses immediately!
    // 2. When paused: Tap & Hold (420ms) focuses main content player part!
    // ======================================================================
    let holdTimer = null;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let touchScrollStartOffset = 0;
    let isTouchScrollingStage = false;
    let justPausedOnPointerDown = false;

    const clearHoldTimer = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    dom.prompterStage.addEventListener('pointerdown', (e) => {
      if (state.isDraggingShade || e.target.closest('#shade-drag-handle')) return;

      // Requirement: When the script is in play mode, clicking anywhere on screen pauses it
      if (state.isPlaying) {
        justPausedOnPointerDown = true;
        clearHoldTimer();
        pausePrompter();
        return;
      }

      justPausedOnPointerDown = false;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      touchScrollStartOffset = state.targetScrollOffset;
      isTouchScrollingStage = false;

      clearHoldTimer();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!isTouchScrollingStage && !state.isDraggingShade && !state.isPlaying) {
          toggleMainPlayerFocus();
        }
      }, 420);
    });

    dom.prompterStage.addEventListener('pointermove', (e) => {
      if (state.isDraggingShade) {
        clearHoldTimer();
        return;
      }
      if (!holdTimer && !isTouchScrollingStage) return;

      const dx = Math.abs(e.clientX - pointerStartX);
      const dy = e.clientY - pointerStartY;

      if (dx > 10 || Math.abs(dy) > 10) {
        clearHoldTimer();
        if (e.pointerType === 'touch' && !state.isDraggingShade) {
          isTouchScrollingStage = true;
        }
      }

      if (isTouchScrollingStage && e.pointerType === 'touch') {
        state.targetScrollOffset = clamp(touchScrollStartOffset - dy * 1.15, 0, state.maxScroll);
        state.scrollOffset = state.targetScrollOffset;
        applyScrollTransform();
      }
    });

    dom.prompterStage.addEventListener('click', (e) => {
      if (state.justDraggedShade || state.isDraggingShade) return;
      if (e.target.closest('#shade-drag-handle')) return;
      if (justPausedOnPointerDown) {
        justPausedOnPointerDown = false;
        return;
      }
      if (state.isPlaying) {
        pausePrompter();
      }
    });

    window.addEventListener('pointerup', clearHoldTimer);
    window.addEventListener('pointercancel', clearHoldTimer);

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
    dom.btnPlayPause.addEventListener('click', () => togglePlay());
    dom.btnReset.addEventListener('click', resetPrompter);
    dom.btnNudgeUp.addEventListener('click', () => moveTextVertical('up'));
    dom.btnNudgeDown.addEventListener('click', () => moveTextVertical('down'));

    dom.progressBarTrack.addEventListener('click', (e) => {
      const rect = dom.progressBarTrack.getBoundingClientRect();
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      state.scrollOffset = ratio * state.maxScroll;
      state.targetScrollOffset = state.scrollOffset;
      applyScrollTransform();
    });

    // HUD Speed Controls
    dom.sliderSpeed.addEventListener('input', (e) => setSpeed(Number(e.target.value)));
    dom.btnSpeedDec.addEventListener('click', () => setSpeed(state.speed - 2));
    dom.btnSpeedInc.addEventListener('click', () => setSpeed(state.speed + 2));

    // HUD Font Size Controls
    dom.sliderFontsize.addEventListener('input', (e) => setFontSize(Number(e.target.value)));
    dom.btnFontDec.addEventListener('click', () => setFontSize(state.fontSize - 4));
    dom.btnFontInc.addEventListener('click', () => setFontSize(state.fontSize + 4));

    // HUD Width Controls
    dom.sliderWidth.addEventListener('input', (e) => setWidthPercent(Number(e.target.value)));
    dom.btnWidthDec.addEventListener('click', () => setWidthPercent(state.widthPercent - 4));
    dom.btnWidthInc.addEventListener('click', () => setWidthPercent(state.widthPercent + 4));

    // HUD 2-Line Shade Controls
    dom.sliderShade.addEventListener('input', (e) => setShadeOpacity(Number(e.target.value)));
    dom.btnShadeToggle.addEventListener('click', toggleShadeEnabled);
    dom.btnShadeCenter.addEventListener('click', centerShadePosition);

    // HUD Mirror & Fullscreen
    dom.btnMirrorX.addEventListener('click', () => setMirror('x'));
    dom.btnMirrorY.addEventListener('click', () => setMirror('y'));
    dom.btnFullscreen.addEventListener('click', toggleFullscreen);

    // KEYBOARD SHORTCUTS (ENTER TO START/STOP, TAB & HOLD TO FOCUS PLAYER, ARROWS)
    let tabHoldTimer = null;
    let tabHoldTriggered = false;

    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;

      if (e.key === 'Escape') {
        if (!dom.modalBackdrop.classList.contains('hidden')) {
          dom.modalBackdrop.classList.add('hidden');
          return;
        }
        if (state.playerFocused) {
          state.playerFocused = false;
          document.body.classList.remove('player-focused');
          return;
        }
      }

      if (e.key === 'Tab' && state.mode === 'prompter') {
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

      if (isTyping) return;

      if (state.mode === 'prompter') {
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            togglePlay();
            break;
          case 'ArrowUp':
            e.preventDefault();
            moveTextVertical('up');
            break;
          case 'ArrowDown':
            e.preventDefault();
            moveTextVertical('down');
            break;
          case 'ArrowLeft':
            e.preventDefault();
            setSpeed(state.speed - 2);
            break;
          case 'ArrowRight':
            e.preventDefault();
            setSpeed(state.speed + 2);
            break;
          case '[':
            e.preventDefault();
            setWidthPercent(state.widthPercent - 4);
            break;
          case ']':
            e.preventDefault();
            setWidthPercent(state.widthPercent + 4);
            break;
          case '-':
          case '_':
            e.preventDefault();
            setFontSize(state.fontSize - 4);
            break;
          case '=':
          case '+':
            e.preventDefault();
            setFontSize(state.fontSize + 4);
            break;
          case 'm':
          case 'M':
            e.preventDefault();
            setMirror('x');
            break;
          case 'v':
          case 'V':
            e.preventDefault();
            setMirror('y');
            break;
          case 'r':
          case 'R':
            e.preventDefault();
            resetPrompter();
            break;
          case 'e':
          case 'E':
            e.preventDefault();
            setViewMode('editor');
            break;
          case 'f':
          case 'F':
            e.preventDefault();
            toggleFullscreen();
            break;
          case '?':
            e.preventDefault();
            dom.modalBackdrop.classList.toggle('hidden');
            break;
          default:
            break;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Tab') {
        clearTimeout(tabHoldTimer);
        tabHoldTimer = null;
        tabHoldTriggered = false;
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

    // Shortcuts Modal
    dom.btnShortcuts.addEventListener('click', () => {
      dom.modalBackdrop.classList.remove('hidden');
    });
    dom.btnCloseModal.addEventListener('click', () => {
      dom.modalBackdrop.classList.add('hidden');
    });
    dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.modalBackdrop) {
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
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
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
