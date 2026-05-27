// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod activate;
mod app_config;
mod api;
mod capture;
mod contacts;
mod db;
mod detection;
mod email;
mod knowledge;
mod shortcuts;
mod window;
use std::sync::{Arc, Mutex};
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_posthog::{init as posthog_init, PostHogConfig, PostHogOptions};
use tokio::task::JoinHandle;
mod speaker;
use capture::CaptureState;
use speaker::VadConfig;

#[cfg(target_os = "macos")]
#[allow(deprecated)]
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, WebviewWindowExt};

#[derive(Default)]
pub struct AudioState {
    stream_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    mic_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    vad_config: Arc<Mutex<VadConfig>>,
    is_capturing: Arc<Mutex<bool>>,
}

pub struct KbState {
    pub db_path: Mutex<Option<std::path::PathBuf>>,
    pub embed_config: Arc<Mutex<knowledge::KbEmbedConfig>>,
    /// Keeps the notify watcher alive for the duration of the app.
    pub watcher: Arc<Mutex<Option<notify::RecommendedWatcher>>>,
}

impl Default for KbState {
    fn default() -> Self {
        Self {
            db_path: Mutex::new(None),
            embed_config: Arc::new(Mutex::new(knowledge::KbEmbedConfig::default())),
            watcher: Arc::new(Mutex::new(None)),
        }
    }
}

pub struct ContactsState {
    pub db_path: Mutex<Option<std::path::PathBuf>>,
}

