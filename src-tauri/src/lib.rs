use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::io::Write;

use tauri::{AppHandle, Manager, Window};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::sync::Mutex;
use std::collections::HashMap;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Default)]
struct AppState {
    config: Mutex<HashMap<String, serde_json::Value>>,
}

const CREATE_NO_WINDOW: u32 = 0x08000000;


// ---- Window Controls ----
#[tauri::command]
fn window_minimize(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn window_maximize(window: Window) {
    if let Ok(true) = window.is_maximized() {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn window_close(window: Window) {
    let _ = window.close();
}

// ---- Dialogs ----
#[tauri::command]
async fn dialog_open_folder(app: AppHandle) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        tx.send(folder).unwrap();
    });
    if let Ok(Some(f)) = rx.recv() {
        let path_str = f.into_path().unwrap().to_string_lossy().into_owned();
        
        // Save to config
        let state = app.state::<AppState>();
        {
            let mut store = state.config.lock().unwrap();
            store.insert("lastOpenedFolder".to_string(), serde_json::Value::String(path_str.clone()));
        }
        let store = state.config.lock().unwrap();
        if let Some(parent) = config_path(&app).parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(config_path(&app), serde_json::to_string(&*store).unwrap_or_default());
        
        return Some(path_str);
    }
    None
}

#[derive(Deserialize)]
struct DialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[tauri::command]
async fn dialog_open_file(app: AppHandle, filters: Option<Vec<DialogFilter>>) -> Option<String> {
    let mut dialog = app.dialog().file();
    if let Some(f) = filters {
        for filter in f {
            let exts: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(filter.name, &exts);
        }
    }
    
    let (tx, rx) = std::sync::mpsc::channel();
    dialog.pick_file(move |file| {
        tx.send(file).unwrap();
    });
    rx.recv().unwrap().map(|f| f.into_path().unwrap().to_string_lossy().into_owned())
}

#[tauri::command]
async fn dialog_select_folder(app: AppHandle) -> Option<String> {
    dialog_open_folder(app).await
}

#[tauri::command]
async fn dialog_save_file(app: AppHandle, default_name: Option<String>, format: Option<String>) -> Option<String> {
    let mut dialog = app.dialog().file();
    if let Some(mut name) = default_name {
        if let Some(pos) = name.rfind('/') { name = name[pos+1..].to_string(); }
        if let Some(pos) = name.rfind('\\') { name = name[pos+1..].to_string(); }
        dialog = dialog.set_file_name(name);
    }
    let ext = format.unwrap_or_else(|| "png".to_string());
    let filter_name = if ext == "svg" { "SVG Image" } else { "PNG Image" };
    dialog = dialog.add_filter(filter_name, &[&ext]);

    let (tx, rx) = std::sync::mpsc::channel();
    dialog.save_file(move |file| {
        tx.send(file).unwrap();
    });
    rx.recv().unwrap().map(|f| f.into_path().unwrap().to_string_lossy().into_owned())
}

// ---- File System ----
#[derive(Serialize)]
struct FileNode {
    name: String,
    path: String,
    #[serde(rename = "type")]
    node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileNode>>,
}

fn read_dir_recursive(path: &Path) -> Vec<FileNode> {
    let mut entries = Vec::new();
    if let Ok(dir) = fs::read_dir(path) {
        for entry in dir.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') { continue; }
            let path_buf = entry.path();
            let path_str = path_buf.to_string_lossy().into_owned();
            
            if path_buf.is_dir() {
                entries.push(FileNode {
                    name,
                    path: path_str,
                    node_type: "directory".to_string(),
                    children: Some(read_dir_recursive(&path_buf)),
                });
            } else {
                entries.push(FileNode {
                    name,
                    path: path_str,
                    node_type: "file".to_string(),
                    children: None,
                });
            }
        }
    }
    entries.sort_by(|a, b| {
        if a.node_type != b.node_type {
            if a.node_type == "directory" { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater }
        } else {
            a.name.cmp(&b.name)
        }
    });
    entries
}

#[tauri::command]
fn fs_read_directory(dir_path: String) -> Vec<FileNode> {
    read_dir_recursive(Path::new(&dir_path))
}

