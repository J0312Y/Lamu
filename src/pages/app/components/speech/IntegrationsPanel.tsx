import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components';
import {
  CheckCircleIcon,
  XCircleIcon,
  LoaderIcon,
  PlugIcon,
  UnplugIcon,
  RefreshCwIcon,
  EyeIcon,
  EyeOffIcon,
  DatabaseIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useIntegrations,
  type IntegrationService,
  type GitHubCredentials,
  type GitLabCredentials,
  type JiraCredentials,
  type SlackCredentials,
  type GoogleCredentials,
  type StripeCredentials,
  type NotionCredentials,
  type DatabaseCredentials,
} from '../../../../hooks/useIntegrations';

// ── Props ──────────────────────────────────────────────────────────────────────

interface IntegrationsPanelProps {
  apiBase: string;
  authHeader?: () => Record<string, string>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type TestResult = { ok: boolean; label?: string; error?: string } | null;

function StatusBadge({ connected, label }: { connected: boolean; label?: string }) {
  if (connected) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium">
        <CheckCircleIcon className="w-3 h-3" />
        {label || 'Connecté'}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <XCircleIcon className="w-3 h-3" />
      Non connecté
    </span>
  );
}

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-xs bg-black/20 border border-border/40 rounded px-2 py-1.5 pr-7 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOffIcon className="w-3 h-3" /> : <EyeIcon className="w-3 h-3" />}
      </button>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-xs bg-black/20 border border-border/40 rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50"
    />
  );
}

// ── ServiceCard ────────────────────────────────────────────────────────────────

