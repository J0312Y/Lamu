/// Google Calendar integration — fetches upcoming events.
///
/// Auth: OAuth 2.0 with Google (same app as Drive).
/// Scopes: https://www.googleapis.com/auth/calendar.readonly
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::knowledge::oauth::{run_oauth_flow, OAuthConfig};
use tauri::AppHandle;

pub const PROVIDER: &str = "google_calendar";
pub const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const EVENTS_URL: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CalendarEvent {
    pub id: String,
    pub summary: String,
    pub description: Option<String>,
    pub start: String, // ISO8601
    pub end: String,
    pub location: Option<String>,
    pub attendees: Vec<String>,
    pub meet_link: Option<String>,
}

pub async fn connect(
    app: &AppHandle,
    client_id: &str,
    client_secret: &str,
) -> Result<(String, Option<String>, Option<u64>, String), String> {
    let tokens = run_oauth_flow(
        app,
        OAuthConfig {
            auth_url: AUTH_URL.to_string(),
            token_url: TOKEN_URL.to_string(),
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            scopes: vec![
                "https://www.googleapis.com/auth/calendar.readonly".to_string(),
                "https://www.googleapis.com/auth/userinfo.email".to_string(),
            ],
            extra_auth_params: vec![("access_type".into(), "offline".into()), ("prompt".into(), "consent".into())],
            extra_token_params: vec![],
        },
    )
    .await?;

    let name = fetch_user_email(&tokens.access_token)
        .await
        .unwrap_or_else(|_| "Google Calendar".to_string());

    Ok((tokens.access_token, tokens.refresh_token, tokens.expires_in, name))
}

async fn fetch_user_email(access_token: &str) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Info { email: Option<String> }
    let resp: Info = Client::new()
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    resp.email.ok_or_else(|| "No email returned".to_string())
}

pub async fn fetch_upcoming_events(
    access_token: &str,
    max_results: u32,
) -> Result<Vec<CalendarEvent>, String> {
    #[derive(Deserialize)]
    struct Resp { items: Option<Vec<Item>> }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Item {
        id: Option<String>,
        summary: Option<String>,
        description: Option<String>,
        start: TimeValue,
        end: TimeValue,
        location: Option<String>,
        attendees: Option<Vec<Attendee>>,
        conference_data: Option<ConferenceData>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct TimeValue { date_time: Option<String>, date: Option<String> }
    #[derive(Deserialize)]
    struct Attendee { email: Option<String> }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ConferenceData { entry_points: Option<Vec<EntryPoint>> }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct EntryPoint { entry_point_type: Option<String>, uri: Option<String> }

    let now = chrono::Utc::now().to_rfc3339();
    let resp: Resp = Client::new()
        .get(EVENTS_URL)
        .bearer_auth(access_token)
        .query(&[
            ("timeMin", now.as_str()),
            ("maxResults", &max_results.to_string()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ])
        .send()
        .await
        .map_err(|e| format!("Calendar API request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Calendar API parse failed: {}", e))?;

    let events = resp.items.unwrap_or_default().into_iter().filter_map(|item| {
        let start = item.start.date_time.or(item.start.date)?;
        let end = item.end.date_time.or(item.end.date)?;
        let meet_link = item.conference_data.and_then(|cd| {
            cd.entry_points?.into_iter()
                .find(|ep| ep.entry_point_type.as_deref() == Some("video"))
                .and_then(|ep| ep.uri)
        });
        Some(CalendarEvent {
            id: item.id.unwrap_or_default(),
            summary: item.summary.unwrap_or_else(|| "(No title)".into()),
            description: item.description,
            start,
            end,
            location: item.location,
            attendees: item.attendees.unwrap_or_default()
                .into_iter().filter_map(|a| a.email).collect(),
            meet_link,
        })
    }).collect();

    Ok(events)
}
