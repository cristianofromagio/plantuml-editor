# PlantUML Editor - Walkthrough

## Overview

A full-featured desktop PlantUML editor built with **Electron**, **CodeMirror 6**, and **electron-builder**. Features a dark glassmorphism UI with three resizable panels.

## Project Structure

```
plantuml-editor/
├── src/
│   ├── main/            # Electron main process & preload
│   │   ├── main.js
│   │   └── preload.js
│   ├── renderer/        # UI, styles, & controller
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── renderer.js
│   │   ├── plantuml-lang.js
│   │   └── editor-bundle.js
│   └── editor/          # CodeMirror bundling entry
│       └── editor-entry.js
├── package.json         # Dependencies & scripts
├── README.md            # Project documentation
└── resources/           # Static assets (jar, icons)
```

## Features Implemented

| Feature | Details |
|---|---|
| **File Explorer** | Open folder, recursive file tree, expand/collapse, file icons by type |
| **Code Editor** | CodeMirror 6 with advanced PlantUML syntax highlighting (TM grammar), line numbers, **text wrap toggle**, bracket matching, fold gutter, search, history |
| **Live Preview** | Auto-renders SVG preview ~1.5s after source changes, with **manual refresh button**, and **persistent zoom/pan** across edits of the same file |
| **Zoom/Pan** | Mouse wheel zoom, button controls, click-drag pan, reset button |
| **Copy Image** | Renders PNG and copies to system clipboard |
| **Export** | Save as SVG or PNG via save dialog |
| **Settings** | Jar path, Java path, export format/folder, PLANTUML_LIMIT_SIZE, command args, SVG limit, encoding |
| **Persistence** | Settings saved via `electron-store`, auto-reopens last folder and **last opened file** |
| **Testing** | Comprehensive **Playwright** suite with 9 automated tests |
| **Optimizations** | **Refresh Folder**, **New File/Folder**, **Rename**, and **Drag-and-Drop** support |
| **Keyboard Shortcuts** | Ctrl+S (save), Ctrl+O (open), Ctrl+/ (comment), Ctrl+, (settings), Esc (close), **Ctrl+Shift+E (explorer)** |
| **OS Integration** | **Open in Explorer** for the workspace or specific items via context menu |

## How to Run

### Development Mode

```bash
cd c:\Users\Cristiano\Development\_experiments\plantuml-editor
npm start
```

### Build Windows Executable

```bash
npm run build
```

This creates an NSIS installer in the `dist/` folder. The PlantUML jar is bundled as an extra resource.

> [!IMPORTANT]
> **Java is required** on the system to render PlantUML diagrams. The default `java` command from system PATH is used. A custom Java path can be set in Settings.

## Manual Testing Checklist

1. **Launch**: Run `npm start` → app window opens with dark theme and three panels
2. **Open Folder**: Ctrl+O or click folder icon → select a folder → file tree populates
3. **File Selection**: Click a `.puml` file in the tree → content loads in editor with syntax highlighting
4. **Syntax Highlighting**: Keywords in purple, arrows in orange, strings in green, comments in gray
5. **Edit & Save**: Modify text → "Modified" badge appears → Ctrl+S → "File saved" toast
6. **Live Preview**: Edit PlantUML code → diagram renders automatically after ~1.5s
7. **Zoom**: Use zoom buttons or mouse wheel on preview → zoom level label updates
8. **Pan**: Click and drag on preview → image moves
9. **Reset Zoom**: Click reset button → returns to 100% centered
10. **Copy Image**: Click copy icon → paste in Paint/Word → PNG image appears
11. **Export**: Click export icon → choose location → file saved as SVG or PNG
12. **Settings**: Click gear icon → modify settings → Save → settings persist across restart
13. **Resize Panels**: Drag the handles between panels → panels resize smoothly
14. **Relative Includes**: Create a file with `!include other.puml` → diagram renders correctly (other.puml in same dir)
15. **New File (Header)**: Click the "New File" icon → enter name in custom modal → file created and opened
16. **New Folder (Header)**: Click the "New Folder" icon → enter name in custom modal → folder created
17. **New Item (Context)**: Right-click → "New File" or "New Folder" → enter name → item created in context
18. **Custom Modal**: Verify "Enter" key submits and "Escape" key cancels the prompt
19. **Item Explorer**: Right-click a file/folder → "Open in Explorer" → OS explorer opens at that location
20. **Rename**: Right-click item → "Rename" → enter new name in custom modal → item renamed in tree
21. **Drag-and-Drop**: Drag a file or folder and drop it onto a folder icon → item is moved into that folder
22. **Persistence**: Open a file → restart app → verify that same file reopens automatically
23. **Build**: Run `npm run build` → installer created in `release/build/`
