# PlantUML Editor

A minimalist desktop application for creating and editing PlantUML diagrams with real-time preview and advanced editor features.

## Features

- **Multi-Tab Editing**: Open multiple files simultaneously. Use the italicized preview tab to browse files and promote them to permanent tabs with a double-click or any edit.
- **Live Preview**: Instant rendering with persistent zoom and pan positions.
- **Advanced Syntax Highlighting**: Custom support for PlantUML keywords, arrows, and preprocessor directives via CodeMirror 6.
- **JSON Support**: Syntax highlighting and code folding for .json and JSON-like .txt files.
- **File Explorer**: Integrated sidebar with folder navigation and manual refresh.
- **Image Preview**: Direct visualization of image files (PNG, JPG, SVG, WebP, etc.) in the preview panel.
- **Persistence**: Remembers open tabs, active selection, window state, sidebar dimensions, and user preferences between sessions.
- **Modern UI**: Clean, high-performance interface with a custom frameless titlebar and elegant dark theme.
- **Custom Runtimes Path**: You can set the path to the Java executable or PlantUML JAR file in the settings. Bundles PlantUML `1.2026.2` by default.
- **Copy/Export Images**: You can copy/export generated diagram images to the clipboard or to a file.

## Requirements

- **Java Runtime Environment (JRE)**: Required for PlantUML diagram rendering
   - Run `java -version` to check if it is installed. At least Java 11 is required
   - If not installed, you can download using `winget install Microsoft.OpenJDK.25` ([Install on Windows](https://learn.microsoft.com/en-us/java/openjdk/install?tabs=winget%2Chomebrew%2Cubuntu#:~:text=Windows%20Package%20Manager%20(winget)))

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application in development mode:
   ```bash
   npm start
   ```

## Development

### Project Structure

- **src-tauri/**: Rust backend source code, Tauri configuration, and native commands.
- **src/renderer/**: UI components, CSS styles, and JavaScript logic.
- **src/editor/**: CodeMirror 6 bundle entry point.
- **src-tauri/resources/**: Bundled assets like the `plantuml.jar`.

### Environment Requirements

- **Rust Toolchain**: Required for building the Tauri backend. [Install Rust](https://www.rust-lang.org/tools/install).
- **Node.js**: Required for frontend development and dependency management.

### Building the Editor Bundle

If you modify the editor logic in `src/editor/`, you must re-generate the locally bundled CodeMirror library:
```bash
npm run bundle
```

## Distribution

To package the application for your operating system:
```bash
npm run build
```
The installers will be generated in `src-tauri/target/release/bundle/`.

## License

MIT
