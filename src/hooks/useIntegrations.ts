'use client';

import { useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GitHubCredentials {
  token: string;
  login?: string;
  connected_at?: string;
}

export interface GitLabCredentials {
  token: string;
  baseUrl?: string;
  defaultProject?: string;
}

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  token: string;
  defaultProject?: string;
}

export interface SlackCredentials {
  token: string;
  defaultChannel?: string;
  team?: string;
}

export interface GoogleCredentials {
  serviceAccountJson?: string;
  accessToken?: string;
  email?: string;
}

export interface StripeCredentials {
  apiKey: string;
}

export interface NotionCredentials {
  apiKey: string;
  dbId?: string;
}

export interface DatabaseCredentials {
  integration_id: string;
  alias: string;
  db_type: 'postgres' | 'mysql';
  host: string;
  port: number;
  dbname: string;
}

export interface IntegrationCredentials {
  github?: GitHubCredentials;
  gitlab?: GitLabCredentials;
  jira?: JiraCredentials;
  slack?: SlackCredentials;
  google?: GoogleCredentials;
  stripe?: StripeCredentials;
  notion?: NotionCredentials;
  database?: DatabaseCredentials;
}

export type IntegrationService = keyof IntegrationCredentials;

const STORAGE_KEY = 'lamu_integrations';

function load(): IntegrationCredentials {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(data: IntegrationCredentials) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useIntegrations() {
  const [credentials, setCredentials] = useState<IntegrationCredentials>(load);

  const getCredentials = useCallback((): IntegrationCredentials => {
    return load();
  }, []);

  const setCredential = useCallback(<S extends IntegrationService>(
    service: S,
    data: IntegrationCredentials[S]
  ) => {
    const updated = { ...load(), [service]: data };
    save(updated);
    setCredentials(updated);
  }, []);

  const removeCredential = useCallback((service: IntegrationService) => {
    const current = load();
    const updated = { ...current };
    delete updated[service];
    save(updated);
    setCredentials(updated);
  }, []);

  const isConnected = useCallback((service: IntegrationService): boolean => {
    const creds = load();
    const c = creds[service];
    if (!c) return false;
    // Service-specific minimum field check
    if (service === 'github') return !!((c as GitHubCredentials).token);
    if (service === 'gitlab') return !!((c as GitLabCredentials).token);
    if (service === 'jira') return !!((c as JiraCredentials).token && (c as JiraCredentials).email && (c as JiraCredentials).baseUrl);
    if (service === 'slack') return !!((c as SlackCredentials).token);
    if (service === 'google') return !!((c as GoogleCredentials).serviceAccountJson || (c as GoogleCredentials).accessToken);
    if (service === 'stripe') return !!((c as StripeCredentials).apiKey);
    if (service === 'notion') return !!((c as NotionCredentials).apiKey);
    if (service === 'database') return !!((c as DatabaseCredentials).integration_id);
    return false;
  }, []);

  /** Returns the payload to attach to agent run requests. */
  const getIntegrationsPayload = useCallback((): IntegrationCredentials => {
    return load();
  }, []);

  return {
    credentials,
    getCredentials,
    setCredential,
    removeCredential,
    isConnected,
    getIntegrationsPayload,
  };
}