impl Default for ContactsState {
    fn default() -> Self {
        Self { db_path: Mutex::new(None) }
    }
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Quick debug log — writes a line to %APPDATA%/com.lamuka.lamu/debug.log
#[tauri::command]
fn debug_log(app: tauri::AppHandle, message: String) {
    if let Ok(data_dir) = app.path().app_data_dir() {
        let log_path = data_dir.join("debug.log");
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(f, "[{}] {}", ts, message);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Get PostHog API key
    let posthog_api_key = option_env!("POSTHOG_API_KEY").unwrap_or("").to_string();
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:lamu.db", db::migrations())
                .build(),
        )
        .manage(AudioState::default())
        .manage(CaptureState::default())
        .manage(KbState::default())
        .manage(ContactsState::default())
        .manage(shortcuts::WindowVisibility {
            is_hidden: Mutex::new(false),
        })
        .manage(shortcuts::RegisteredShortcuts::default())
        .manage(shortcuts::LicenseState::default())
        .manage(shortcuts::MoveWindowState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_keychain::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(posthog_init(PostHogConfig {
            api_key: posthog_api_key,
            options: Some(PostHogOptions {
                // disable session recording
                disable_session_recording: Some(true),
                // disable pageview
                capture_pageview: Some(false),
                // disable pageleave
                capture_pageleave: Some(false),
                ..Default::default()
            }),
            ..Default::default()
        }))
        .plugin(tauri_plugin_machine_uid::init());
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            debug_log,
            app_config::get_app_config,
            window::set_window_height,
            window::open_dashboard,
            window::toggle_dashboard,
            window::move_window,
            capture::capture_to_base64,
            capture::start_screen_capture,
            capture::capture_selected_area,
            capture::close_overlay_window,
            shortcuts::check_shortcuts_registered,
            shortcuts::get_registered_shortcuts,
            shortcuts::update_shortcuts,
            shortcuts::validate_shortcut_key,
            shortcuts::set_license_status,
            shortcuts::set_app_icon_visibility,
            shortcuts::set_always_on_top,
            shortcuts::exit_app,
            activate::activate_license_api,
            activate::deactivate_license_api,
            activate::validate_license_api,
            activate::login_with_email,
            activate::get_trial_status,
            activate::get_os_username,
            activate::mask_license_key_cmd,
            activate::get_checkout_url,
            activate::initiate_payment,
            activate::check_payment_status,
            activate::secure_storage_save,
            activate::secure_storage_get,
            activate::secure_storage_remove,
            api::transcribe_audio,
            api::chat_stream_response,
            api::fetch_models,
            api::sync_conversation,
            api::fetch_prompts,
            api::create_system_prompt,
            api::check_license_status,
            api::get_activity,
            api::log_meeting_summary,
            api::log_stt_transcription,
            speaker::start_system_audio_capture,
            speaker::stop_system_audio_capture,
            speaker::manual_stop_continuous,
            speaker::check_system_audio_access,
            speaker::request_system_audio_access,
            speaker::get_vad_config,
            speaker::update_vad_config,
            speaker::get_capture_status,
            speaker::get_audio_sample_rate,
            speaker::get_input_devices,
            speaker::get_output_devices,
            speaker::start_mic_capture,
            speaker::stop_mic_capture,
            speaker::check_mic_access,
            detection::detect_meeting_apps,
            knowledge::kb_reembed_all,
            knowledge::kb_ingest_file,
            knowledge::kb_ingest_url,
            knowledge::kb_search,
            knowledge::kb_debug_search,
            knowledge::kb_list_documents,
            knowledge::kb_delete_document,
            knowledge::kb_get_document_chunks,
            knowledge::kb_get_stats,
            knowledge::kb_set_embed_config,
            knowledge::kb_get_embed_config,
            knowledge::kb_add_watched_folder,
            knowledge::kb_remove_watched_folder,
            knowledge::kb_list_watched_folders,
            knowledge::kb_connect_integration,
            knowledge::kb_add_confluence,
            knowledge::kb_list_integrations,
            knowledge::kb_disconnect_integration,
            knowledge::kb_sync_integration,
            knowledge::kb_add_jira,
            knowledge::kb_set_sync_interval,
            knowledge::kb_add_webhook,
            knowledge::kb_list_webhooks,
            knowledge::kb_remove_webhook,
            knowledge::kb_post_webhook,
            knowledge::kb_export_csv,
            knowledge::kb_set_document_access,
            knowledge::kb_add_shopify,
            knowledge::kb_add_salesforce,
            knowledge::kb_list_builtin_providers,
            knowledge::kb_add_github,
            knowledge::kb_github_device_connect,
            knowledge::kb_connect_builtin,
            knowledge::kb_add_gitlab,
            knowledge::live_query::kb_integration_live_query,
            // GitLab write
            knowledge::kb_gitlab_create_issue,
            knowledge::kb_gitlab_update_issue,
            knowledge::kb_gitlab_comment_issue,
            knowledge::kb_gitlab_create_mr,
            knowledge::kb_gitlab_upsert_file,
            // GitHub write
            knowledge::kb_github_create_issue,
            knowledge::kb_github_update_issue,
            knowledge::kb_github_add_comment,
            knowledge::kb_github_create_pr,
            // Jira write
            knowledge::kb_jira_create_issue,
            knowledge::kb_jira_update_issue,
            knowledge::kb_jira_add_comment,
            knowledge::kb_jira_transition_issue,
            // Confluence write
            knowledge::kb_confluence_create_page,
            knowledge::kb_confluence_update_page,
            // Notion write
            knowledge::kb_notion_create_page,
            knowledge::kb_notion_append_content,
            // Salesforce write
            knowledge::kb_salesforce_create_record,
            knowledge::kb_salesforce_update_record,
            // Shopify write
            knowledge::kb_shopify_create_product,
            knowledge::kb_shopify_update_product,
            // Database integrations
            knowledge::kb_add_database,
            knowledge::kb_database_query,
            knowledge::kb_database_get_schema,
            // Google Calendar
            knowledge::kb_connect_calendar,
            knowledge::kb_calendar_upcoming,
            knowledge::kb_get_activity,
            knowledge::kb_clear_activity,
            knowledge::fs_search::fs_search_files,
            knowledge::fs_search::fs_open_folder_dialog,
            knowledge::fs_search::fs_ingest_file_by_path,
            // Contacts
            contacts::contacts_list,
            contacts::contacts_search,
            contacts::contacts_resolve,
            contacts::contacts_add,
            contacts::contacts_update,
            contacts::contacts_delete,
            contacts::contacts_sync_outlook,
            contacts::email_config_get,
            contacts::email_config_save,
            contacts::email_log_list,
            // Email sending
            email::email_send,
            email::email_test_connection,
        ])
        .setup(|app| {
            sqlx::any::install_default_drivers();
            // Initialize knowledge base database
            let app_data = app.path().app_data_dir().expect("No app data dir");
            std::fs::create_dir_all(&app_data).ok();
            let kb_db_path = app_data.join("knowledge.db");
            knowledge::db::init_db(&kb_db_path).expect("Failed to init knowledge base DB");
            *app.state::<KbState>().db_path.lock().unwrap() = Some(kb_db_path.clone());

            // Initialize contacts + email database
            let contacts_db_path = app_data.join("contacts.db");
            contacts::db::init_db(&contacts_db_path).expect("Failed to init contacts DB");
            *app.state::<ContactsState>().db_path.lock().unwrap() = Some(contacts_db_path);

            // Restart folder watcher for any previously saved folders
            knowledge::watcher::restart_watcher(app.handle());

            // Start auto-sync background task
            knowledge::autosync::start_autosync(app.handle().clone());

            // Setup main window positioning
            window::setup_main_window(app).expect("Failed to setup main window");
            #[cfg(target_os = "macos")]
            init(app.app_handle());
            let app_handle = app.handle();
            if app_handle.get_webview_window("dashboard").is_none() {
                if let Err(e) = window::create_dashboard_window(&app_handle) {
                    eprintln!("Failed to pre-create dashboard window on startup: {}", e);
                }
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::MacosLauncher;

                #[allow(deprecated, unexpected_cfgs)]
                if let Err(e) = app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    Some(vec![]),
                )) {
                    eprintln!("Failed to initialize autostart plugin: {}", e);
                }
            }

