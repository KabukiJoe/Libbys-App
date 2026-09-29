const BASE_URL = 'https://api.kindroid.ai/v1';
const TIMEOUT_MS = 120_000;

function getConfig() {
  const { KINDROID_API_KEY: apiKey, KINDROID_GROUP_ID: groupId, KINDROID_AI_ID: aiId } = process.env;
  if (!apiKey || !groupId || !aiId) {
    throw new Error(
      'Kindroid is not configured (KINDROID_API_KEY / KINDROID_GROUP_ID / KINDROID_AI_ID missing)',
    );
  }
  return { apiKey, groupId, aiId };
}

// POSTs to a Kindroid endpoint and returns the raw response body.
async function post(path, apiKey, payload) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('Kindroid took too long to reply');
    throw new Error(`Could not reach Kindroid: ${err.message}`);
  }

  const body = await res.text();

  if (!res.ok) {
    console.error(`Kindroid ${path} error ${res.status}:`, body);
    if (res.status === 429) throw new Error('Rate limited by Kindroid, try again shortly');
    if (res.status === 401 || res.status === 403) throw new Error('Kindroid rejected the API key');
    throw new Error(`Kindroid returned HTTP ${res.status}`);
  }

  return body;
}

// Posts the user's message to the group chat, then has the main kin reply to it.
async function sendToGroup(message) {
  const { apiKey, groupId, aiId } = getConfig();
  await post('/groupchats-user-message', apiKey, { group_id: groupId, message });
  const body = await post('/groupchats-ai-response', apiKey, { group_id: groupId, ai_id: aiId });
  return extractReply(body);
}

// The response may be plain text or JSON; handle both.
function extractReply(body) {
  try {
    const data = JSON.parse(body);
    if (typeof data === 'string') return data;
    const reply = data.reply ?? data.message ?? data.response ?? data.text;
    if (typeof reply === 'string') return reply;
    console.warn('Unexpected Kindroid response shape:', body);
    return body;
  } catch {
    return body;
  }
}

module.exports = { sendToGroup };