#[derive(Serialize)]
struct FsReadResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
fn fs_read_file(file_path: String) -> FsReadResult {
    match fs::read_to_string(&file_path) {
        Ok(c) => FsReadResult { success: true, content: Some(c), error: None },
        Err(e) => FsReadResult { success: false, content: None, error: Some(e.to_string()) },
    }
}

#[derive(Serialize)]
struct FsReadBase64Result {
    success: bool,
    #[serde(rename = "dataUrl")]
    #[serde(skip_serializing_if = "Option::is_none")]
    data_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
fn fs_read_file_base64(file_path: String) -> FsReadBase64Result {
    match fs::read(&file_path) {
        Ok(data) => {
            let ext = Path::new(&file_path)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
                
            let mime = match ext.as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "svg" => "image/svg+xml",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "image/png",
            };
            
            let base64 = STANDARD.encode(&data);
            FsReadBase64Result { 
                success: true, 
                data_url: Some(format!("data:{};base64,{}", mime, base64)), 
                error: None 
            }
        },
        Err(e) => FsReadBase64Result { success: false, data_url: None, error: Some(e.to_string()) },
    }
}

#[derive(Serialize)]
struct BasicResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
fn fs_write_file(file_path: String, content: String) -> BasicResult {
    match fs::write(&file_path, content) {
        Ok(_) => BasicResult { success: true, error: None },
        Err(e) => BasicResult { success: false, error: Some(e.to_string()) },
    }
}

#[tauri::command]
fn fs_file_exists(file_path: String) -> bool {
    Path::new(&file_path).exists()
}

#[tauri::command]
fn fs_create_directory(dir_path: String) -> BasicResult {
    match fs::create_dir_all(&dir_path) {
        Ok(_) => BasicResult { success: true, error: None },
        Err(e) => BasicResult { success: false, error: Some(e.to_string()) },
    }
}

#[tauri::command]
fn fs_remove_file(file_path: String) -> BasicResult {
    if Path::new(&file_path).exists() {
        if let Err(e) = fs::remove_file(&file_path) {
            return BasicResult { success: false, error: Some(e.to_string()) };
        }
    }
    BasicResult { success: true, error: None }
}

#[tauri::command]
fn fs_remove_directory(dir_path: String) -> BasicResult {
    if Path::new(&dir_path).exists() {
        if let Err(e) = fs::remove_dir_all(&dir_path) {
            return BasicResult { success: false, error: Some(e.to_string()) };
        }
    }
    BasicResult { success: true, error: None }
}

#[tauri::command]
fn fs_move_item(src: String, dest: String) -> BasicResult {
    let dest_path = Path::new(&dest);
    if let Some(parent) = dest_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    match fs::rename(&src, &dest) {
        Ok(_) => BasicResult { success: true, error: None },
        Err(e) => BasicResult { success: false, error: Some(e.to_string()) },
    }
}

// ---- PlantUML ----
#[derive(Serialize)]
struct PlantUmlResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn get_plantuml_args(app: &AppHandle, format: &str, extra_args: &str) -> (String, Vec<String>) {
    let state = app.state::<AppState>();
    let config = state.config.lock().unwrap();
    
    let java_path = config.get("javaPath")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("java")
        .to_string();
        
        let jar_path = config.get("plantumlJarPath")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            let res_dir = app.path().resource_dir().unwrap_or_default();
            let p1 = res_dir.join("resources/plantuml.jar");
            let p2 = res_dir.join("plantuml.jar");
            let p3 = res_dir.join("_up_/resources/plantuml.jar");
            
            let mut jar_str = if p1.exists() { p1.to_string_lossy().into_owned() }
            else if p2.exists() { p2.to_string_lossy().into_owned() }
            else if p3.exists() { p3.to_string_lossy().into_owned() }
            else {
                // fallback for development mode
                std::fs::canonicalize("../resources/plantuml.jar")
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_else(|_| "plantuml.jar".to_string())
            };
            
            #[cfg(windows)]
            if jar_str.starts_with("\\\\?\\") {
                jar_str = jar_str[4..].to_string();
            }
            
