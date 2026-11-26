/**
 * Google Drive OAuth (installed / loopback) — tokens stay on the Node side.
 *
 * Credentials (client id/secret):
 * 1. GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET
 * 2. .google-drive-oauth.json { "clientId", "clientSecret" } (gitignored)
 *
 * Optional public access: GOOGLE_API_KEY / apiKey in the same file.
 *
 * Tokens: .google-drive-tokens.json (gitignored) — never read by the browser.
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/drive.readonly',
]);

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';

export class GoogleDriveAuthError extends Error {
  constructor(code, message, details = null) {
    super(message || code);
    this.name = 'GoogleDriveAuthError';
    this.code = code;
    this.details = details;
  }
}

export function defaultOAuthPath(projectRoot) {
  return path.join(projectRoot, '.google-drive-oauth.json');
}

export function defaultTokensPath(projectRoot) {
  return path.join(projectRoot, '.google-drive-tokens.json');
}

export async function loadOAuthClientConfig(projectRoot) {
  const envId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
  const envSecret = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
  const envKey = String(process.env.GOOGLE_API_KEY || '').trim();
  if (envId && envSecret) {
    return {
      ok: true,
      clientId: envId,
      clientSecret: envSecret,
      apiKey: envKey || null,
      source: 'env',
    };
  }
  try {
    const raw = await fs.readFile(defaultOAuthPath(projectRoot), 'utf8');
    const parsed = JSON.parse(raw);
    const clientId = String(parsed.clientId || parsed.client_id || '').trim();
    const clientSecret = String(parsed.clientSecret || parsed.client_secret || '').trim();
    const apiKey = String(parsed.apiKey || parsed.api_key || envKey || '').trim() || null;
    if (!clientId || !clientSecret) {
      return {
        ok: false,
        code: 'OAUTH_CONFIG_MISSING',
        error: 'Set GOOGLE_DRIVE_CLIENT_ID/SECRET or .google-drive-oauth.json with clientId + clientSecret',
        apiKey,
      };
    }
    return {
      ok: true,
      clientId,
      clientSecret,
      apiKey,
      source: 'file',
    };
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return {
        ok: false,
        code: 'OAUTH_CONFIG_MISSING',
        error: 'Google OAuth client not configured. Create a Desktop OAuth client in Google Cloud Console, then set .google-drive-oauth.json { "clientId", "clientSecret" } (or env vars). Scope: drive.readonly.',
        apiKey: envKey || null,
      };
    }
    return {
      ok: false,
      code: 'OAUTH_CONFIG_READ_FAILED',
      error: err.message || String(err),
      apiKey: envKey || null,
    };
  }
}

async function readTokens(projectRoot) {
  try {
    const raw = await fs.readFile(defaultTokensPath(projectRoot), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeTokens(projectRoot, tokens) {
  const file = defaultTokensPath(projectRoot);
  await fs.writeFile(file, JSON.stringify(tokens, null, 2), 'utf8');
}

export async function clearGoogleDriveTokens(projectRoot) {
  try {
    await fs.unlink(defaultTokensPath(projectRoot));
  } catch {
    // ignore
  }
}

export async function getGoogleDriveAuthStatus(projectRoot) {
  const config = await loadOAuthClientConfig(projectRoot);
  const tokens = await readTokens(projectRoot);
  const hasRefresh = Boolean(tokens?.refresh_token || tokens?.refreshToken);
  const hasAccess = Boolean(tokens?.access_token || tokens?.accessToken);
  return {
    ok: Boolean(config.ok && (hasRefresh || hasAccess)),
    configured: Boolean(config.ok),
    authenticated: Boolean(hasRefresh || hasAccess),
    hasApiKey: Boolean(config.apiKey),
    configError: config.ok ? null : config.error,
    configCode: config.ok ? null : config.code,
    scopes: SCOPES.slice(),
    setupHint: config.ok
      ? null
      : 'Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Desktop). Enable Google Drive API. Save clientId/clientSecret to .google-drive-oauth.json.',
  };
}

/**
 * Return a usable access token, refreshing when needed.
 */
