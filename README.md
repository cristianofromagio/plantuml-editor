# PlantUML Editor

A professional desktop application for creating and editing PlantUML diagrams with real-time preview and advanced editor features.

## Features

- Live Preview: Instant rendering with persistent zoom and pan positions.
- Advanced Syntax Highlighting: Custom support for PlantUML keywords, arrows, and preprocessor directives.
- JSON Support: Syntax highlighting and code folding for .json and JSON-like .txt files.
- File Explorer: Integrated sidebar with folder navigation and manual refresh.
- Image Preview: Direct visualization of image files (PNG, JPG, SVG, WebP, etc.) in the preview panel.
- Persistence: Remembers window state, sidebar dimensions, and user preferences between sessions.
- Modern UI: Clean, high-performance interface with custom titlebar and dark theme.

## Requirements

- Java Runtime Environment (JRE): Required for PlantUML diagram rendering.
- Node.js: Required for development and building from source.

## Getting Started

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm start
   ```

## Development

### Project Structure

- src/main: Electron main process and preload scripts.
- src/renderer: UI components, styles, and renderer logic.
- src/editor: CodeMirror 6 bundle entry point.
- resources: Bundled assets like the PlantUML jar and application icons.

### Building the Editor Bundle

If you modify the editor entry point, you can re-generate the locally bundled CodeMirror library:
```bash
npm run bundle
```

## Distribution

To package the application for Windows:
```bash
npm run build
```
The installer will be generated in the dist/ directory.

## License

MIT
