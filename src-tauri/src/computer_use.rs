//! Computer Use — desktop control: screenshot, mouse, keyboard, window management.
//! Requires explicit user opt-in via settings toggle.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use enigo::{Enigo, Keyboard, Mouse, Settings as EnigoSettings, Coordinate, Direction, Key, Button};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use xcap::Monitor;

/// Global toggle — must be enabled by user before any computer use action
static COMPUTER_USE_ENABLED: AtomicBool = AtomicBool::new(false);

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WindowInfo {
    pub title: String,
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScreenInfo {
    pub width: u32,
    pub height: u32,
    pub screenshot_base64: String,
}

fn check_enabled() -> Result<(), String> {
    if !COMPUTER_USE_ENABLED.load(Ordering::Relaxed) {
        return Err("Computer Use is disabled. Enable it in Settings → Computer Use before using desktop control features.".into());
    }
    Ok(())
}

/// Enable/disable computer use
#[tauri::command]
pub fn computer_use_set_enabled(enabled: bool) {
    COMPUTER_USE_ENABLED.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
pub fn computer_use_is_enabled() -> bool {
    COMPUTER_USE_ENABLED.load(Ordering::Relaxed)
}

/// Take a screenshot of the primary monitor, return as base64 PNG
#[tauri::command]
pub fn computer_use_screenshot() -> Result<ScreenInfo, String> {
    check_enabled()?;
    let monitors = Monitor::all().map_err(|e| format!("Monitor error: {}", e))?;
    let monitor = monitors.first().ok_or("No monitor found")?;
    let img = monitor.capture_image().map_err(|e| format!("Capture error: {}", e))?;

    let width = img.width();
    let height = img.height();

    // Encode to PNG in memory
    let mut buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode error: {}", e))?;

    let b64 = B64.encode(buf.into_inner());
    Ok(ScreenInfo { width, height, screenshot_base64: b64 })
}

/// Take a screenshot of a specific region
#[tauri::command]
pub fn computer_use_screenshot_region(x: i32, y: i32, w: u32, h: u32) -> Result<ScreenInfo, String> {
    check_enabled()?;
    let monitors = Monitor::all().map_err(|e| format!("Monitor error: {}", e))?;
    let monitor = monitors.first().ok_or("No monitor found")?;
    let img = monitor.capture_image().map_err(|e| format!("Capture error: {}", e))?;

    // Crop to region
    let cropped = image::imageops::crop_imm(
        &img,
        x.max(0) as u32,
        y.max(0) as u32,
        w.min(img.width()),
        h.min(img.height()),
    ).to_image();

    let mut buf = std::io::Cursor::new(Vec::new());
    cropped.write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode error: {}", e))?;

    let b64 = B64.encode(buf.into_inner());
    Ok(ScreenInfo { width: w, height: h, screenshot_base64: b64 })
}

/// Move mouse to coordinates
#[tauri::command]
pub fn computer_use_mouse_move(x: i32, y: i32) -> Result<(), String> {
    check_enabled()?;
    let mut enigo = Enigo::new(&EnigoSettings::default()).map_err(|e| format!("Enigo error: {}", e))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Mouse move error: {}", e))?;
    Ok(())
}

/// Click at coordinates (left, right, or middle button)
#[tauri::command]
pub fn computer_use_mouse_click(x: i32, y: i32, button: Option<String>, double_click: Option<bool>) -> Result<(), String> {
    check_enabled()?;
    let mut enigo = Enigo::new(&EnigoSettings::default()).map_err(|e| format!("Enigo error: {}", e))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Mouse move error: {}", e))?;

    let btn = match button.as_deref() {
        Some("right") => Button::Right,
        Some("middle") => Button::Middle,
        _ => Button::Left,
    };

    // Small delay for move to complete
    std::thread::sleep(std::time::Duration::from_millis(50));

    enigo.button(btn, Direction::Click).map_err(|e| format!("Click error: {}", e))?;

    if double_click.unwrap_or(false) {
        std::thread::sleep(std::time::Duration::from_millis(80));
        enigo.button(btn, Direction::Click).map_err(|e| format!("Double click error: {}", e))?;
    }
    Ok(())
}

/// Type text using keyboard
#[tauri::command]
pub fn computer_use_type_text(text: String) -> Result<(), String> {
    check_enabled()?;
    let mut enigo = Enigo::new(&EnigoSettings::default()).map_err(|e| format!("Enigo error: {}", e))?;
    enigo.text(&text).map_err(|e| format!("Type error: {}", e))?;
    Ok(())
}

/// Press a key combination (e.g., "ctrl+c", "alt+tab", "enter", "escape")
#[tauri::command]
pub fn computer_use_key_press(keys: String) -> Result<(), String> {
    check_enabled()?;
    let mut enigo = Enigo::new(&EnigoSettings::default()).map_err(|e| format!("Enigo error: {}", e))?;

    let parts: Vec<&str> = keys.split('+').map(|s| s.trim().to_lowercase().leak() as &str).collect();

    // Press modifiers
    for part in &parts[..parts.len().saturating_sub(1)] {
        let key = str_to_key(part)?;
        enigo.key(key, Direction::Press).map_err(|e| format!("Key press error: {}", e))?;
    }

    // Press and release the main key
    if let Some(last) = parts.last() {
        let key = str_to_key(last)?;
        enigo.key(key, Direction::Click).map_err(|e| format!("Key click error: {}", e))?;
    }

    // Release modifiers in reverse
    for part in parts[..parts.len().saturating_sub(1)].iter().rev() {
        let key = str_to_key(part)?;
        enigo.key(key, Direction::Release).map_err(|e| format!("Key release error: {}", e))?;
    }

    Ok(())
}

/// Scroll the mouse wheel
#[tauri::command]
pub fn computer_use_scroll(x: i32, y: i32, direction: String, amount: Option<i32>) -> Result<(), String> {
    check_enabled()?;
    let mut enigo = Enigo::new(&EnigoSettings::default()).map_err(|e| format!("Enigo error: {}", e))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Mouse move error: {}", e))?;
    std::thread::sleep(std::time::Duration::from_millis(50));

    let clicks = amount.unwrap_or(3);
    let (length, axis) = match direction.as_str() {
        "up" => (clicks, enigo::Axis::Vertical),
        "down" => (-clicks, enigo::Axis::Vertical),
        "left" => (-clicks, enigo::Axis::Horizontal),
        "right" => (clicks, enigo::Axis::Horizontal),
        _ => (-clicks, enigo::Axis::Vertical),
    };
    enigo.scroll(length, axis).map_err(|e| format!("Scroll error: {}", e))?;
    Ok(())
}

/// Get screen resolution
#[tauri::command]
pub fn computer_use_screen_size() -> Result<(u32, u32), String> {
    let monitors = Monitor::all().map_err(|e| format!("Monitor error: {}", e))?;
    let monitor = monitors.first().ok_or("No monitor found")?;
    Ok((monitor.width(), monitor.height()))
}

fn str_to_key(s: &str) -> Result<Key, String> {
    match s {
        "ctrl" | "control" => Ok(Key::Control),
        "alt" => Ok(Key::Alt),
        "shift" => Ok(Key::Shift),
        "meta" | "win" | "super" | "cmd" | "command" => Ok(Key::Meta),
        "enter" | "return" => Ok(Key::Return),
        "tab" => Ok(Key::Tab),
        "escape" | "esc" => Ok(Key::Escape),
        "backspace" => Ok(Key::Backspace),
        "delete" | "del" => Ok(Key::Delete),
        "space" => Ok(Key::Space),
        "up" => Ok(Key::UpArrow),
        "down" => Ok(Key::DownArrow),
        "left" => Ok(Key::LeftArrow),
        "right" => Ok(Key::RightArrow),
        "home" => Ok(Key::Home),
        "end" => Ok(Key::End),
        "pageup" => Ok(Key::PageUp),
        "pagedown" => Ok(Key::PageDown),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),
        s if s.len() == 1 => Ok(Key::Unicode(s.chars().next().unwrap())),
        other => Err(format!("Unknown key: {}", other)),
    }
}
