// Meeting/screen-share app detection.
// Returns the names of any known meeting or screen-capture apps that are
// currently running so the frontend can auto-enable meeting mode.

#[tauri::command]
pub fn detect_meeting_apps() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    return detect_windows();

    #[cfg(target_os = "macos")]
    return detect_macos();

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    return Ok(vec![]);
}

#[cfg(target_os = "windows")]
fn detect_windows() -> Result<Vec<String>, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // CREATE_NO_WINDOW prevents a console flash for each spawned process
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Use a single PowerShell call that only checks for specific process names.
    // This is vastly lighter than `tasklist` which enumerates every process on
    // the system and was causing system instability due to 15s polling.
    const PROC_NAMES: &[(&str, &str)] = &[
        ("zoom", "Zoom"),
        ("cpthost", "Zoom"),
        ("teams", "Teams"),
        ("ms-teams", "Teams"),
        ("obs64", "OBS"),
        ("obs32", "OBS"),
        ("obs", "OBS"),
        ("discord", "Discord"),
        ("slack", "Slack"),
        ("webex", "Webex"),
        ("gotomeeting", "GoToMeeting"),
        ("ringcentral", "RingCentral"),
        ("loom", "Loom"),
        ("screenrec", "ScreenRec"),
    ];

    // Build a comma-separated list of process names for Get-Process
    let names: Vec<&str> = PROC_NAMES.iter().map(|(p, _)| *p).collect();
    let ps_script = format!(
        "Get-Process -Name {} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name",
        names.iter().map(|n| format!("'{}'", n)).collect::<Vec<_>>().join(",")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to run detection: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();

    let mut found: Vec<String> = PROC_NAMES
        .iter()
        .filter(|(proc, _)| stdout.lines().any(|line| line.trim() == *proc))
        .map(|(_, name)| name.to_string())
        .collect();

    found.sort();
    found.dedup();
    Ok(found)
}

#[cfg(target_os = "macos")]
fn detect_macos() -> Result<Vec<String>, String> {
    use std::process::Command;

    let output = Command::new("pgrep")
        .args(["-il", "."])
        .output()
        .map_err(|e| format!("Failed to run pgrep: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();

    const APPS: &[(&str, &str)] = &[
        ("zoom", "Zoom"),
        ("teams", "Teams"),
        ("obs", "OBS"),
        ("discord", "Discord"),
        ("slack", "Slack"),
        ("webex", "Webex"),
        ("loom", "Loom"),
        ("screenflow", "ScreenFlow"),
        ("gotomeeting", "GoToMeeting"),
        ("ringcentral", "RingCentral"),
    ];

    // Check line-by-line to avoid false substring matches across lines
    let lines: Vec<&str> = stdout.lines().collect();
    let mut found: Vec<String> = APPS
        .iter()
        .filter(|(proc, _)| lines.iter().any(|line| {
            // pgrep -il output: "PID processname" — match process name part
            line.split_whitespace().skip(1).any(|word| word.contains(proc))
        }))
        .map(|(_, name)| name.to_string())
        .collect();

    found.sort();
    found.dedup();
    Ok(found)
}