            jar_str
        });



        
    let limit_size = config.get("plantumlLimitSize")
        .and_then(|v| v.as_i64())
        .unwrap_or(4096);
        
    let encoding = config.get("encoding")
        .and_then(|v| v.as_str())
        .unwrap_or("UTF-8")
        .to_string();

    let fmt_flag = if format == "svg" { "-tsvg" } else { "-tpng" };

    let mut args = vec![
        format!("-DPLANTUML_LIMIT_SIZE={}", limit_size),
        "-jar".to_string(),
        jar_path,
        fmt_flag.to_string(),
        "-charset".to_string(),
        encoding,
        "-pipe".to_string(),
    ];
    
    if !extra_args.trim().is_empty() {
        for arg in extra_args.trim().split_whitespace() {
            args.push(arg.to_string());
        }
    }
    
    (java_path, args)
}

#[tauri::command]
async fn plantuml_render(app: AppHandle, source: String, format: Option<String>, cwd: Option<String>) -> PlantUmlResult {
    let fmt = format.unwrap_or_else(|| {
        let state = app.state::<AppState>();
        let lock = state.config.lock().unwrap();
        lock.get("exportFormat")
            .and_then(|v| v.as_str())
            .unwrap_or("png")
            .to_string()
    });
    
    let extra_args = {
        let state = app.state::<AppState>();
        let lock = state.config.lock().unwrap();
        lock.get("commandArgs")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    let (java_path, args) = get_plantuml_args(&app, &fmt, &extra_args);
    
    let mut command = Command::new(&java_path);
    command.args(&args)
           .stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());
           
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

           
    if let Some(c) = cwd {
        if !c.is_empty() {
            command.current_dir(c);
        }
    }
    
    match command.spawn() {
        Ok(mut child) => {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(source.as_bytes());
            }
            
            match child.wait_with_output() {
                Ok(output) => {
                    if output.status.success() || !output.stdout.is_empty() {
                        let base64 = STANDARD.encode(&output.stdout);
                        let mime = if fmt == "svg" { "image/svg+xml" } else { "image/png" };
                        let data = format!("data:{};base64,{}", mime, base64);
                        PlantUmlResult { success: true, data: Some(data), format: Some(fmt), path: None, error: None }
                    } else {
                        let err = String::from_utf8_lossy(&output.stderr).into_owned();
                        let msg = if err.is_empty() { format!("Process exited with code {:?}", output.status.code()) } else { err };
                        PlantUmlResult { success: false, error: Some(msg), data: None, format: None, path: None }
                    }
                },
                Err(e) => PlantUmlResult { success: false, error: Some(e.to_string()), data: None, format: None, path: None }
            }
        },
        Err(e) => PlantUmlResult { success: false, error: Some(format!("Failed to start Java '{}': {}.", java_path, e)), data: None, format: None, path: None }
    }
}

#[tauri::command]
async fn plantuml_export(app: AppHandle, source: String, format: String, output_path: String, cwd: Option<String>) -> PlantUmlResult {
    let extra_args = {
        let state = app.state::<AppState>();
        let lock = state.config.lock().unwrap();
        lock.get("commandArgs")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    let (java_path, args) = get_plantuml_args(&app, &format, &extra_args);
    
    let mut command = Command::new(&java_path);
    command.args(&args)
           .stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());
           
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

           
    if let Some(c) = cwd {
        if !c.is_empty() {
            command.current_dir(c);
        }
    }
    
    match command.spawn() {
        Ok(mut child) => {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(source.as_bytes());
            }
            
            match child.wait_with_output() {
                Ok(output) => {
                    if output.status.success() || !output.stdout.is_empty() {
                        match fs::write(&output_path, &output.stdout) {
                            Ok(_) => PlantUmlResult { success: true, path: Some(output_path), data: None, format: Some(format), error: None },
                            Err(e) => PlantUmlResult { success: false, error: Some(e.to_string()), data: None, format: None, path: None }
                        }
                    } else {
                        let err = String::from_utf8_lossy(&output.stderr).into_owned();
                        let msg = if err.is_empty() { format!("Process exited with code {:?}", output.status.code()) } else { err };
                        PlantUmlResult { success: false, error: Some(msg), data: None, format: None, path: None }
                    }
                },
                Err(e) => PlantUmlResult { success: false, error: Some(e.to_string()), data: None, format: None, path: None }
            }
        },
        Err(e) => PlantUmlResult { success: false, error: Some(format!("Failed to start Java '{}': {}.", java_path, e)), data: None, format: None, path: None }
    }
}

// ---- Configuration ----
fn config_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".")).join("config.json")
}

