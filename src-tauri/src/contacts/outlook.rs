use serde::Deserialize;

/// A contact as returned by the PowerShell/Outlook COM bridge.
#[derive(Debug, Deserialize)]
pub struct OutlookContact {
    pub name:  String,
    pub email: String,
    #[serde(default)]
    pub company: String,
    #[serde(default)]
    pub phone: String,
}

/// Read all contacts from the local Outlook profile via PowerShell COM automation.
///
/// Returns an empty Vec (not an error) when Outlook is not installed or no
/// profile is configured — the caller falls back gracefully.
///
/// NOTE: The "new Outlook" (Windows 11) registers the COM class but hangs
/// when accessing MAPI data because it opens a web-login prompt instead.
/// We use a 10-second timeout to detect this and fail fast.
pub fn fetch_outlook_contacts() -> Result<Vec<OutlookContact>, String> {
    // PowerShell script: opens the default Outlook MAPI session and
    // enumerates the Contacts folder (folder ID 10).
    // Outputs compact JSON so we can parse it here.
    let script = r#"
try {
    $ol  = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $ns  = $ol.GetNamespace("MAPI")
    $folder = $ns.GetDefaultFolder(10)
    $out = @()
    foreach ($item in $folder.Items) {
        $email = ""
        if ($item.PSObject.Properties["Email1Address"]) {
            $email = $item.Email1Address
        }
        if ($email -ne "") {
            $out += [PSCustomObject]@{
                name    = if ($item.FullName) { $item.FullName } else { $email }
                email   = $email
                company = if ($item.CompanyName) { $item.CompanyName } else { "" }
                phone   = if ($item.BusinessTelephoneNumber) { $item.BusinessTelephoneNumber } else { "" }
            }
        }
    }
    $out | ConvertTo-Json -Compress -Depth 2
} catch {
    Write-Output "[]"
}
"#;

    let child = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-Command", script,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("PowerShell launch failed: {}", e))?;

    // Wait with a timeout — the "new Outlook" COM hangs indefinitely
    let output = wait_with_timeout(child, std::time::Duration::from_secs(10))
        .map_err(|e| format!("Outlook COM timeout (10s) — vous utilisez probablement le nouvel Outlook qui ne supporte pas la synchronisation COM. Exportez vos contacts en CSV depuis outlook.live.com puis importez-les dans Lamu. ({})", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    if trimmed.is_empty() || trimmed == "[]" {
        return Ok(Vec::new());
    }

    // PowerShell returns a single object (not array) when there's only 1 result
    let json = if trimmed.starts_with('{') {
        format!("[{}]", trimmed)
    } else {
        trimmed.to_string()
    };

    serde_json::from_str::<Vec<OutlookContact>>(&json)
        .map_err(|e| format!("Failed to parse Outlook contacts JSON: {}  raw: {}", e, &json[..json.len().min(300)]))
}

/// Wait for a child process with a timeout. Kills the process if it exceeds the deadline.
fn wait_with_timeout(mut child: std::process::Child, timeout: std::time::Duration) -> Result<std::process::Output, String> {
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = child.stdout.take().map(|mut s| {
                    let mut buf = Vec::new();
                    std::io::Read::read_to_end(&mut s, &mut buf).ok();
                    buf
                }).unwrap_or_default();
                let stderr = child.stderr.take().map(|mut s| {
                    let mut buf = Vec::new();
                    std::io::Read::read_to_end(&mut s, &mut buf).ok();
                    buf
                }).unwrap_or_default();
                return Ok(std::process::Output { status, stdout, stderr });
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("timeout".to_string());
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            Err(e) => return Err(format!("wait error: {}", e)),
        }
    }
}

/// Windows-only: try to read contacts from the Windows Contacts folder
/// as a fallback when Outlook COM is unavailable.
#[cfg(target_os = "windows")]
pub fn fetch_windows_contacts() -> Result<Vec<OutlookContact>, String> {
    let script = r#"
try {
    $path = [System.Environment]::GetFolderPath("MyDocuments") + "\..\..\Contacts"
    if (-not (Test-Path $path)) { Write-Output "[]"; return }
    $out = @()
    Get-ChildItem $path -Filter "*.contact" | ForEach-Object {
        [xml]$xml = Get-Content $_.FullName -ErrorAction SilentlyContinue
        $name  = $xml.contact.c_contactData.c_nameOrg.c_personName.c_FormattedName.c_content
        $email = $xml.contact.c_contactData.c_emailAddressCollection.c_emailAddress | Select-Object -First 1 -ExpandProperty c_value
        if ($email) {
            $out += [PSCustomObject]@{ name=$name; email=$email; company=""; phone="" }
        }
    }
    $out | ConvertTo-Json -Compress -Depth 2
} catch {
    Write-Output "[]"
}
"#;

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output()
        .map_err(|e| format!("PowerShell launch failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() || trimmed == "[]" {
        return Ok(Vec::new());
    }
    let json = if trimmed.starts_with('{') { format!("[{}]", trimmed) } else { trimmed.to_string() };
    serde_json::from_str::<Vec<OutlookContact>>(&json)
        .map_err(|e| format!("Windows contacts parse error: {}", e))
}

#[cfg(not(target_os = "windows"))]
pub fn fetch_windows_contacts() -> Result<Vec<OutlookContact>, String> {
    Ok(Vec::new())
}
