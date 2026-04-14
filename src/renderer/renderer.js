// PlantUML Editor - Main Renderer
// Handles all UI interactions, CodeMirror integration, preview, and settings

(function () {
  'use strict';

  // ============================================
  // State
  // ============================================
  const state = {
    tabs: [], // { path, name, isPermanent, isModified, content, scrollState, cursorPosition, isImage }
    activeTabIndex: -1,
    currentFolder: null,
    fileTree: [],
    config: {},
    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    renderTimeout: null,
    isRendering: false,
    lastRenderedSource: null,
    editorView: null,
    previewImageData: null,
    cmReady: false,
    isSettingContent: false,
    textWrap: false,
    sidebarCollapsed: false,
    languageCompartment: null,
    _toastTimeout: null,
    contextMenuPath: null,
    contextMenuType: null // 'file' or 'directory'
  };

  // Helper to get active tab
  function getActiveTab() {
    return state.tabs[state.activeTabIndex] || null;
  }

  // ============================================
  // Immediately bind window controls (no async dependency)
  // ============================================
  document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
  document.getElementById('btn-close').addEventListener('click', async () => {
    // Check for any modified tabs
    const modifiedTabs = state.tabs.filter(t => t.isModified);
    if (modifiedTabs.length > 0) {
      const confirm = await showConfirm(
        'Unsaved Changes',
        `You have ${modifiedTabs.length} file(s) with unsaved changes. Close anyway?`,
        'Close Anyway',
        'btn-danger'
      );
      if (!confirm) return;
    }
    window.electronAPI.close();
  });

  // ============================================
  // Immediately bind sidebar controls
  // ============================================
  document.getElementById('btn-open-folder').addEventListener('click', () => openFolderDialog());
  const emptyFolderBtn = document.getElementById('btn-open-folder-empty');
  if (emptyFolderBtn) emptyFolderBtn.addEventListener('click', () => openFolderDialog());
  document.getElementById('btn-collapse-all').addEventListener('click', collapseAllFolders);
  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => toggleSidebar());
  document.getElementById('btn-refresh-folder').addEventListener('click', () => refreshFolder());
  document.getElementById('btn-new-file').addEventListener('click', () => handleNewFile(state.currentFolder));
  document.getElementById('btn-new-folder').addEventListener('click', () => handleNewFolder(state.currentFolder));

  // Context Menu Global Handlers
  document.getElementById('ctx-new-file').addEventListener('click', () => {
    handleNewFile(state.contextMenuPath, state.contextMenuType);
    hideContextMenu();
  });
  document.getElementById('ctx-new-folder').addEventListener('click', () => {
    handleNewFolder(state.contextMenuPath, state.contextMenuType);
    hideContextMenu();
  });
  document.getElementById('ctx-delete').addEventListener('click', () => {
    handleDelete(state.contextMenuPath, state.contextMenuType);
    hideContextMenu();
  });
  document.getElementById('btn-open-explorer').addEventListener('click', () => {
    if (state.currentFolder) window.electronAPI.openPath(state.currentFolder);
  });

  document.getElementById('ctx-open-explorer').addEventListener('click', () => {
    window.electronAPI.openPath(state.contextMenuPath);
    hideContextMenu();
  });

  document.getElementById('ctx-rename').addEventListener('click', () => {
    handleRename(state.contextMenuPath, state.contextMenuType);
    hideContextMenu();
  });

  window.addEventListener('click', () => hideContextMenu());
  window.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.tree-item')) hideContextMenu();
  });

  // ============================================
  // Immediately bind preview controls
  // ============================================
  document.getElementById('btn-zoom-in').addEventListener('click', () => zoomBy(0.25));
  document.getElementById('btn-zoom-out').addEventListener('click', () => zoomBy(-0.25));
  document.getElementById('btn-zoom-reset').addEventListener('click', resetPanZoom);
  document.getElementById('btn-copy-image').addEventListener('click', copyImage);
  document.getElementById('btn-export').addEventListener('click', () => exportDiagram());
  document.getElementById('btn-settings').addEventListener('click', () => openSettings());
  document.getElementById('btn-toggle-wrap').addEventListener('click', () => toggleTextWrap());
  document.getElementById('btn-render-now').addEventListener('click', () => renderPreview(true));
  document.getElementById('btn-save').addEventListener('click', saveCurrentFile);
  document.getElementById('btn-tab-left').addEventListener('click', () => moveTabLeft());
  document.getElementById('btn-tab-right').addEventListener('click', () => moveTabRight());

  // Settings modal
  document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
  document.getElementById('btn-cancel-settings').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  // Settings browse buttons
  document.getElementById('btn-browse-jar').addEventListener('click', async () => {
    const filePath = await window.electronAPI.openFile([
      { name: 'JAR Files', extensions: ['jar'] }
    ]);
    if (filePath) document.getElementById('setting-jar-path').value = filePath;
  });
  document.getElementById('btn-reset-jar').addEventListener('click', () => {
    document.getElementById('setting-jar-path').value = '';
  });
  document.getElementById('btn-browse-java').addEventListener('click', async () => {
    const filePath = await window.electronAPI.openFile([
      { name: 'Executable', extensions: ['exe', '*'] }
    ]);
    if (filePath) document.getElementById('setting-java-path').value = filePath;
  });
  document.getElementById('btn-browse-export').addEventListener('click', async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) document.getElementById('setting-export-folder').value = folderPath;
  });

  // ============================================
  // Preview pan/zoom mouse handlers
  // ============================================
  const viewport = document.getElementById('preview-viewport');
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoomBy(delta);
  }, { passive: false });

  viewport.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      state.isPanning = true;
      state.panStartX = e.clientX - state.panX;
      state.panStartY = e.clientY - state.panY;
      viewport.classList.add('grabbing');
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
      state.panX = e.clientX - state.panStartX;
      state.panY = e.clientY - state.panStartY;
      updatePreviewTransform();
    }
  });
  window.addEventListener('mouseup', () => {
    if (state.isPanning) {
      state.isPanning = false;
      viewport.classList.remove('grabbing');
    }
  });

  // ============================================
  // Keyboard shortcuts
  // ============================================
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); openFolderDialog(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveCurrentFile(); }
    if (e.ctrlKey && e.key === ',') { e.preventDefault(); openSettings(); }
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      const activeTab = getActiveTab();
      if (activeTab) {
        window.electronAPI.openPath(getFileDirectory(activeTab.path));
      } else if (state.currentFolder) {
        window.electronAPI.openPath(state.currentFolder);
      }
    }
    if (e.key === 'Escape') { closeSettings(); }
  });

  // ============================================
  // Resize handles
  // ============================================
  setupResizeHandles();

  // ============================================
  // Check for bundled CodeMirror
  // ============================================
  function checkCodeMirror() {
    return new Promise((resolve, reject) => {
      if (window.CM) {
        resolve();
      } else {
        // Wait a bit if it's not ready yet (unlikely since it's a script tag above renderer.js)
        let attempts = 0;
        const interval = setInterval(() => {
          if (window.CM) {
            clearInterval(interval);
            resolve();
          } else if (attempts++ > 20) {
            clearInterval(interval);
            reject(new Error('CodeMirror bundle not found'));
          }
        }, 50);
      }
    });
  }

  function getPumlLanguage() {
    const { StreamLanguage, tags } = window.CM;
    const config = {
      tokenTable: {
        keyword: tags.keyword,
        string: tags.string,
        comment: tags.lineComment,
        arrow: tags.operator,
        tag: tags.tagName,
        color: tags.atom,
        bracket: tags.bracket,
        number: tags.number,
        skinparam: tags.name,
        preprocessor: tags.processingInstruction,
        operator: tags.operator,
        variable: tags.variableName
      },
      languageData: {
        commentTokens: { line: "'", block: { open: "/'", close: "'/" } }
      }
    };
    const lang = StreamLanguage.define(window.plantumlMode, config);
    return [lang, lang.data.of(config.languageData)];
  }

  async function init() {
    try {
      // Load config
      state.config = await window.electronAPI.getConfig();
      document.getElementById('status-encoding').textContent = state.config.encoding || 'UTF-8';
    } catch (err) {
      console.error('Failed to load config:', err);
    }

    try {
      // Check CodeMirror
      await checkCodeMirror();
      state.cmReady = true;
      setupEditor();
      console.log('CodeMirror initialized successfully from local bundle');
    } catch (err) {
      console.error('Failed to initialize CodeMirror:', err);
      showToast('Failed to load code editor bundle.', 'error');
    }

    // Auto-reopen last folder and tabs
    try {
      if (state.config.lastOpenedFolder) {
        const exists = await window.electronAPI.fileExists(state.config.lastOpenedFolder);
        if (exists) {
          await openFolder(state.config.lastOpenedFolder);

          if (state.config.openFiles && Array.isArray(state.config.openFiles)) {
            for (const filePath of state.config.openFiles) {
              const fileExists = await window.electronAPI.fileExists(filePath);
              if (fileExists) {
                await openFile(filePath, null, true); // Open as permanent
              }
            }
            if (state.config.activeFile) {
              const index = state.tabs.findIndex(t => t.path === state.config.activeFile);
              if (index !== -1) switchTab(index);
            }
          } else if (state.config.lastOpenedFile) {
            // Legacy support
            const fileExists = await window.electronAPI.fileExists(state.config.lastOpenedFile);
            if (fileExists) {
              await openFile(state.config.lastOpenedFile, null, true);
            }
          }
        }
      }

      // Apply saved layout
      if (state.config.sidebarWidth) {
        document.getElementById('sidebar').style.width = state.config.sidebarWidth + 'px';
      }
      if (state.config.previewWidth) {
        document.getElementById('preview-panel').style.width = state.config.previewWidth + 'px';
      }
      if (state.config.sidebarCollapsed) {
        state.sidebarCollapsed = false; // Initial false to allow toggleSidebar to work
        toggleSidebar(true);
      }
    } catch (err) {
      console.error('Failed to reopen last folder:', err);
    }
  }

  // ============================================
  // CodeMirror Editor
  // ============================================
  function setupEditor() {
    const {
      EditorView, EditorState, keymap, lineNumbers, highlightActiveLineGutter,
      highlightSpecialChars, drawSelection, highlightActiveLine,
      rectangularSelection, crosshairCursor, defaultKeymap, history,
      historyKeymap, indentWithTab, StreamLanguage, bracketMatching,
      indentOnInput, foldGutter, foldKeymap, searchKeymap,
      highlightSelectionMatches, closeBrackets, closeBracketsKeymap,
      tags, HighlightStyle, syntaxHighlighting, Compartment,
      toggleComment
    } = window.CM;

    const wrapCompartment = new Compartment();
    state.wrapCompartment = wrapCompartment;
    const languageCompartment = new Compartment();
    state.languageCompartment = languageCompartment;

    const plantumlHighlightStyle = HighlightStyle.define([
      { tag: tags.keyword, color: '#c792ea', fontWeight: '500' },
      { tag: tags.string, color: '#c3e88d' },
      { tag: tags.lineComment, color: '#546e7a', fontStyle: 'italic' },
      { tag: tags.blockComment, color: '#546e7a', fontStyle: 'italic' },
      { tag: tags.operator, color: '#f78c6c', fontWeight: '500' },
      { tag: tags.tagName, color: '#ffcb6b' },
      { tag: tags.atom, color: '#f07178' }, // For color literals
      { tag: tags.bracket, color: '#89ddff' },
      { tag: tags.number, color: '#f78c6c' },
      { tag: tags.name, color: '#ff5370' }, // For skinparam
      { tag: tags.processingInstruction, color: '#c792ea' }, // For preprocessor
      { tag: tags.variableName, color: '#82aaff' } // For !$variables
    ]);

    const plantumlLang = getPumlLanguage();

    const darkTheme = EditorView.theme({
      '&': { backgroundColor: '#0c0c18', color: '#e8e8f0' },
      '.cm-content': {
        caretColor: '#6366f1',
        fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
        fontSize: '14px', lineHeight: '1.6'
      },
      '.cm-cursor': { borderLeftColor: '#6366f1', borderLeftWidth: '2px' },
      '.cm-selectionBackground': { backgroundColor: 'rgba(99, 102, 241, 0.2) !important' },
      '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(99, 102, 241, 0.3) !important' },
      '.cm-gutters': {
        backgroundColor: '#12121f', color: '#5c5c78',
        borderRight: '1px solid rgba(255,255,255,0.06)'
      },
      '.cm-activeLineGutter': { backgroundColor: '#252540', color: '#9898b0' },
      '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.02)' },
      '.cm-matchingBracket': { backgroundColor: 'rgba(99, 102, 241, 0.2)', outline: '1px solid #6366f1' },
      '.cm-foldGutter .cm-gutterElement': { color: '#5c5c78', cursor: 'pointer' }
    }, { dark: true });

    const startState = EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        state.languageCompartment.of(plantumlLang),
        syntaxHighlighting(plantumlHighlightStyle),
        wrapCompartment.of(state.textWrap ? EditorView.lineWrapping : []),
        darkTheme,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
          {
            key: 'Mod-/', run: (view) => {
              console.log('Toggle comment triggered');
              return toggleComment(view);
            }
          },
          { key: 'Mod-s', run: () => { saveCurrentFile(); return true; } }
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !state.isSettingContent) {
            const activeTab = getActiveTab();
            if (activeTab) {
              activeTab.content = update.state.doc.toString();
              if (!activeTab.isModified) {
                activeTab.isModified = true;
                if (!activeTab.isPermanent) {
                  activeTab.isPermanent = true;
                }
                updateTabBar();
                updateStatusBar();
              }
              scheduleRender();
            }
          }
        })
      ]
    });

    state.editorView = new EditorView({
      state: startState,
      parent: document.getElementById('editor-container')
    });

    // Hide the editor initially until a file is opened
    state.editorView.dom.style.display = 'none';
  }

  function setEditorContent(content) {
    if (!state.editorView) return;
    state.isSettingContent = true;
    state.editorView.dispatch({
      changes: { from: 0, to: state.editorView.state.doc.length, insert: content }
    });
    state.isSettingContent = false;
  }

  function getEditorContent() {
    if (!state.editorView) return '';
    return state.editorView.state.doc.toString();
  }

  // ============================================
  // File Tree
  // ============================================
  async function openFolderDialog() {
    const folderPath = await window.electronAPI.openFolder();
    if (folderPath) await openFolder(folderPath);
  }

  async function openFolder(folderPath) {
    state.currentFolder = folderPath;
    state.fileTree = await window.electronAPI.readDirectory(folderPath);
    renderFileTree();
  }

  async function refreshFolder() {
    if (state.currentFolder) {
      await openFolder(state.currentFolder);
      showToast('Folder refreshed', 'success');
    }
  }

  function renderFileTree() {
    const container = document.getElementById('file-tree');
    container.innerHTML = '';

    if (state.fileTree.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>This folder is empty</p></div>';
      return;
    }

    const tree = buildTreeDOM(state.fileTree, 0);
    container.appendChild(tree);
  }

  function buildTreeDOM(items, depth) {
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      if (item.type === 'directory') {
        const dirEl = document.createElement('div');
        dirEl.className = 'tree-node';

        const header = document.createElement('div');
        header.className = 'tree-item';
        header.style.paddingLeft = (12 + depth * 16) + 'px';
        header.draggable = true;
        header.innerHTML = `
          <span class="tree-item-expand">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
          </span>
          <span class="tree-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          </span>
          <span class="tree-item-name">${escapeHtml(item.name)}</span>
        `;

        const childContainer = document.createElement('div');
        childContainer.className = 'tree-children';

        header.addEventListener('click', () => {
          header.querySelector('.tree-item-expand').classList.toggle('expanded');
          childContainer.classList.toggle('expanded');
        });

        header.addEventListener('contextmenu', (e) => {
          showContextMenu(e, item.path, 'directory');
        });

        // Drag and Drop for Directory
        header.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', item.path);
          e.dataTransfer.setData('item-type', 'directory');
          e.dataTransfer.effectAllowed = 'move';
          e.stopPropagation();
        });

        header.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          header.classList.add('drag-over');
          e.stopPropagation();
        });

        header.addEventListener('dragleave', (e) => {
          header.classList.remove('drag-over');
          e.stopPropagation();
        });

        header.addEventListener('drop', async (e) => {
          e.preventDefault();
          header.classList.remove('drag-over');
          e.stopPropagation();
          const srcPath = e.dataTransfer.getData('text/plain');
          if (!srcPath || srcPath === item.path) return;

          const name = srcPath.split(/[\\/]/).pop();
          const sep = item.path.includes('\\') ? '\\' : '/';
          const destPath = item.path + (item.path.endsWith(sep) ? '' : sep) + name;

          if (srcPath === destPath) return;

          const result = await window.electronAPI.moveItem(srcPath, destPath);
          if (result.success) {
            if (state.currentFile === srcPath) {
              state.currentFile = destPath;
              window.electronAPI.setConfig('lastOpenedFile', destPath);
            }
            await refreshFolder();
            showToast('Moved successfully', 'success');
          } else {
            showToast('Move failed: ' + result.error, 'error');
          }
        });

        if (item.children && item.children.length > 0) {
          childContainer.appendChild(buildTreeDOM(item.children, depth + 1));
        }

        dirEl.appendChild(header);
        dirEl.appendChild(childContainer);
        fragment.appendChild(dirEl);
      } else {
        const ext = getFileExtension(item.name);
        const fileEl = document.createElement('div');
        fileEl.className = 'tree-item';
        fileEl.style.paddingLeft = (28 + depth * 16) + 'px';
        fileEl.dataset.path = item.path;
        fileEl.dataset.ext = ext;
        fileEl.draggable = true;
        fileEl.innerHTML = `
          <span class="tree-item-icon">${getFileIcon(ext)}</span>
          <span class="tree-item-name">${escapeHtml(item.name)}</span>
        `;

        fileEl.addEventListener('click', () => openFile(item.path, item.name, false));
        fileEl.addEventListener('dblclick', () => makeTabPermanentByPath(item.path));
        fileEl.addEventListener('contextmenu', (e) => {
          showContextMenu(e, item.path, 'file');
        });

        // Drag for File
        fileEl.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', item.path);
          e.dataTransfer.setData('item-type', 'file');
          e.dataTransfer.effectAllowed = 'move';
          e.stopPropagation();
        });

        fragment.appendChild(fileEl);
      }
    }
    return fragment;
  }

  function getFileIcon(ext) {
    const pumlExts = ['puml', 'plantuml', 'pu', 'iuml', 'wsd'];
    if (pumlExts.includes(ext)) {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
    }
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>';
  }

  function collapseAllFolders() {
    document.querySelectorAll('.tree-item-expand.expanded').forEach(el => el.classList.remove('expanded'));
    document.querySelectorAll('.tree-children.expanded').forEach(el => el.classList.remove('expanded'));
  }

  // ============================================
  // File Operations
  // ============================================
  async function openFile(filePath, fileName, permanent = false) {
    // Find if already open
    const existingIndex = state.tabs.findIndex(t => t.path === filePath);
    if (existingIndex !== -1) {
      if (permanent) state.tabs[existingIndex].isPermanent = true;
      switchTab(existingIndex);
      return;
    }

    const name = fileName || filePath.split(/[\\/]/).pop();
    const ext = getFileExtension(filePath);
    const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
    const isImage = imgExts.includes(ext);

    let content = '';
    let dataUrl = null;

    if (isImage) {
      const result = await window.electronAPI.readFileBase64(filePath);
      if (!result.success) {
        showToast('Failed to open image: ' + result.error, 'error');
        return;
      }
      dataUrl = result.dataUrl;
    } else {
      const result = await window.electronAPI.readFile(filePath);
      if (!result.success) {
        showToast('Failed to open file: ' + result.error, 'error');
        return;
      }
      content = result.content;
    }

    // Handle temporary tab logic
    if (!permanent) {
      const tempIndex = state.tabs.findIndex(t => !t.isPermanent && !t.isModified);
      if (tempIndex !== -1) {
        // Replace temporary tab
        state.tabs[tempIndex] = {
          path: filePath,
          name,
          isPermanent: false,
          isModified: false,
          content,
          dataUrl,
          isImage,
          scrollState: null,
          cursorPosition: null
        };
        switchTab(tempIndex);
        return;
      }
    }

    // Add new tab
    state.tabs.push({
      path: filePath,
      name,
      isPermanent: permanent,
      isModified: false,
      content,
      dataUrl,
      isImage,
      scrollState: null,
      cursorPosition: null
    });
    switchTab(state.tabs.length - 1);
  }

  function switchTab(index) {
    if (index < 0 || index >= state.tabs.length) return;

    // Save current tab state if switching
    const prevTab = getActiveTab();
    if (prevTab && !prevTab.isImage && state.editorView) {
      prevTab.scrollState = state.editorView.scrollDOM.scrollTop;
      prevTab.cursorPosition = state.editorView.state.selection.main.head;
    }

    state.activeTabIndex = index;
    const tab = state.tabs[index];

    // Update UI
    if (tab.isImage) {
      showPreviewImage(tab.dataUrl);
      if (state.editorView) state.editorView.dom.style.display = 'none';
      const emptyEl = document.getElementById('editor-empty');
      emptyEl.classList.remove('hidden');
      emptyEl.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <p>Previewing Image: ${tab.name}</p>
        </div>
      `;
    } else {
      if (state.editorView) {
        state.editorView.dom.style.display = '';
        setEditorContent(tab.content);

        // Restore scroll and cursor
        if (tab.scrollState !== null) {
          setTimeout(() => {
            state.editorView.scrollDOM.scrollTop = tab.scrollState;
            if (tab.cursorPosition !== null) {
              state.editorView.dispatch({
                selection: { anchor: tab.cursorPosition }
              });
            }
          }, 0);
        }

        // Reconfigure language
        const ext = getFileExtension(tab.path);
        const { json } = window.CM;
        let langExt;
        const trimmed = tab.content.trim();
        const isJson = ext === 'json' || (ext === 'txt' && (trimmed.startsWith('{') || trimmed.startsWith('[')));

        if (isJson) {
          langExt = json();
        } else {
          langExt = getPumlLanguage();
        }

        state.editorView.dispatch({
          effects: state.languageCompartment.reconfigure(langExt)
        });
      }
      document.getElementById('editor-empty').classList.add('hidden');
    }

    updateTabBar();
    updateTreeSelection();
    updateStatusBar();
    persistTabs();

    // Trigger render only if it's a puml file
    const ext = getFileExtension(tab.path);
    const pumlExts = ['puml', 'plantuml', 'pu', 'wsd'];
    if (!tab.isImage && pumlExts.includes(ext)) {
      renderPreview(false);
    } else if (!tab.isImage) {
      hidePreview();
    }
  }

  async function closeTab(index) {
    if (index < 0 || index >= state.tabs.length) return;

    const tab = state.tabs[index];
    if (tab.isModified) {
      const confirm = await showConfirm(
        'Save Changes?',
        `Do you want to save changes to "${tab.name}" before closing?`,
        'Save',
        'btn-primary'
      );
      if (confirm) await saveTab(index);
    }

    state.tabs.splice(index, 1);

    if (state.tabs.length === 0) {
      state.activeTabIndex = -1;
      if (state.editorView) state.editorView.dom.style.display = 'none';
      document.getElementById('editor-empty').classList.remove('hidden');
      document.getElementById('editor-empty').innerHTML = '<div class="empty-state"><p>Select a file from the explorer to start editing</p></div>';
      hidePreview();
    } else {
      if (state.activeTabIndex >= state.tabs.length) {
        state.activeTabIndex = state.tabs.length - 1;
      }
      switchTab(state.activeTabIndex);
    }

    updateTabBar();
    updateTreeSelection();
    updateStatusBar();
    persistTabs();
  }

  function moveTabLeft() {
    if (state.activeTabIndex <= 0 || state.tabs.length <= 1) return;
    const tab = state.tabs.splice(state.activeTabIndex, 1)[0];
    state.activeTabIndex--;
    state.tabs.splice(state.activeTabIndex, 0, tab);
    updateTabBar();
    persistTabs();
  }

  function moveTabRight() {
    if (state.activeTabIndex === -1 || state.activeTabIndex >= state.tabs.length - 1 || state.tabs.length <= 1) return;
    const tab = state.tabs.splice(state.activeTabIndex, 1)[0];
    state.activeTabIndex++;
    state.tabs.splice(state.activeTabIndex, 0, tab);
    updateTabBar();
    persistTabs();
  }

  function makeTabPermanentByPath(path) {
    const index = state.tabs.findIndex(t => t.path === path);
    if (index !== -1) {
      state.tabs[index].isPermanent = true;
      updateTabBar();
      persistTabs();
    } else {
      openFile(path, null, true);
    }
  }

  function persistTabs() {
    const openFiles = state.tabs.filter(t => t.isPermanent).map(t => t.path);
    window.electronAPI.setConfig('openFiles', openFiles);
    const activeTab = getActiveTab();
    if (activeTab && activeTab.isPermanent) {
      window.electronAPI.setConfig('activeFile', activeTab.path);
    } else {
      window.electronAPI.setConfig('activeFile', null);
    }
  }

  function updateTreeSelection() {
    document.querySelectorAll('.tree-item.active').forEach(el => el.classList.remove('active'));
    const activeTab = getActiveTab();
    if (activeTab) {
      const treeItem = document.querySelector(`.tree-item[data-path="${CSS.escape(activeTab.path)}"]`);
      if (treeItem) treeItem.classList.add('active');
    }
  }

  function updateStatusBar() {
    const activeTab = getActiveTab();
    if (activeTab) {
      document.getElementById('status-file').textContent = activeTab.path;
      document.getElementById('btn-save').disabled = activeTab.isImage;
      const modifiedBadge = document.getElementById('status-modified');
      if (activeTab.isModified) {
        modifiedBadge.classList.remove('hidden');
      } else {
        modifiedBadge.classList.add('hidden');
      }
    } else {
      document.getElementById('status-file').textContent = 'No file';
      document.getElementById('btn-save').disabled = true;
      document.getElementById('status-modified').classList.add('hidden');
    }
  }

  async function saveTab(index) {
    if (index < 0 || index >= state.tabs.length) return;
    const tab = state.tabs[index];
    if (tab.isImage) return;

    const result = await window.electronAPI.writeFile(tab.path, tab.content);
    if (result.success) {
      tab.isModified = false;
      updateTabBar();
      updateStatusBar();
      showToast('File saved', 'success');
    } else {
      showToast('Failed to save: ' + result.error, 'error');
    }
  }

  async function saveCurrentFile() {
    if (state.activeTabIndex !== -1) {
      await saveTab(state.activeTabIndex);
    }
  }

  function updateTabBar() {
    const tabBar = document.getElementById('tab-bar');
    const btnLeft = document.getElementById('btn-tab-left');
    const btnRight = document.getElementById('btn-tab-right');
    
    if (state.tabs.length === 0) {
      tabBar.innerHTML = '<div class="tab-empty">No file open</div>';
      if (btnLeft) btnLeft.disabled = true;
      if (btnRight) btnRight.disabled = true;
      return;
    }

    if (btnLeft) btnLeft.disabled = state.activeTabIndex <= 0;
    if (btnRight) btnRight.disabled = state.activeTabIndex >= state.tabs.length - 1;

    tabBar.innerHTML = '';
    state.tabs.forEach((tab, index) => {
      const tabEl = document.createElement('div');
      tabEl.className = 'tab';
      if (index === state.activeTabIndex) tabEl.classList.add('active');
      if (!tab.isPermanent) tabEl.classList.add('temporary');
      if (tab.isModified) tabEl.classList.add('modified');

      tabEl.innerHTML = `
        <span class="tab-name">${escapeHtml(tab.name)}</span>
        <div class="tab-close">
          <svg width="10" height="10" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
        </div>
      `;

      tabEl.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) {
          closeTab(index);
        } else {
          switchTab(index);
        }
      });

      tabEl.addEventListener('dblclick', () => {
        tab.isPermanent = true;
        updateTabBar();
        persistTabs();
      });

      tabBar.appendChild(tabEl);
    });
  }

  function showContextMenu(e, path, type) {
    e.preventDefault();
    state.contextMenuPath = path;
    state.contextMenuType = type;
    const menu = document.getElementById('context-menu');
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.classList.remove('hidden');
  }

  function hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
  }

  function showPrompt(title, placeholder, value = '') {
    return new Promise((resolve) => {
      const overlay = document.getElementById('prompt-overlay');
      const titleEl = document.getElementById('prompt-title');
      const input = document.getElementById('prompt-input');
      const okBtn = document.getElementById('btn-prompt-ok');
      const cancelBtn = document.getElementById('btn-prompt-cancel');

      titleEl.textContent = title;
      input.placeholder = placeholder || 'Enter name...';
      input.value = value;
      overlay.classList.remove('hidden');
      input.focus();
      input.select();

      const onOk = () => {
        cleanup();
        resolve(input.value);
      };

      const onCancel = () => {
        cleanup();
        resolve(null);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOk();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      };

      const cleanup = () => {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKeyDown);
      };

      okBtn.oneClick = okBtn.onclick; // Backup if needed, but we use listeners
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKeyDown);
    });
  }

  async function handleNewFile(targetPath, type) {
    if (!state.currentFolder) {
      showToast('Open a folder first', 'error');
      return;
    }

    // Determine parent directory
    let parentDir = targetPath || state.currentFolder;
    if (type === 'file') {
      parentDir = getFileDirectory(targetPath);
    }

    const fileName = await showPrompt('New File', 'Enter file name (e.g. diagram.puml)');
    if (!fileName || !fileName.trim()) return;

    const sep = parentDir.includes('\\') ? '\\' : '/';
    const filePath = parentDir + (parentDir.endsWith(sep) ? '' : sep) + fileName.trim();

    // Check if file exists
    const exists = await window.electronAPI.fileExists(filePath);
    if (exists) {
      showToast('File already exists', 'error');
      return;
    }

    const result = await window.electronAPI.writeFile(filePath, '');
    if (result.success) {
      await refreshFolder();
      showToast('File created', 'success');
      // Open the file immediately
      openFile(filePath, fileName);
    } else {
      showToast('Failed to create file: ' + result.error, 'error');
    }
  }

  async function handleNewFolder(targetPath, type) {
    if (!state.currentFolder) {
      showToast('Open a folder first', 'error');
      return;
    }

    // Determine parent directory
    let parentDir = targetPath || state.currentFolder;
    if (type === 'file') {
      parentDir = getFileDirectory(targetPath);
    }

    const folderName = await showPrompt('New Folder', 'Enter folder name');
    if (!folderName || !folderName.trim()) return;

    const sep = parentDir.includes('\\') ? '\\' : '/';
    const dirPath = parentDir + (parentDir.endsWith(sep) ? '' : sep) + folderName.trim();

    // Check if folder exists
    const exists = await window.electronAPI.fileExists(dirPath);
    if (exists) {
      showToast('Folder already exists', 'error');
      return;
    }

    const result = await window.electronAPI.createDirectory(dirPath);
    if (result.success) {
      await refreshFolder();
      showToast('Folder created', 'success');
    } else {
      showToast('Failed to create folder: ' + result.error, 'error');
    }
  }

  async function showConfirm(title, message, okText = 'Delete', okClass = 'btn-danger') {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirm-overlay');
      const titleEl = document.getElementById('confirm-title');
      const messageEl = document.getElementById('confirm-message');
      const okBtn = document.getElementById('btn-confirm-ok');
      const cancelBtn = document.getElementById('btn-confirm-cancel');

      titleEl.textContent = title;
      messageEl.textContent = message;
      okBtn.textContent = okText;
      okBtn.className = okClass;
      overlay.classList.remove('hidden');

      const onOk = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      const onKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onOk(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      };

      const cleanup = () => {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onKeyDown);
      };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      window.addEventListener('keydown', onKeyDown);
    });
  }

  async function handleRename(path, type) {
    if (!path) return;
    const oldName = path.split(/[\\/]/).pop();
    const newName = await showPrompt('Rename', 'Enter new name', oldName);

    if (!newName || !newName.trim() || newName === oldName) return;

    const parentDir = getFileDirectory(path);
    const sep = parentDir.includes('\\') ? '\\' : '/';
    const newPath = parentDir + (parentDir.endsWith(sep) ? '' : sep) + newName.trim();

    // Check if new path already exists
    const exists = await window.electronAPI.fileExists(newPath);
    if (exists) {
      showToast('Name already exists', 'error');
      return;
    }

    const result = await window.electronAPI.moveItem(path, newPath);
    if (result.success) {
      if (state.currentFile === path) {
        state.currentFile = newPath;
        window.electronAPI.setConfig('lastOpenedFile', newPath);
      }
      await refreshFolder();
      showToast('Item renamed', 'success');
    } else {
      showToast('Rename failed: ' + result.error, 'error');
    }
  }

  async function handleDelete(path, type) {
    if (!path) return;
    const itemName = path.split(/[\\/]/).pop();
    const confirmed = await showConfirm(
      'Delete ' + (type === 'directory' ? 'Folder' : 'File'),
      `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
    );

    if (confirmed) {
      const result = type === 'directory'
        ? await window.electronAPI.removeDirectory(path)
        : await window.electronAPI.removeFile(path);

      if (result.success) {
        // If the deleted file was open, clear the editor
        // If the deleted file was open, close its tab
        const index = state.tabs.findIndex(t => t.path === path);
        if (index !== -1) {
          state.tabs.splice(index, 1);
          if (state.tabs.length === 0) {
            state.activeTabIndex = -1;
            if (state.editorView) state.editorView.dom.style.display = 'none';
            document.getElementById('editor-empty').classList.remove('hidden');
            document.getElementById('editor-empty').innerHTML = '<div class="empty-state"><p>No file open</p></div>';
            hidePreview();
          } else {
            if (state.activeTabIndex >= state.tabs.length) {
              state.activeTabIndex = state.tabs.length - 1;
            }
            switchTab(state.activeTabIndex);
          }
          updateTabBar();
          updateTreeSelection();
          updateStatusBar();
          persistTabs();
        }
        await refreshFolder();
        showToast('Item deleted', 'success');
      } else {
        showToast('Delete failed: ' + result.error, 'error');
      }
    }
  }

  // ============================================
  // Preview Rendering
  // ============================================
  function scheduleRender(delay) {
    if (state.renderTimeout) clearTimeout(state.renderTimeout);
    state.renderTimeout = setTimeout(() => renderPreview(), delay || 1500);
  }

  async function renderPreview(force = false) {
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.isImage) return;
    const ext = getFileExtension(activeTab.path);
    const pumlExts = ['puml', 'plantuml', 'pu', 'wsd'];
    if (!pumlExts.includes(ext)) {
      hidePreview();
      return;
    }

    const source = activeTab.content;
    if (!source.trim()) { hidePreview(); return; }

    if (!force && source === state.lastRenderedSource && state.previewImageData) return;

    state.isRendering = true;
    updateRenderStatus('Rendering...');
    showPreviewLoading();

    const cwd = getFileDirectory(activeTab.path);
    const result = await window.electronAPI.renderPlantUML(source, 'svg', cwd);

    state.isRendering = false;
    hidePreviewLoading();

    if (result.success) {
      state.lastRenderedSource = source;
      state.previewImageData = result.data;
      showPreviewImage(result.data);
      updateRenderStatus('Ready');
    } else {
      updateRenderStatus('Error');
      showToast('Render error: ' + result.error, 'error');
    }
  }

  function showPreviewImage(dataUrl) {
    const img = document.getElementById('preview-image');
    const empty = document.getElementById('preview-empty');

    img.onload = () => {
      // Only reset pan/zoom if the image itself changed
      const activeTab = getActiveTab();
      if (activeTab && activeTab.path !== state._currentFileForZoom) {
        resetPanZoom();
        state._currentFileForZoom = activeTab.path;
      }
      updatePreviewTransform();
    };

    img.src = dataUrl;
    img.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
  }

  function hidePreview() {
    document.getElementById('preview-image').classList.add('hidden');
    const empty = document.getElementById('preview-empty');
    if (empty) empty.classList.remove('hidden');
  }

  function showPreviewLoading() {
    let loader = document.querySelector('.preview-loading');
    if (!loader) {
      loader = document.createElement('div');
      loader.className = 'preview-loading';
      loader.innerHTML = '<div class="spinner"></div>';
      document.getElementById('preview-container').appendChild(loader);
    }
  }

  function hidePreviewLoading() {
    const loader = document.querySelector('.preview-loading');
    if (loader) loader.remove();
  }

  function updateRenderStatus(text) {
    document.getElementById('status-render').textContent = text;
  }

  // ============================================
  // Preview Controls
  // ============================================
  function zoomBy(delta) {
    state.zoom = Math.max(0.1, Math.min(5, state.zoom + delta));
    updatePreviewTransform();
    document.getElementById('zoom-level').textContent = Math.round(state.zoom * 100) + '%';
  }

  function resetPanZoom() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    updatePreviewTransform();
    document.getElementById('zoom-level').textContent = '100%';
  }

  function updatePreviewTransform() {
    const img = document.getElementById('preview-image');
    img.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  }

  async function copyImage() {
    if (!state.previewImageData) {
      showToast('No image to copy', 'error');
      return;
    }
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.isImage) return;

    updateRenderStatus('Copying...');
    const cwd = getFileDirectory(activeTab.path);
    const result = await window.electronAPI.renderPlantUML(activeTab.content, 'png', cwd);
    if (result.success) {
      const copyResult = await window.electronAPI.copyImageToClipboard(result.data);
      if (copyResult.success) {
        showToast('Image copied to clipboard', 'success');
      } else {
        showToast('Failed to copy: ' + copyResult.error, 'error');
      }
    } else {
      showToast('Failed to render PNG for clipboard', 'error');
    }
    updateRenderStatus('Ready');
  }

  async function exportDiagram() {
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.isImage || !activeTab.content.trim()) {
      showToast('No diagram to export', 'error');
      return;
    }

    const format = state.config.exportFormat || 'png';
    const defaultName = activeTab.name.replace(/\.\w+$/, '') + '.' + format;

    const savePath = await window.electronAPI.saveFileDialog(defaultName, format);
    if (!savePath) return;

    updateRenderStatus('Exporting...');
    const cwd = getFileDirectory(activeTab.path);
    const result = await window.electronAPI.exportDiagram(activeTab.content, format, savePath, cwd);

    if (result.success) {
      showToast(`Exported to ${savePath}`, 'success');
    } else {
      showToast('Export failed: ' + result.error, 'error');
    }
    updateRenderStatus('Ready');
  }

  // ============================================
  // Settings
  // ============================================
  async function openSettings() {
    try {
      state.config = await window.electronAPI.getConfig();
    } catch (e) { /* use cached config */ }

    document.getElementById('setting-jar-path').value = state.config.plantumlJarPath || '';
    document.getElementById('setting-java-path').value = state.config.javaPath || 'java';
    document.getElementById('setting-limit-size').value = state.config.plantumlLimitSize || 4096;
    document.getElementById('setting-command-args').value = state.config.commandArgs || '';
    document.getElementById('setting-svg-limit').value = state.config.svgPreviewLimit || 16384;
    document.getElementById('setting-encoding').value = state.config.encoding || 'UTF-8';
    document.getElementById('setting-export-format').value = state.config.exportFormat || 'png';
    document.getElementById('setting-export-folder').value = state.config.exportFolder || '';

    document.getElementById('settings-overlay').classList.remove('hidden');
  }

  function closeSettings() {
    document.getElementById('settings-overlay').classList.add('hidden');
  }

  async function saveSettings() {
    const newConfig = {
      plantumlJarPath: document.getElementById('setting-jar-path').value,
      javaPath: document.getElementById('setting-java-path').value || 'java',
      plantumlLimitSize: parseInt(document.getElementById('setting-limit-size').value) || 4096,
      commandArgs: document.getElementById('setting-command-args').value,
      svgPreviewLimit: parseInt(document.getElementById('setting-svg-limit').value) || 16384,
      encoding: document.getElementById('setting-encoding').value,
      exportFormat: document.getElementById('setting-export-format').value,
      exportFolder: document.getElementById('setting-export-folder').value
    };

    await window.electronAPI.setConfigMultiple(newConfig);
    state.config = { ...state.config, ...newConfig };
    document.getElementById('status-encoding').textContent = newConfig.encoding;

    closeSettings();
    showToast('Settings saved', 'success');

    state.lastRenderedSource = '';
    scheduleRender(500);
  }

  // ============================================
  // Resize Handles
  // ============================================
  function setupResizeHandles() {
    const sidebarHandle = document.getElementById('sidebar-resize');
    const previewHandle = document.getElementById('preview-resize');
    const sidebar = document.getElementById('sidebar');
    const previewPanel = document.getElementById('preview-panel');

    let resizing = null;
    let startX = 0;
    let startWidth = 0;

    sidebarHandle.addEventListener('mousedown', (e) => {
      resizing = 'sidebar';
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      sidebarHandle.classList.add('active');
      e.preventDefault();
    });

    previewHandle.addEventListener('mousedown', (e) => {
      resizing = 'preview';
      startX = e.clientX;
      startWidth = previewPanel.offsetWidth;
      previewHandle.classList.add('active');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      if (resizing === 'sidebar') {
        sidebar.style.width = Math.max(180, Math.min(500, startWidth + (e.clientX - startX))) + 'px';
      } else if (resizing === 'preview') {
        previewPanel.style.width = Math.max(250, startWidth - (e.clientX - startX)) + 'px';
      }
    });

    window.addEventListener('mouseup', () => {
      if (resizing) {
        document.getElementById(resizing === 'sidebar' ? 'sidebar-resize' : 'preview-resize').classList.remove('active');

        // Save dimensions to store
        if (resizing === 'sidebar') {
          window.electronAPI.setConfig('sidebarWidth', sidebar.offsetWidth);
        } else if (resizing === 'preview') {
          window.electronAPI.setConfig('previewWidth', previewPanel.offsetWidth);
        }

        resizing = null;
      }
    });
  }

  // ============================================
  // Utilities
  // ============================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getFileExtension(fileName) {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function getFileDirectory(filePath) {
    if (!filePath) return null;
    // Handle both Windows and POSIX separators
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    if (lastSlash === -1) return null;
    return filePath.substring(0, lastSlash);
  }

  function toggleSidebar(force) {
    state.sidebarCollapsed = force !== undefined ? force : !state.sidebarCollapsed;
    const sidebar = document.getElementById('sidebar');
    const resizeHandle = document.getElementById('sidebar-resize');

    if (state.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
      if (resizeHandle) resizeHandle.style.display = 'none';
    } else {
      sidebar.classList.remove('collapsed');
      if (resizeHandle) resizeHandle.style.display = 'block';
    }

    // Save state
    window.electronAPI.setConfig('sidebarCollapsed', state.sidebarCollapsed);
  }

  function toggleTextWrap() {
    state.textWrap = !state.textWrap;
    const { EditorView } = window.CM;

    state.editorView.dispatch({
      effects: state.wrapCompartment.reconfigure(state.textWrap ? EditorView.lineWrapping : [])
    });

    const btn = document.getElementById('btn-toggle-wrap');
    if (state.textWrap) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  function showToast(message, type) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    msgEl.textContent = message;
    toast.className = 'toast ' + (type || 'info');
    clearTimeout(state._toastTimeout);
    state._toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  // ============================================
  // Start async initialization
  // ============================================
  init().catch(err => console.error('Init error:', err));
})();
