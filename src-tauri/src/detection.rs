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
    use std::process::Command;

    let output = Command::new("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output()
        .map_err(|e| format!("Failed to run tasklist: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();

    const APPS: &[(&str, &str)] = &[
        ("zoom.exe", "Zoom"),
        ("cpthost.exe", "Zoom"),
        ("teams.exe", "Teams"),
        ("ms-teams.exe", "Teams"),
        ("obs64.exe", "OBS"),
        ("obs32.exe", "OBS"),
        ("obs.exe", "OBS"),
        ("discord.exe", "Discord"),
        ("slack.exe", "Slack"),
        ("webex.exe", "Webex"),
        ("gotomeeting.exe", "GoToMeeting"),
        ("ringcentral.exe", "RingCentral"),
        ("loom.exe", "Loom"),
        ("screenrec.exe", "ScreenRec"),
        ("meet.exe", "Google Meet"),
    ];

    let mut found: Vec<String> = APPS
        .iter()
        .filter(|(proc, _)| stdout.contains(proc))
        .map(|(_, name)| name.to_string())
        .collect();

    // Deduplicate (e.g. Zoom has multiple processes)
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
