const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let store = null;

// electron-store v8+ is ESM-only, must use dynamic import
async function initStore() {
  const Store = (await import('electron-store')).default;
  store = new Store({
    defaults: {
      plantumlJarPath: '',
      javaPath: 'java',
      exportFormat: 'png',
      exportFolder: app.getPath('documents'),
      plantumlLimitSize: 4096,
      commandArgs: '',
      svgPreviewLimit: 16384,
      encoding: 'UTF-8',
      lastOpenedFolder: '',
      isMaximized: true,
      sidebarWidth: 260,
      previewWidth: 400,
      sidebarCollapsed: false
    }
  });
}

function getDefaultJarPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'plantuml.jar');
  }
  return path.join(__dirname, '../../resources', 'plantuml.jar');
}

function getJarPath() {
  const configured = store?.get('plantumlJarPath');
  if (configured && configured.trim() !== '' && fs.existsSync(configured)) {
    return configured;
  }
  return getDefaultJarPath();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f1a',
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    frame: false,
    titleBarStyle: 'hidden'
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (store?.get('isMaximized')) {
    mainWindow.maximize();
  }

  mainWindow.on('maximize', () => store?.set('isMaximized', true));
  mainWindow.on('unmaximize', () => store?.set('isMaximized', false));

  // Open DevTools in dev mode for debugging
  // mainWindow.webContents.openDevTools();
}

// ---- Window Controls ----
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

// ---- Dialogs ----
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    store?.set('lastOpenedFolder', result.filePaths[0]);
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('dialog:openFile', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || []
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// ---- File System ----
function readDirectoryRecursive(dirPath) {
  const entries = [];
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        entries.push({
          name: item.name,
          path: fullPath,
          type: 'directory',
          children: readDirectoryRecursive(fullPath)
        });
      } else {
        entries.push({
          name: item.name,
          path: fullPath,
          type: 'file'
        });
      }
    }
  } catch (e) {
    console.error('Error reading directory:', e);
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

ipcMain.handle('fs:readDirectory', async (_, dirPath) => {
  return readDirectoryRecursive(dirPath);
});

ipcMain.handle('fs:readFile', async (_, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fs:readFileBase64', async (_, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().substring(1);
    const base64 = data.toString('base64');
    let mime = 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
    else if (ext === 'svg') mime = 'image/svg+xml';
    else if (ext === 'gif') mime = 'image/gif';
    else if (ext === 'webp') mime = 'image/webp';
    
    return { success: true, dataUrl: `data:${mime};base64,${base64}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fs:fileExists', async (_, filePath) => {
  return fs.existsSync(filePath);
});

// ---- PlantUML Rendering ----
ipcMain.handle('plantuml:render', async (_, source, format, cwd) => {
  return new Promise((resolve) => {
    const jarPath = getJarPath();
    const javaPath = store?.get('javaPath') || 'java';
    const limitSize = store?.get('plantumlLimitSize') || 4096;
    const encoding = store?.get('encoding') || 'UTF-8';
    const extraArgs = store?.get('commandArgs') || '';

    const fmt = format || store?.get('exportFormat') || 'png';
    const fmtFlag = fmt === 'svg' ? '-tsvg' : '-tpng';

    const args = [
      `-DPLANTUML_LIMIT_SIZE=${limitSize}`,
      '-jar', jarPath,
      fmtFlag,
      '-charset', encoding,
      '-pipe'
    ];

    if (extraArgs.trim()) {
      args.push(...extraArgs.trim().split(/\s+/));
    }

    try {
      const spawnOptions = { timeout: 30000 };
      if (cwd) spawnOptions.cwd = cwd;

      const proc = spawn(javaPath, args, spawnOptions);
      const chunks = [];
      let errorOutput = '';

      proc.stdout.on('data', (data) => chunks.push(data));
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0 || chunks.length > 0) {
          const buffer = Buffer.concat(chunks);
          const base64 = buffer.toString('base64');
          const mimeType = fmt === 'svg' ? 'image/svg+xml' : 'image/png';
          resolve({ success: true, data: `data:${mimeType};base64,${base64}`, format: fmt });
        } else {
          resolve({ success: false, error: errorOutput || `Process exited with code ${code}` });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: `Failed to start Java: ${err.message}. Make sure Java is installed and accessible.` });
      });

      proc.stdin.write(source);
      proc.stdin.end();
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// ---- Export ----
ipcMain.handle('plantuml:export', async (_, source, format, outputPath, cwd) => {
  return new Promise((resolve) => {
    const jarPath = getJarPath();
    const javaPath = store?.get('javaPath') || 'java';
    const limitSize = store?.get('plantumlLimitSize') || 4096;
    const encoding = store?.get('encoding') || 'UTF-8';
    const extraArgs = store?.get('commandArgs') || '';

    const fmtFlag = format === 'svg' ? '-tsvg' : '-tpng';

    const args = [
      `-DPLANTUML_LIMIT_SIZE=${limitSize}`,
      '-jar', jarPath,
      fmtFlag,
      '-charset', encoding,
      '-pipe'
    ];

    if (extraArgs.trim()) {
      args.push(...extraArgs.trim().split(/\s+/));
    }

    try {
      const spawnOptions = {};
      if (cwd) spawnOptions.cwd = cwd;

      const proc = spawn(javaPath, args, spawnOptions);
      const chunks = [];
      let errorOutput = '';

      proc.stdout.on('data', (data) => chunks.push(data));
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0 || chunks.length > 0) {
          const buffer = Buffer.concat(chunks);
          try {
            fs.writeFileSync(outputPath, buffer);
            resolve({ success: true, path: outputPath });
          } catch (e) {
            resolve({ success: false, error: `Failed to write file: ${e.message}` });
          }
        } else {
          resolve({ success: false, error: errorOutput || `Process exited with code ${code}` });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      proc.stdin.write(source);
      proc.stdin.end();
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('dialog:saveFile', async (_, defaultName, format) => {
  const ext = format === 'svg' ? 'svg' : 'png';
  const exportFolder = store?.get('exportFolder') || app.getPath('documents');
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(exportFolder, defaultName || `diagram.${ext}`),
    filters: [
      { name: format === 'svg' ? 'SVG Image' : 'PNG Image', extensions: [ext] }
    ]
  });
  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

// ---- Clipboard ----
ipcMain.handle('clipboard:copyImage', async (_, base64Data) => {
  try {
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const img = nativeImage.createFromBuffer(buffer);
    clipboard.writeImage(img);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ---- Config ----
ipcMain.handle('config:get', async () => {
  if (!store) return {};
  return {
    ...store.store,
    defaultJarPath: getDefaultJarPath()
  };
});

ipcMain.handle('config:set', async (_, key, value) => {
  store?.set(key, value);
  return { success: true };
});

ipcMain.handle('config:setMultiple', async (_, configObj) => {
  if (!store) return { success: false, error: 'Store not initialized' };
  for (const [key, value] of Object.entries(configObj)) {
    store.set(key, value);
  }
  return { success: true };
});

ipcMain.handle('shell:openPath', async (_, filePath) => {
  shell.showItemInFolder(filePath);
});

// ---- App lifecycle ----
app.whenReady().then(async () => {
  await initStore();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