#[tauri::command]
fn config_get(app: AppHandle) -> serde_json::Value {
    let state = app.state::<AppState>();
    let store = state.config.lock().unwrap();
    
    let mut config = serde_json::json!({
      "plantumlJarPath": "",
      "javaPath": "java",
      "exportFormat": "png",
      "exportFolder": "",
      "plantumlLimitSize": 4096,
      "commandArgs": "",
      "svgPreviewLimit": 16384,
      "encoding": "UTF-8",
      "lastOpenedFolder": "",
      "openFiles": [],
      "activeFile": null,
      "isMaximized": true,
      "sidebarWidth": 260,
      "previewWidth": 400,
      "sidebarCollapsed": false
    });
    
    if let Some(obj) = config.as_object_mut() {
        for (k, v) in store.iter() {
            obj.insert(k.clone(), v.clone());
        }
    }
    
    config
}

#[tauri::command]
fn config_set(app: AppHandle, key: String, value: serde_json::Value) -> BasicResult {
    let state = app.state::<AppState>();
    {
        let mut store = state.config.lock().unwrap();
        store.insert(key, value);
    }
    let store = state.config.lock().unwrap();
    if let Some(parent) = config_path(&app).parent() {
        let _ = fs::create_dir_all(parent);
    }
    match fs::write(config_path(&app), serde_json::to_string(&*store).unwrap_or_default()) {
        Ok(_) => BasicResult { success: true, error: None },
        Err(e) => BasicResult { success: false, error: Some(e.to_string()) },
    }
}

#[tauri::command]
fn config_set_multiple(app: AppHandle, config_obj: HashMap<String, serde_json::Value>) -> BasicResult {
    let state = app.state::<AppState>();
    {
        let mut store = state.config.lock().unwrap();
        for (k, v) in config_obj {
            store.insert(k, v);
        }
    }
    let store = state.config.lock().unwrap();
    if let Some(parent) = config_path(&app).parent() {
        let _ = fs::create_dir_all(parent);
    }
    match fs::write(config_path(&app), serde_json::to_string(&*store).unwrap_or_default()) {
        Ok(_) => BasicResult { success: true, error: None },
        Err(e) => BasicResult { success: false, error: Some(e.to_string()) },
    }
}

// ---- Clipboard ----
#[tauri::command]
fn clipboard_copy_image(app: AppHandle, base64_data: String) -> BasicResult {
    let b64 = base64_data.trim_start_matches("data:image/png;base64,").trim_start_matches("data:image/jpeg;base64,");
    match STANDARD.decode(b64) {
        Ok(data) => {
            if let Ok(img_parsed) = image::load_from_memory(&data) {
                let rgba = img_parsed.into_rgba8();
                let width = rgba.width();
                let height = rgba.height();
                let img = tauri::image::Image::new_owned(rgba.into_raw(), width, height);
                let _ = app.clipboard().write_image(&img);
                BasicResult { success: true, error: None }
            } else {
                BasicResult { success: false, error: Some("Failed to decode image from bytes".to_string()) }
            }
        },
        Err(e) => BasicResult { success: false, error: Some(e.to_string()) }
    }
}

// ---- Shell ----
#[tauri::command]
#[allow(deprecated)]
fn shell_open_path(app: AppHandle, file_path: String) {
    if cfg!(target_os = "windows") {
        let _ = Command::new("explorer").arg("/select,").arg(&file_path).spawn();
    } else {
        let _ = app.shell().open(file_path, None);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            if let Ok(data) = fs::read_to_string(config_path(&app.handle())) {
                if let Ok(parsed) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&data) {
                    let state = app.state::<AppState>();
                    *state.config.lock().unwrap() = parsed;
                }
            }
            // For now, let's just create an empty state
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window_minimize,
            window_maximize,
            window_close,
            dialog_open_folder,
            dialog_open_file,
            dialog_select_folder,
            dialog_save_file,
            fs_read_directory,
            fs_read_file,
            fs_read_file_base64,
            fs_write_file,
            fs_file_exists,
            fs_create_directory,
            fs_remove_file,
            fs_remove_directory,
            fs_move_item,
            plantuml_render,
            plantuml_export,
            config_get,
            config_set,
            config_set_multiple,
            clipboard_copy_image,
            shell_open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
