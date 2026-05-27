use crate::contacts::commands::EmailConfig;
use lettre::{
    message::{header::ContentType, Mailbox},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

/// Send a single email using the provided SMTP configuration.
/// Returns Ok(()) on success or a human-readable error string.
pub async fn send_email(
    config: &EmailConfig,
    to_name: &str,
    to_email: &str,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    if config.smtp_host.is_empty() {
        return Err("SMTP non configuré. Veuillez configurer votre serveur SMTP dans les paramètres.".to_string());
    }

    // ── Build the message ─────────────────────────────────────────────────
    let from_mailbox: Mailbox = format!(
        "{} <{}>",
        config.from_name.trim(),
        config.from_email.trim()
    )
    .parse()
    .map_err(|e| format!("Adresse expéditeur invalide: {}", e))?;

    let to_mailbox: Mailbox = if to_name.is_empty() {
        to_email.parse().map_err(|e| format!("Adresse destinataire invalide: {}", e))?
    } else {
        format!("{} <{}>", to_name.trim(), to_email.trim())
            .parse()
            .map_err(|e| format!("Adresse destinataire invalide: {}", e))?
    };

    let email = Message::builder()
        .from(from_mailbox)
        .to(to_mailbox)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_string())
        .map_err(|e| format!("Erreur construction email: {}", e))?;

    // ── Build the transport ───────────────────────────────────────────────
    let creds = Credentials::new(config.username.clone(), config.password.clone());

    let transport: AsyncSmtpTransport<Tokio1Executor> = match config.tls_mode.as_str() {
        "tls" => AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
            .map_err(|e| format!("SMTP relay error: {}", e))?
            .port(config.smtp_port)
            .credentials(creds)
            .build(),

        "none" => {
            eprintln!("[SMTP WARNING] TLS disabled — credentials sent in plaintext!");
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.smtp_host)
                .port(config.smtp_port)
                .credentials(creds)
                .build()
        },

        // Default: STARTTLS (port 587)
        _ => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
            .map_err(|e| format!("SMTP starttls error: {}", e))?
            .port(config.smtp_port)
            .credentials(creds)
            .build(),
    };

    transport
        .send(email)
        .await
        .map(|_| ())
        .map_err(|e| format!("Envoi échoué: {}", e))
}

/// Quick connection test — sends an EHLO without sending a real message.
pub async fn test_connection(config: &EmailConfig) -> Result<(), String> {
    if config.smtp_host.is_empty() {
        return Err("SMTP non configuré".to_string());
    }

    let creds = Credentials::new(config.username.clone(), config.password.clone());
    let transport: AsyncSmtpTransport<Tokio1Executor> = match config.tls_mode.as_str() {
        "tls" => AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
            .map_err(|e| e.to_string())?
            .port(config.smtp_port)
            .credentials(creds)
            .build(),
        "none" => {
            eprintln!("[SMTP WARNING] TLS disabled — credentials sent in plaintext!");
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.smtp_host)
                .port(config.smtp_port)
                .credentials(creds)
                .build()
        },
        _ => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
            .map_err(|e| e.to_string())?
            .port(config.smtp_port)
            .credentials(creds)
            .build(),
    };

    transport
        .test_connection()
        .await
        .map(|_| ())
        .map_err(|e| format!("Connexion échouée: {}", e))
}
