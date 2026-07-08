use std::fs;
use tauri::Manager;

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

/// Returns the raw settings JSON, or None if no settings file exists yet.
/// The frontend owns the settings schema; Rust just persists the bytes.
#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|e| format!("settings must be valid JSON: {e}"))?;
    let path = settings_path(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn cases_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("cases");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn validate_case_id(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        Ok(())
    } else {
        Err(format!("invalid case id: {id}"))
    }
}

/// Cases are stored as one JSON file per case under app_data/cases/<id>.json.
/// The frontend owns the case schema; Rust just persists the bytes.
#[tauri::command]
fn save_case(app: tauri::AppHandle, id: String, json: String) -> Result<(), String> {
    validate_case_id(&id)?;
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|e| format!("case must be valid JSON: {e}"))?;
    let path = cases_dir(&app)?.join(format!("{id}.json"));
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_cases(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = cases_dir(&app)?;
    let mut cases = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            cases.push(fs::read_to_string(&path).map_err(|e| e.to_string())?);
        }
    }
    Ok(cases)
}

#[tauri::command]
fn delete_case(app: tauri::AppHandle, id: String) -> Result<(), String> {
    validate_case_id(&id)?;
    let path = cases_dir(&app)?.join(format!("{id}.json"));
    fs::remove_file(&path).map_err(|e| e.to_string())
}

fn whisper_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("whisper"))
}

fn find_whisper(app: &tauri::AppHandle) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let dir = whisper_dir(app)?;
    let exe = ["whisper-cli.exe", "main.exe"]
        .iter()
        .map(|n| dir.join(n))
        .find(|p| p.exists())
        .ok_or_else(|| format!("whisper-cli.exe not found in {}", dir.display()))?;
    let model = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .find(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            name.starts_with("ggml-") && name.ends_with(".bin")
        })
        .ok_or_else(|| format!("no ggml-*.bin model found in {}", dir.display()))?;
    Ok((exe, model))
}

#[derive(serde::Serialize)]
struct WhisperStatus {
    ok: bool,
    detail: String,
}

#[tauri::command]
fn whisper_status(app: tauri::AppHandle) -> WhisperStatus {
    match find_whisper(&app) {
        Ok((exe, model)) => WhisperStatus {
            ok: true,
            detail: format!(
                "{} + {}",
                exe.file_name().unwrap_or_default().to_string_lossy(),
                model.file_name().unwrap_or_default().to_string_lossy()
            ),
        },
        Err(e) => WhisperStatus { ok: false, detail: e },
    }
}

/// Transcribe a 16 kHz mono PCM16 WAV with the local whisper.cpp CLI.
#[tauri::command]
async fn transcribe_audio(app: tauri::AppHandle, wav: Vec<u8>) -> Result<String, String> {
    let (exe, model) = find_whisper(&app)?;
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let wav_path = cache.join(format!("utterance-{}.wav", std::process::id()));
    fs::write(&wav_path, &wav).map_err(|e| e.to_string())?;

    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(&exe);
        cmd.arg("-m")
            .arg(&model)
            .arg("-f")
            .arg(&wav_path)
            .arg("--no-timestamps")
            .arg("--language")
            .arg("en");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let output = cmd.output().map_err(|e| format!("failed to run whisper: {e}"))?;
        let _ = fs::remove_file(&wav_path);
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("whisper exited with error: {}", err.chars().take(300).collect::<String>()));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(result)
}

/// Launch the Kokoro TTS sidecar (a Node script in this repo). The script path
/// is baked in at compile time — fine for a personal tool built and run on the
/// same machine. The frontend checks /health first and only calls this when
/// the sidecar is down.
#[tauri::command]
fn start_kokoro() -> Result<(), String> {
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("scripts")
        .join("kokoro-server.mjs");
    if !script.exists() {
        return Err(format!("kokoro server script not found at {}", script.display()));
    }
    let mut cmd = std::process::Command::new("node");
    cmd.arg(&script);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn().map_err(|e| format!("failed to start kokoro sidecar: {e}"))?;
    Ok(())
}

/// Sessions persist like cases: one JSON file per session, frontend owns the
/// schema. Autosaved after every turn so a crash never loses an interview.
#[tauri::command]
fn save_session(app: tauri::AppHandle, id: String, json: String) -> Result<(), String> {
    validate_case_id(&id)?;
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|e| format!("session must be valid JSON: {e}"))?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("sessions");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{id}.json")), json).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            save_case,
            list_cases,
            delete_case,
            save_session,
            whisper_status,
            transcribe_audio,
            start_kokoro
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