function ServiceCard({
  title,
  icon,
  connected,
  connectedLabel,
  testResult,
  testing,
  onTest,
  onDisconnect,
  children,
}: {
  title: string;
  icon: string;
  connected: boolean;
  connectedLabel?: string;
  testResult: TestResult;
  testing: boolean;
  onTest: () => void;
  onDisconnect: () => void;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(!connected);

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-base">{icon}</span>
        <span className="text-xs font-medium flex-1 text-foreground">{title}</span>
        <StatusBadge connected={connected} label={connectedLabel} />
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/20">
          <div className="pt-2 space-y-1.5">{children}</div>

          {/* Test result */}
          {testResult && (
            <div
              className={cn(
                'text-[10px] rounded px-2 py-1',
                testResult.ok
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              )}
            >
              {testResult.ok
                ? `✓ ${testResult.label || 'Connexion réussie'}`
                : `✗ ${testResult.error || 'Échec de connexion'}`}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1.5 pt-0.5">
            <Button
              size="sm"
              onClick={onTest}
              disabled={testing}
              className="flex-1 text-xs h-6 bg-violet-600 hover:bg-violet-700 text-white"
            >
              {testing ? (
                <LoaderIcon className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <RefreshCwIcon className="w-3 h-3 mr-1" />
              )}
              Tester &amp; sauvegarder
            </Button>
            {connected && (
              <Button
                size="sm"
                variant="outline"
                onClick={onDisconnect}
                className="text-xs h-6 text-red-400 border-red-500/30 hover:bg-red-500/10"
                title="Déconnecter"
              >
                <UnplugIcon className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

// All known integration slugs
const ALL_INTEGRATIONS = ['github', 'gitlab', 'jira', 'slack', 'google', 'stripe', 'notion', 'database'] as const;
type IntegrationSlug = (typeof ALL_INTEGRATIONS)[number];

export function IntegrationsPanel({ apiBase, authHeader }: IntegrationsPanelProps) {
  const { credentials, setCredential, removeCredential, isConnected } = useIntegrations();

  // ── Enabled integrations (fetched from backend) ────────────────────────────
  const [enabledSet, setEnabledSet] = useState<Set<IntegrationSlug>>(new Set(ALL_INTEGRATIONS));

  useEffect(() => {
    fetch(`${apiBase}/api/enabled-integrations`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.enabled)) {
          setEnabledSet(new Set(data.enabled as IntegrationSlug[]));
        }
      })
      .catch(() => { /* network error — keep all enabled */ });
  }, [apiBase]);

  const isEnabled = (slug: IntegrationSlug) => enabledSet.has(slug);

  // ── GitHub state ───────────────────────────────────────────────────────────
  const [ghToken, setGhToken] = useState((credentials.github as GitHubCredentials)?.token || '');
  const [ghTesting, setGhTesting] = useState(false);
  const [ghResult, setGhResult] = useState<TestResult>(null);

  // ── GitHub Device Flow state ───────────────────────────────────────────────
  const [ghDeviceFlow, setGhDeviceFlow] = useState<{
    user_code: string;
    verification_uri: string;
    device_code: string;
    interval: number;
  } | null>(null);
  const [ghFlowPolling, setGhFlowPolling] = useState(false);

  // ── GitLab state ──────────────────────────────────────────────────────────
  const [glToken, setGlToken] = useState((credentials.gitlab as GitLabCredentials)?.token || '');
  const [glBaseUrl, setGlBaseUrl] = useState((credentials.gitlab as GitLabCredentials)?.baseUrl || 'https://gitlab.com');
  const [glProject, setGlProject] = useState((credentials.gitlab as GitLabCredentials)?.defaultProject || '');
  const [glTesting, setGlTesting] = useState(false);
  const [glResult, setGlResult] = useState<TestResult>(null);

  // ── Jira state ────────────────────────────────────────────────────────────
  const [jiraBaseUrl, setJiraBaseUrl] = useState((credentials.jira as JiraCredentials)?.baseUrl || '');
  const [jiraEmail, setJiraEmail] = useState((credentials.jira as JiraCredentials)?.email || '');
  const [jiraToken, setJiraToken] = useState((credentials.jira as JiraCredentials)?.token || '');
  const [jiraProject, setJiraProject] = useState((credentials.jira as JiraCredentials)?.defaultProject || '');
  const [jiraTesting, setJiraTesting] = useState(false);
  const [jiraResult, setJiraResult] = useState<TestResult>(null);

  // ── Slack state ───────────────────────────────────────────────────────────
  const [slackToken, setSlackToken] = useState((credentials.slack as SlackCredentials)?.token || '');
  const [slackChannel, setSlackChannel] = useState((credentials.slack as SlackCredentials)?.defaultChannel || '');
  const [slackTesting, setSlackTesting] = useState(false);
  const [slackResult, setSlackResult] = useState<TestResult>(null);

  // ── Google state ──────────────────────────────────────────────────────────
  const [googleJson, setGoogleJson] = useState((credentials.google as GoogleCredentials)?.serviceAccountJson || '');
  const [googleTesting, setGoogleTesting] = useState(false);
  const [googleResult, setGoogleResult] = useState<TestResult>(null);

  // ── Stripe state ──────────────────────────────────────────────────────────
  const [stripeKey, setStripeKey] = useState((credentials.stripe as StripeCredentials)?.apiKey || '');
  const [stripeTesting, setStripeTesting] = useState(false);
  const [stripeResult, setStripeResult] = useState<TestResult>(null);

  // ── Notion state ──────────────────────────────────────────────────────────
  const [notionKey, setNotionKey] = useState((credentials.notion as NotionCredentials)?.apiKey || '');
  const [notionDbId, setNotionDbId] = useState((credentials.notion as NotionCredentials)?.dbId || '');
  const [notionTesting, setNotionTesting] = useState(false);
  const [notionResult, setNotionResult] = useState<TestResult>(null);

  // ── Database state ─────────────────────────────────────────────────────────
  const [dbType, setDbType] = useState<'postgres' | 'mysql'>((credentials.database as DatabaseCredentials)?.db_type || 'postgres');
  const [dbAlias, setDbAlias] = useState((credentials.database as DatabaseCredentials)?.alias || '');
  const [dbHost, setDbHost] = useState((credentials.database as DatabaseCredentials)?.host || '');
  const [dbPort, setDbPort] = useState(String((credentials.database as DatabaseCredentials)?.port || ''));
  const [dbName, setDbName] = useState((credentials.database as DatabaseCredentials)?.dbname || '');
  const [dbUser, setDbUser] = useState('');
  const [dbPass, setDbPass] = useState('');
  const [dbSsl, setDbSsl] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbResult, setDbResult] = useState<TestResult>(null);

  // ── Test helper ────────────────────────────────────────────────────────────

  const headers = useCallback(
    () => ({ 'Content-Type': 'application/json', ...(authHeader?.() || {}) }),
    [authHeader]
  );

  async function testIntegration(
    service: IntegrationService,
    credentialsPayload: Record<string, string>
  ): Promise<TestResult> {
    const r = await fetch(`${apiBase}/api/integrations/test`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ service, credentials: credentialsPayload }),
    });
    const data = await r.json();
    return data;
  }

  // ── GitHub ─────────────────────────────────────────────────────────────────

  const testGitHub = async () => {
    if (!ghToken.trim()) return;
    setGhTesting(true);
    setGhResult(null);
    try {
      const res = await testIntegration('github', { token: ghToken.trim() });
      setGhResult(res ? { ...res, label: res.ok ? `@${(res as { login?: string }).login || 'connecté'}` : undefined } : { ok: false, error: 'Pas de réponse' });
      if (res?.ok) {
        setCredential('github', {
          token: ghToken.trim(),
          login: (res as { login?: string }).login,
          connected_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      setGhResult({ ok: false, error: String(e) });
    } finally {
      setGhTesting(false);
    }
  };

  // GitHub Device Flow
  const startGitHubDeviceFlow = async () => {
    setGhFlowPolling(true);
    setGhResult(null);
    try {
      const r = await fetch(`${apiBase}/api/integrations/github/device-flow/start`, {
        method: 'POST',
        headers: headers(),
      });
      if (!r.ok) { setGhResult({ ok: false, error: 'Device Flow non disponible' }); setGhFlowPolling(false); return; }
      const data = await r.json();
      setGhDeviceFlow(data);
      // Poll for token
      const pollInterval = (data.interval || 5) * 1000;
      const poll = setInterval(async () => {
        try {
          const pr = await fetch(`${apiBase}/api/integrations/github/device-flow/poll`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ device_code: data.device_code }),
          });
          const pd = await pr.json();
          if (pd.access_token) {
            clearInterval(poll);
            setGhDeviceFlow(null);
            setGhFlowPolling(false);
            setGhToken(pd.access_token);
            // Verify
            const testRes = await testIntegration('github', { token: pd.access_token });
            setGhResult(testRes ? { ...testRes, label: testRes.ok ? `@${(testRes as { login?: string }).login || 'connecté'}` : undefined } : { ok: false, error: 'Token reçu mais test échoué' });
            if (testRes?.ok) {
              setCredential('github', {
                token: pd.access_token,
                login: (testRes as { login?: string }).login,
                connected_at: new Date().toISOString(),
              });
            }
          } else if (pd.error && pd.error !== 'authorization_pending' && pd.error !== 'slow_down') {
            clearInterval(poll);
            setGhDeviceFlow(null);
            setGhFlowPolling(false);
            setGhResult({ ok: false, error: pd.error_description || pd.error });
          }
        } catch { /* keep polling */ }
      }, pollInterval);
      // Cleanup after 5 minutes
      setTimeout(() => {
        clearInterval(poll);
        setGhDeviceFlow(null);
        setGhFlowPolling(false);
      }, 5 * 60 * 1000);
    } catch (e) {
      setGhResult({ ok: false, error: String(e) });
      setGhFlowPolling(false);
    }
  };

  // ── GitLab ─────────────────────────────────────────────────────────────────

  const testGitLab = async () => {
    if (!glToken.trim()) return;
    setGlTesting(true);
    setGlResult(null);
    try {
      const res = await testIntegration('gitlab', { token: glToken.trim(), baseUrl: glBaseUrl.trim() || 'https://gitlab.com' });
      setGlResult(res ? { ...res, label: res.ok ? `@${(res as { username?: string }).username || 'connecté'}` : undefined } : { ok: false, error: 'Pas de réponse' });
      if (res?.ok) {
        setCredential('gitlab', {
          token: glToken.trim(),
          baseUrl: glBaseUrl.trim() || 'https://gitlab.com',
          defaultProject: glProject.trim() || undefined,
        });
      }
    } catch (e) {
      setGlResult({ ok: false, error: String(e) });
    } finally {
      setGlTesting(false);
    }
  };

  // ── Jira ───────────────────────────────────────────────────────────────────

  const testJira = async () => {
    if (!jiraToken.trim() || !jiraEmail.trim() || !jiraBaseUrl.trim()) return;
    setJiraTesting(true);
    setJiraResult(null);
    try {
      const res = await testIntegration('jira', {
        token: jiraToken.trim(),
        email: jiraEmail.trim(),
        baseUrl: jiraBaseUrl.trim(),
      });
      setJiraResult(res ? { ...res, label: res.ok ? `${(res as { displayName?: string }).displayName || jiraEmail}` : undefined } : { ok: false, error: 'Pas de réponse' });
      if (res?.ok) {
        setCredential('jira', {
          token: jiraToken.trim(),
          email: jiraEmail.trim(),
          baseUrl: jiraBaseUrl.trim(),
          defaultProject: jiraProject.trim() || undefined,
        });
      }
    } catch (e) {
      setJiraResult({ ok: false, error: String(e) });
    } finally {
      setJiraTesting(false);
    }
  };

  // ── Slack ──────────────────────────────────────────────────────────────────

  const testSlack = async () => {
    if (!slackToken.trim()) return;
    setSlackTesting(true);
    setSlackResult(null);
    try {
      const res = await testIntegration('slack', { token: slackToken.trim() });
      setSlackResult(res ? { ...res, label: res.ok ? `${(res as { team?: string }).team || 'connecté'}` : undefined } : { ok: false, error: 'Pas de réponse' });
      if (res?.ok) {
        setCredential('slack', {
          token: slackToken.trim(),
          defaultChannel: slackChannel.trim() || undefined,
          team: (res as { team?: string }).team,
        });
      }
    } catch (e) {
      setSlackResult({ ok: false, error: String(e) });
    } finally {
      setSlackTesting(false);
    }
  };

  // ── Google ─────────────────────────────────────────────────────────────────

  const testGoogle = async () => {
    if (!googleJson.trim()) return;
    setGoogleTesting(true);
    setGoogleResult(null);
    try {
      const res = await testIntegration('google', { serviceAccountJson: googleJson.trim() });
      setGoogleResult(res ? { ...res, label: res.ok ? `${(res as { email?: string }).email || 'Service Account'}` : undefined } : { ok: false, error: 'Pas de réponse' });
      if (res?.ok) {
        setCredential('google', {
          serviceAccountJson: googleJson.trim(),
          email: (res as { email?: string }).email,
        });
      }
    } catch (e) {
      setGoogleResult({ ok: false, error: String(e) });
    } finally {
      setGoogleTesting(false);
    }
  };

  // ── Stripe ─────────────────────────────────────────────────────────────────

  const testStripe = async () => {
    if (!stripeKey.trim()) return;
    setStripeTesting(true);
    setStripeResult(null);
    try {
      const res = await testIntegration('stripe', { apiKey: stripeKey.trim() });
      setStripeResult(res ? { ...res, label: res.ok ? `${(res as { email?: string }).email || 'Compte Stripe'}` : undefined } : { ok: false, error: 'Pas de réponse' });
      if (res?.ok) {
        setCredential('stripe', { apiKey: stripeKey.trim() });
      }
    } catch (e) {
      setStripeResult({ ok: false, error: String(e) });
    } finally {
      setStripeTesting(false);
    }
  };

  // ── Notion ─────────────────────────────────────────────────────────────────

  const testNotion = async () => {
    if (!notionKey.trim()) return;
    setNotionTesting(true);
    setNotionResult(null);
    try {
      const res = await testIntegration('notion', { apiKey: notionKey.trim() });
      setNotionResult(res ? { ...res, label: res.ok ? `${(res as { name?: string }).name || 'Notion'}` : undefined } : { ok: false, error: 'Pas de réponse' });
      if (res?.ok) {
        setCredential('notion', {
          apiKey: notionKey.trim(),
          dbId: notionDbId.trim() || undefined,
        });
      }
    } catch (e) {
      setNotionResult({ ok: false, error: String(e) });
    } finally {
      setNotionTesting(false);
    }
  };

  // ── Database ───────────────────────────────────────────────────────────────

  const testDatabase = async () => {
    if (!dbHost.trim() || !dbName.trim() || !dbUser.trim()) return;
    setDbTesting(true);
    setDbResult(null);
    try {
      const port = parseInt(dbPort) || (dbType === 'postgres' ? 5432 : 3306);
      const alias = dbAlias.trim() || `${dbHost.trim()}/${dbName.trim()}`;

      await invoke<boolean>('kb_add_database', {
        dbType,
        alias,
        host: dbHost.trim(),
        port,
        dbname: dbName.trim(),
        username: dbUser.trim(),
        password: dbPass,
        ssl: dbSsl,
      });

      // Retrieve the integration_id from the list (most recent matching entry)
      const list = await invoke<Array<{ id: string; provider: string; name: string; created_at: number }>>('kb_list_integrations');
      const entry = list
        .filter(i => i.provider === dbType)
        .sort((a, b) => b.created_at - a.created_at)[0];

      const integrationId = entry?.id || 'unknown';
      setDbResult({ ok: true, label: `Connecté — ${alias}` });
      setCredential('database', {
        integration_id: integrationId,
        alias,
        db_type: dbType,
        host: dbHost.trim(),
        port,
        dbname: dbName.trim(),
      });
      setDbPass('');
    } catch (e) {
      setDbResult({ ok: false, error: String(e) });
    } finally {
      setDbTesting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const ghConnected = isConnected('github');
  const glConnected = isConnected('gitlab');
  const jiraConnected = isConnected('jira');
  const slackConnected = isConnected('slack');
  const googleConnected = isConnected('google');
  const stripeConnected = isConnected('stripe');
  const notionConnected = isConnected('notion');
  const dbConnected = isConnected('database');

  const connectedCount = [
    ghConnected && isEnabled('github'),
    glConnected && isEnabled('gitlab'),
    jiraConnected && isEnabled('jira'),
    slackConnected && isEnabled('slack'),
    googleConnected && isEnabled('google'),
    stripeConnected && isEnabled('stripe'),
    notionConnected && isEnabled('notion'),
    dbConnected && isEnabled('database'),
  ].filter(Boolean).length;

  const totalEnabled = ALL_INTEGRATIONS.filter(s => isEnabled(s)).length;

  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <PlugIcon className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-semibold text-foreground">Intégrations</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {connectedCount}/{totalEnabled} connectées
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Vos tokens sont stockés localement et envoyés uniquement lors des appels de l'agent.
      </p>

      {/* GitHub */}
      {isEnabled('github') && <ServiceCard
        title="GitHub"
        icon="🐙"
        connected={ghConnected}
        connectedLabel={credentials.github?.login ? `@${credentials.github.login}` : 'Connecté'}
        testResult={ghResult}
        testing={ghTesting}
        onTest={testGitHub}
        onDisconnect={() => { removeCredential('github'); setGhToken(''); setGhResult(null); setGhDeviceFlow(null); }}
      >
        <SecretInput value={ghToken} onChange={setGhToken} placeholder="ghp_xxxx — Personal Access Token" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground flex-1">ou utiliser le Device Flow OAuth :</span>
          <Button
            size="sm"
            variant="outline"
            onClick={startGitHubDeviceFlow}
            disabled={ghFlowPolling}
            className="text-[10px] h-5 px-2"
          >
            {ghFlowPolling ? <LoaderIcon className="w-2.5 h-2.5 animate-spin mr-1" /> : null}
            {ghFlowPolling ? 'En attente…' : 'OAuth'}
          </Button>
        </div>
        {ghDeviceFlow && (
          <div className="rounded bg-amber-500/10 border border-amber-500/20 p-2 space-y-1">
            <p className="text-[10px] font-medium text-amber-400">Ouvrez ce lien dans votre navigateur :</p>
            <a
              href={ghDeviceFlow.verification_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-400 underline break-all"
            >
              {ghDeviceFlow.verification_uri}
            </a>
            <p className="text-[10px] text-foreground">
              Code : <span className="font-mono font-bold text-amber-300">{ghDeviceFlow.user_code}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">En attente de votre autorisation…</p>
          </div>
        )}
      </ServiceCard>}

      {/* GitLab */}
      {isEnabled('gitlab') && <ServiceCard
        title="GitLab"
        icon="🦊"
        connected={glConnected}
        connectedLabel={credentials.gitlab ? 'Connecté' : undefined}
        testResult={glResult}
        testing={glTesting}
        onTest={testGitLab}
        onDisconnect={() => { removeCredential('gitlab'); setGlToken(''); setGlResult(null); }}
      >
        <SecretInput value={glToken} onChange={setGlToken} placeholder="glpat-xxxx — Personal Access Token" />
        <TextInput value={glBaseUrl} onChange={setGlBaseUrl} placeholder="https://gitlab.com" />
        <TextInput value={glProject} onChange={setGlProject} placeholder="namespace/projet (optionnel)" />
      </ServiceCard>}

      {/* Jira */}
      {isEnabled('jira') && <ServiceCard
        title="Jira"
        icon="🎯"
        connected={jiraConnected}
        connectedLabel={credentials.jira?.email || undefined}
        testResult={jiraResult}
        testing={jiraTesting}
        onTest={testJira}
        onDisconnect={() => { removeCredential('jira'); setJiraToken(''); setJiraEmail(''); setJiraBaseUrl(''); setJiraResult(null); }}
      >
        <TextInput value={jiraBaseUrl} onChange={setJiraBaseUrl} placeholder="https://votre-domaine.atlassian.net" />
        <TextInput value={jiraEmail} onChange={setJiraEmail} placeholder="votre@email.com" />
        <SecretInput value={jiraToken} onChange={setJiraToken} placeholder="Token API Jira" />
        <TextInput value={jiraProject} onChange={setJiraProject} placeholder="Clé projet (ex: PROJ) optionnel" />
      </ServiceCard>}

      {/* Slack */}
      {isEnabled('slack') && <ServiceCard
        title="Slack"
        icon="💬"
        connected={slackConnected}
        connectedLabel={credentials.slack?.team || undefined}
        testResult={slackResult}
        testing={slackTesting}
        onTest={testSlack}
        onDisconnect={() => { removeCredential('slack'); setSlackToken(''); setSlackResult(null); }}
      >
        <SecretInput value={slackToken} onChange={setSlackToken} placeholder="xoxb-xxxx — Bot Token" />
        <TextInput value={slackChannel} onChange={setSlackChannel} placeholder="#general (canal par défaut, optionnel)" />
      </ServiceCard>}

      {/* Google Drive */}
      {isEnabled('google') && <ServiceCard
        title="Google Drive"
        icon="📁"
        connected={googleConnected}
        connectedLabel={credentials.google?.email || undefined}
        testResult={googleResult}
        testing={googleTesting}
        onTest={testGoogle}
        onDisconnect={() => { removeCredential('google'); setGoogleJson(''); setGoogleResult(null); }}
      >
        <p className="text-[10px] text-muted-foreground">
          Collez le JSON du Service Account Google (fichier .json téléchargé depuis la Google Cloud Console).
        </p>
        <textarea
          value={googleJson}
          onChange={(e) => setGoogleJson(e.target.value)}
          placeholder='{"type":"service_account","project_id":"..."}'
          rows={4}
          className="w-full text-xs bg-black/20 border border-border/40 rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none font-mono"
        />
      </ServiceCard>}

      {/* Stripe */}
      {isEnabled('stripe') && <ServiceCard
        title="Stripe"
        icon="💳"
        connected={stripeConnected}
        connectedLabel={undefined}
        testResult={stripeResult}
        testing={stripeTesting}
        onTest={testStripe}
        onDisconnect={() => { removeCredential('stripe'); setStripeKey(''); setStripeResult(null); }}
      >
        <SecretInput value={stripeKey} onChange={setStripeKey} placeholder="sk_live_xxxx ou sk_test_xxxx" />
      </ServiceCard>}

      {/* Notion */}
      {isEnabled('notion') && <ServiceCard
        title="Notion"
        icon="📝"
        connected={notionConnected}
        connectedLabel={undefined}
        testResult={notionResult}
        testing={notionTesting}
        onTest={testNotion}
        onDisconnect={() => { removeCredential('notion'); setNotionKey(''); setNotionDbId(''); setNotionResult(null); }}
      >
        <SecretInput value={notionKey} onChange={setNotionKey} placeholder="secret_xxxx — Integration Token" />
        <TextInput value={notionDbId} onChange={setNotionDbId} placeholder="ID de base de données Notion (optionnel)" />
      </ServiceCard>}

      {/* Database */}
      {isEnabled('database') && <div className="rounded-lg border border-border/40 overflow-hidden">
        <button
          onClick={() => { /* toggle handled via state */ }}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors cursor-default"
        >
          <DatabaseIcon className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-medium flex-1 text-foreground">Base de données</span>
          {dbConnected
            ? <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium"><CheckCircleIcon className="w-3 h-3" />{(credentials.database as DatabaseCredentials)?.alias || 'Connecté'}</span>
            : <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><XCircleIcon className="w-3 h-3" />Non connecté</span>
          }
        </button>

        <div className="px-3 pb-3 space-y-2 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground pt-2">
            Connectez votre PostgreSQL ou MySQL pour permettre à l'agent d'interroger vos données.
          </p>

          {/* DB type selector */}
          <div className="flex gap-1.5">
            {(['postgres', 'mysql'] as const).map(t => (
              <button
                key={t}
                onClick={() => setDbType(t)}
                className={cn(
                  'flex-1 text-[10px] py-1 rounded border transition-colors',
                  dbType === t
                    ? 'border-blue-500/60 bg-blue-500/10 text-blue-400'
                    : 'border-border/40 text-muted-foreground hover:border-border/60'
                )}
              >
                {t === 'postgres' ? 'PostgreSQL' : 'MySQL'}
              </button>
            ))}
          </div>

          <TextInput value={dbAlias} onChange={setDbAlias} placeholder="Nom affiché (ex: Production DB)" />
          <TextInput value={dbHost} onChange={setDbHost} placeholder="Hôte (ex: localhost ou db.example.com)" />
          <div className="flex gap-1.5">
            <div className="flex-1">
              <TextInput value={dbName} onChange={setDbName} placeholder="Nom de la base" />
            </div>
            <div className="w-20">
              <TextInput value={dbPort} onChange={setDbPort} placeholder={dbType === 'postgres' ? '5432' : '3306'} />
            </div>
          </div>
          <TextInput value={dbUser} onChange={setDbUser} placeholder="Utilisateur" />
          <SecretInput value={dbPass} onChange={setDbPass} placeholder="Mot de passe" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dbSsl}
              onChange={e => setDbSsl(e.target.checked)}
              className="w-3 h-3 rounded"
            />
            <span className="text-[10px] text-muted-foreground">SSL/TLS</span>
          </label>

          {dbResult && (
            <div className={cn('text-[10px] rounded px-2 py-1', dbResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
              {dbResult.ok ? `✓ ${dbResult.label || 'Connexion réussie'}` : `✗ ${dbResult.error || 'Échec de connexion'}`}
            </div>
          )}

          <div className="flex gap-1.5 pt-0.5">
            <Button
              size="sm"
              onClick={testDatabase}
              disabled={dbTesting || !dbHost.trim() || !dbName.trim() || !dbUser.trim()}
              className="flex-1 text-xs h-6 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {dbTesting ? <LoaderIcon className="w-3 h-3 animate-spin mr-1" /> : <RefreshCwIcon className="w-3 h-3 mr-1" />}
              Tester &amp; connecter
            </Button>
            {dbConnected && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { removeCredential('database'); setDbResult(null); }}
                className="text-xs h-6 text-red-400 border-red-500/30 hover:bg-red-500/10"
                title="Déconnecter"
              >
                <UnplugIcon className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </div>}
    </div>
  );
}
