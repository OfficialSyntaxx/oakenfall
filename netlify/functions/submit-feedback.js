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

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
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
