# Convert Electron App to Tauri

The goal is to replace the Electron main process and packaging with Tauri (Rust-based) while preserving the frontend logic in `src/renderer`.

## User Review Required

> [!WARNING]
> We will be removing Electron entirely. The application will use Tauri which relies on the system webview (WebView2 on Windows).
> We will implement custom Rust commands to mimic the existing `ipcMain` handlers so that the frontend (`renderer.js`) requires minimal to no modifications. We will inject a `tauri-shim.js` to map `window.electronAPI` to Tauri invokes.

## Proposed Changes

### Configuration and Dependencies
- **package.json**:
  - Remove `electron`, `electron-builder`
  - Add `@tauri-apps/cli`, `@tauri-apps/api`
  - Update `start` script to `tauri dev` and `build` script to `tauri build`.

### Tauri Initialization
- Initialize Tauri v2 in the `src-tauri` directory.
- Configure `tauri.conf.json` to use `src/renderer` for the frontend web assets, and set `npm run bundle` as the `beforeBuildCommand`.
- Configure the application bundle, icon, and bundle `plantuml.jar` as an external resource.

### Rust Backend (`src-tauri/src/main.rs`)
To maintain compatibility with the frontend's `electronAPI`, we will write Rust Tauri commands to replace Electron's Node.js functionality:
- **Window Controls**: Commands to minimize, maximize, and close the window.
- **Dialogs**: Commands using `tauri-plugin-dialog` to show file/folder selection windows.
- **File System**: Rust commands to handle recursive directory reading, file reading/writing (including Base64 conversion for images), and file manipulation (rename/delete).
- **PlantUML Execution**: The `plantuml:render` and `plantuml:export` IPCs execute a `java` process. We will port this to use Rust's `std::process::Command`, piping the PlantUML string to its stdin and reading the output from stdout.
- **Config Storage**: Implement a simple JSON-based configuration store in Rust that replicates `electron-store` behavior, storing data in the standard AppData directory.
- **Clipboard**: Implement copying Base64 images to the clipboard.
- **Shell**: Open file path in the OS explorer.

### Frontend Integration
#### [NEW] src/renderer/tauri-shim.js
Create a shim that exposes `window.electronAPI` to the frontend, but under the hood uses `@tauri-apps/api/core/invoke` to call our custom Rust commands.

#### [MODIFY] src/renderer/index.html
Include `<script src="tauri-shim.js"></script>` instead of relying on the Electron `preload.js`.

#### [DELETE] src/main/
Delete `main.js` and `preload.js` as they are no longer needed.

## Verification Plan

### Automated Tests
- N/A, UI visual testing via Plawyright currently exists, we will verify if `npm run test` still passes under Tauri or adapt as necessary (Playwright testing with Tauri requires specific setup, we might skip full playwright integration in this step but will ensure `npm run test` is considered if it's currently working). Wait, the user has Playwright tests (`tests/`). We should see if we can adapt them, or focus on manual verification first.

### Manual Verification
- Run `npm run start` (which maps to `tauri dev`).
- Verify the following in the UI:
  1. The UI loads and looks correct.
  2. Window controls (minimize, maximize, close) work.
  3. Opening a folder works and the file tree populates correctly.
  4. Creating/Opening a `.puml` file works.
  5. The preview pane successfully renders diagrams (verifying the Java subprocess works).
  6. Settings persist after closing and reopening the app.
  7. Exporting a diagram as PNG/SVG works.