export async function getAccessToken(projectRoot) {
  const config = await loadOAuthClientConfig(projectRoot);
  if (!config.ok) {
    throw new GoogleDriveAuthError(config.code || 'OAUTH_CONFIG_MISSING', config.error);
  }
  let tokens = await readTokens(projectRoot);
  if (!tokens) {
    throw new GoogleDriveAuthError('AUTH_FAILED', 'Not signed in to Google — use Connect Google Account');
  }

  const access = tokens.access_token || tokens.accessToken;
  const expiry = Number(tokens.expiry_date || tokens.expiresAt || 0);
  if (access && expiry > Date.now() + 60_000) {
    return { accessToken: access, apiKey: config.apiKey };
  }

  const refresh = tokens.refresh_token || tokens.refreshToken;
  if (!refresh) {
    throw new GoogleDriveAuthError('AUTH_FAILED', 'Google session expired — Connect Google Account again');
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refresh,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleDriveAuthError(
      'TOKEN_REFRESH_FAILED',
      json.error_description || json.error || `Token refresh failed (${res.status})`,
      json,
    );
  }
  tokens = {
    ...tokens,
    access_token: json.access_token,
    expiry_date: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    token_type: json.token_type || tokens.token_type,
    scope: json.scope || tokens.scope,
  };
  await writeTokens(projectRoot, tokens);
  return { accessToken: tokens.access_token, apiKey: config.apiKey };
}

function base64Url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === 'win32') {
    // Prefer PowerShell Start-Process so & query params are not eaten by cmd.
    spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', `Start-Process -FilePath '${String(url).replace(/'/g, "''")}'`],
      { detached: true, stdio: 'ignore' },
    ).unref();
  } else if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

/**
 * Start loopback OAuth. Returns when the user finishes (or times out).
 */
export async function beginGoogleDriveLogin(projectRoot, { timeoutMs = 5 * 60_000 } = {}) {
  const config = await loadOAuthClientConfig(projectRoot);
  if (!config.ok) {
    throw new GoogleDriveAuthError(config.code || 'OAUTH_CONFIG_MISSING', config.error);
  }

  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const state = base64Url(randomBytes(16));

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        if (reqUrl.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const err = reqUrl.searchParams.get('error');
        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>Google sign-in cancelled</h1><p>${err}</p></body></html>`);
          finish(new GoogleDriveAuthError('AUTH_CANCELLED', err));
          return;
        }
        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body><h1>Invalid OAuth response</h1></body></html>');
          finish(new GoogleDriveAuthError('AUTH_FAILED', 'Invalid OAuth callback'));
          return;
        }

        const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
        const body = new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        });
        const tokenRes = await fetch(TOKEN_URI, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        const tokenJson = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>Token exchange failed</h1><p>${tokenJson.error || tokenRes.status}</p></body></html>`);
          finish(new GoogleDriveAuthError(
            'TOKEN_EXCHANGE_FAILED',
            tokenJson.error_description || tokenJson.error || 'Token exchange failed',
            tokenJson,
          ));
          return;
        }

        const tokens = {
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          expiry_date: Date.now() + (Number(tokenJson.expires_in) || 3600) * 1000,
          token_type: tokenJson.token_type,
          scope: tokenJson.scope,
          obtained_at: Date.now(),
        };
        // Preserve prior refresh token if Google omits it on re-consent.
        if (!tokens.refresh_token) {
          const prior = await readTokens(projectRoot);
          if (prior?.refresh_token) tokens.refresh_token = prior.refresh_token;
        }
        await writeTokens(projectRoot, tokens);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h1>BloodBound connected to Google Drive</h1><p>You can close this tab and return to the editor.</p></body></html>');
        finish(null, {
          ok: true,
          message: 'Google Drive connected. You can close the browser tab.',
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(String(err.message || err));
        finish(err instanceof GoogleDriveAuthError
          ? err
          : new GoogleDriveAuthError('AUTH_FAILED', err.message || String(err)));
      }
    });

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { server.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      finish(new GoogleDriveAuthError('AUTH_TIMEOUT', 'Google sign-in timed out'));
    }, timeoutMs);

    let address;
    server.listen(0, '127.0.0.1', async () => {
      address = server.address();
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      const authUrl = new URL(AUTH_URI);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPES.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      const href = authUrl.toString();
      // Persist auth URL for tooling / recovery if the OS browser launch fails.
      // Never includes client_secret.
      try {
        await fs.writeFile(
          path.join(projectRoot, '.google-drive-oauth-pending-url.txt'),
          href,
          'utf8',
        );
      } catch {
        // ignore
      }
      openBrowser(href);
    });

    server.on('error', (err) => {
      finish(new GoogleDriveAuthError('AUTH_SERVER_FAILED', err.message || String(err)));
    });
  });
}
