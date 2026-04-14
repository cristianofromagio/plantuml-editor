// tauri-shim.js
// Replaces Electron's preload.js by exposing window.electronAPI using Tauri's backend

(function() {
  if (!window.__TAURI__) {
    console.warn("Tauri API not found! Ensure withGlobalTauri is true in tauri.conf.json");
    return;
  }

  const { invoke } = window.__TAURI__.core;
  
  window.electronAPI = {
    // Window controls
    minimize: () => invoke('window_minimize'),
    maximize: () => invoke('window_maximize'),
    close: () => invoke('window_close'),

    // Dialogs
    openFolder: () => invoke('dialog_open_folder'),
    openFile: (filters) => invoke('dialog_open_file', { filters }),
    selectFolder: () => invoke('dialog_select_folder'),
    saveFileDialog: (defaultName, format) => invoke('dialog_save_file', { defaultName, format }),

    // File System
    readDirectory: (dirPath) => invoke('fs_read_directory', { dirPath }),
    readFile: (filePath) => invoke('fs_read_file', { filePath }),
    readFileBase64: (filePath) => invoke('fs_read_file_base64', { filePath }),
    writeFile: (filePath, content) => invoke('fs_write_file', { filePath, content }),
    fileExists: (filePath) => invoke('fs_file_exists', { filePath }),
    createDirectory: (dirPath) => invoke('fs_create_directory', { dirPath }),
    removeFile: (filePath) => invoke('fs_remove_file', { filePath }),
    removeDirectory: (dirPath) => invoke('fs_remove_directory', { dirPath }),
    moveItem: (src, dest) => invoke('fs_move_item', { src, dest }),

    // PlantUML
    renderPlantUML: (source, format, cwd) => invoke('plantuml_render', { source, format, cwd }),
    exportDiagram: (source, format, outputPath, cwd) => invoke('plantuml_export', { source, format, outputPath, cwd }),

    // Clipboard
    copyImageToClipboard: (base64Data) => invoke('clipboard_copy_image', { base64Data }),

    // Config
    getConfig: () => invoke('config_get'),
    setConfig: (key, value) => invoke('config_set', { key, value }),
    setConfigMultiple: (configObj) => invoke('config_set_multiple', { configObj }),

    // Shell
    openPath: (filePath) => invoke('shell_open_path', { filePath })
  };
})();
