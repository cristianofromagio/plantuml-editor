const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Dialogs
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  saveFileDialog: (defaultName, format) => ipcRenderer.invoke('dialog:saveFile', defaultName, format),

  // File System
  readDirectory: (dirPath) => ipcRenderer.invoke('fs:readDirectory', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readFileBase64: (filePath) => ipcRenderer.invoke('fs:readFileBase64', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  fileExists: (filePath) => ipcRenderer.invoke('fs:fileExists', filePath),

  // PlantUML
  renderPlantUML: (source, format, cwd) => ipcRenderer.invoke('plantuml:render', source, format, cwd),
  exportDiagram: (source, format, outputPath, cwd) => ipcRenderer.invoke('plantuml:export', source, format, outputPath, cwd),

  // Clipboard
  copyImageToClipboard: (base64Data) => ipcRenderer.invoke('clipboard:copyImage', base64Data),

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  setConfigMultiple: (configObj) => ipcRenderer.invoke('config:setMultiple', configObj),

  // Shell
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath)
});