            // Initialize global shortcut plugin with centralized handler
            app.handle()
                .plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

                            let action_id = {
                                let state = app.state::<shortcuts::RegisteredShortcuts>();
                                let registered = match state.shortcuts.lock() {
                                    Ok(guard) => guard,
                                    Err(poisoned) => {
                                        eprintln!("Mutex poisoned in handler, recovering...");
                                        poisoned.into_inner()
                                    }
                                };

                                registered.iter().find_map(|(action_id, shortcut_str)| {
                                    if let Ok(s) = shortcut_str.parse::<Shortcut>() {
                                        if &s == shortcut {
                                            return Some(action_id.clone());
                                        }
                                    }
                                    None
                                })
                            };

                            if let Some(action_id) = action_id {
                                match event.state() {
                                    ShortcutState::Pressed => {
                                        if let Some(direction) =
                                            action_id.strip_prefix("move_window_")
                                        {
                                            shortcuts::start_move_window(app, direction);
                                        } else {
                                            eprintln!("Shortcut triggered: {}", action_id);
                                            shortcuts::handle_shortcut_action(app, &action_id);
                                        }
                                    }
                                    ShortcutState::Released => {
                                        if let Some(direction) =
                                            action_id.strip_prefix("move_window_")
                                        {
                                            shortcuts::stop_move_window(app, direction);
                                        }
                                    }
                                }
                            }
                        })
                        .build(),
                )
                .expect("Failed to initialize global shortcut plugin");
            if let Err(e) = shortcuts::setup_global_shortcuts(app.handle()) {
                eprintln!("Failed to setup global shortcuts: {}", e);
            }
            Ok(())
        });

    // Add macOS-specific permissions plugin
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_macos_permissions::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "macos")]
#[allow(deprecated, unexpected_cfgs)]
fn init(app_handle: &AppHandle) {
    let window: WebviewWindow = app_handle.get_webview_window("main").unwrap();

    let panel = window.to_panel().unwrap();

    let delegate = panel_delegate!(MyPanelDelegate {
        window_did_become_key,
        window_did_resign_key
    });

    let handle = app_handle.to_owned();

    delegate.set_listener(Box::new(move |delegate_name: String| {
        match delegate_name.as_str() {
            "window_did_become_key" => {
                let app_name = handle.package_info().name.to_owned();

                println!("[info]: {:?} panel becomes key window!", app_name);
            }
            "window_did_resign_key" => {
                println!("[info]: panel resigned from key window!");
            }
            _ => (),
        }
    }));

    // Set the window to float level
    #[allow(non_upper_case_globals)]
    const NSFloatWindowLevel: i32 = 4;
    panel.set_level(NSFloatWindowLevel);

    #[allow(non_upper_case_globals)]
    const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;
    panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);

    #[allow(deprecated)]
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces,
    );

    panel.set_delegate(delegate);
}
