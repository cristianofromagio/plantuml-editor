const { _electron: electron } = require('@playwright/test');
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

let electronApp;
let window;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  electronApp = await electron.launch({ args: ['.'] });
  window = await electronApp.firstWindow();
  // Wait for the app to be ready
  await window.waitForSelector('#sidebar');
});

test.afterAll(async () => {
  await electronApp.close();
});

test('App should launch and show correct title', async () => {
  const title = await window.title();
  expect(title).toBe('PlantUML Editor');
});

test('UI should have essential components', async () => {
  await expect(window.locator('#sidebar')).toBeVisible();
  await expect(window.locator('#editor-container')).toBeVisible();
  await expect(window.locator('#preview-panel')).toBeVisible();
});

test('Sidebar toggle should work', async () => {
  const sidebar = window.locator('#sidebar');
  const toggleBtn = window.locator('#btn-toggle-sidebar');
  
  const isCollapsed = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  
  await toggleBtn.click();
  if (isCollapsed) {
    await expect(sidebar).not.toHaveClass(/collapsed/);
  } else {
    await expect(sidebar).toHaveClass(/collapsed/);
  }
  
  await toggleBtn.click();
  if (isCollapsed) {
    await expect(sidebar).toHaveClass(/collapsed/);
  } else {
    await expect(sidebar).not.toHaveClass(/collapsed/);
  }
});

test('Should interact with the code editor', async () => {
  // Wait for editor to be ready
  const editor = window.locator('.cm-content');
  await expect(editor).toBeVisible();
  
  // Fill the editor with PlantUML code
  await editor.fill('@startuml\nAlice -> Bob: Hello\n@enduml');
  
  const content = await editor.innerText();
  expect(content).toContain('Alice -> Bob');
});

test('Should open the settings modal', async () => {
  await window.locator('#btn-settings').click();
  await expect(window.locator('#settings-overlay')).not.toHaveClass(/hidden/);
  await window.locator('#btn-close-settings').click();
  await expect(window.locator('#settings-overlay')).toHaveClass(/hidden/);
});

async function ensureSidebarExpanded() {
  const sidebar = window.locator('#sidebar');
  const isCollapsed = await sidebar.evaluate(el => el.classList.contains('collapsed'));
  if (isCollapsed) {
    await window.locator('#btn-toggle-sidebar').click();
    await expect(sidebar).not.toHaveClass(/collapsed/);
  }
}

test('Should demonstrate file creation flow', async () => {
  await ensureSidebarExpanded();
  await window.locator('#btn-new-file').click();
  
  const promptOverlay = window.locator('#prompt-overlay');
  await expect(promptOverlay).not.toHaveClass(/hidden/);
  
  await window.locator('#btn-prompt-cancel').click();
  await expect(promptOverlay).toHaveClass(/hidden/);
});

test('Should demonstrate folder creation flow', async () => {
  await ensureSidebarExpanded();
  await window.locator('#btn-new-folder').click();
  const promptOverlay = window.locator('#prompt-overlay');
  await expect(promptOverlay).not.toHaveClass(/hidden/);
  
  await window.locator('#btn-prompt-cancel').click();
  await expect(promptOverlay).toHaveClass(/hidden/);
});

test('Should have functional tooltips', async () => {
  const refreshBtn = window.locator('#btn-refresh-folder');
  expect(await refreshBtn.getAttribute('title')).toBe('Refresh Folder');
});

test('Should handle editor text wrapping toggle', async () => {
  const wrapBtn = window.locator('#btn-toggle-wrap');
  // Initial state check
  const isActive = await wrapBtn.evaluate(el => el.classList.contains('active'));
  
  await wrapBtn.click();
  const isNowActive = await wrapBtn.evaluate(el => el.classList.contains('active'));
  expect(isNowActive).not.toBe(isActive);
  
  await wrapBtn.click();
  const backToOriginal = await wrapBtn.evaluate(el => el.classList.contains('active'));
  expect(backToOriginal).toBe(isActive);
});
