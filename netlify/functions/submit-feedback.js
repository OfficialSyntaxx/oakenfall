// Netlify Function: files an in-game bug report / suggestion as a GitHub issue
// on behalf of the player, so they never need a GitHub account or to click
// "submit" on GitHub themselves.
//
// Requires a repo-scoped GitHub token in the GITHUB_ISSUE_TOKEN env var
// (Site settings > Environment variables in the Netlify dashboard, or set via
// the Netlify MCP/CLI). Optionally set GITHUB_ISSUE_REPO to override the
// default "OfficialSyntaxx/oakenfall" target.

const DEFAULT_REPO = 'OfficialSyntaxx/oakenfall';
const MAX_TITLE = 250;
const MAX_BODY = 6000;

// Origins allowed to submit feedback. Defaults cover the current Netlify site;
// set ALLOWED_ORIGINS (comma-separated) when moving to your own domain so this
// keeps working without a code change. An empty allowlist disables the check.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://oakenfall.netlify.app,https://deploy-preview')
  .split(',').map((s) => s.trim()).filter(Boolean);

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Reject browser calls from unknown sites (blunts cross-site abuse). Requests
  // with no Origin (e.g. server-to-server) are allowed through to preserve the
  // in-game flow; robust rate-limiting belongs at the CDN/host layer.
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  if (origin && ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origin not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // Honeypot: real players never fill this hidden field. Pretend success so
  // bots don't learn they were caught, but file nothing.
  if (payload.website) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  const kind = payload.kind === 'suggestion' ? 'suggestion' : 'bug';
  const title = String(payload.title || '').trim().slice(0, MAX_TITLE);
  const body = String(payload.body || '').trim().slice(0, MAX_BODY);

  if (!title || !body) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing title or body' }) };
  }

  const token = process.env.GITHUB_ISSUE_TOKEN;
  if (!token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server missing GITHUB_ISSUE_TOKEN' }) };
  }
  const repo = process.env.GITHUB_ISSUE_REPO || DEFAULT_REPO;

  try {
    const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'oakenfall-feedback-bot'
      },
      body: JSON.stringify({
        title,
        body,
        labels: [kind === 'bug' ? 'bug' : 'enhancement', 'player-submitted']
      })
    });

    const data = await ghRes.json().catch(() => ({}));

    if (!ghRes.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'GitHub API error', detail: data && data.message })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, url: data.html_url, number: data.number })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};
