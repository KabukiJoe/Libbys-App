const BASE_URL = 'https://api.kindroid.ai/v1';
const TIMEOUT_MS = 120_000;
// Look this far back in history, to allow for clock differences between us and Kindroid.
const HISTORY_WINDOW_MS = 60_000;
const HISTORY_RETRIES = 3;
const HISTORY_RETRY_DELAY_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getConfig() {
  const { KINDROID_API_KEY: apiKey, KINDROID_GROUP_ID: groupId, KINDROID_AI_ID: aiId } = process.env;
  if (!apiKey || !groupId || !aiId) {
    throw new Error(
      'Kindroid is not configured (KINDROID_API_KEY / KINDROID_GROUP_ID / KINDROID_AI_ID missing)',
    );
  }
  return { apiKey, groupId, aiId };
}

// Calls a Kindroid endpoint and returns the raw response body.
async function request(method, path, apiKey, payload) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(payload && { 'Content-Type': 'application/json' }),
      },
      body: payload && JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('Kindroid took too long to reply');
    throw new Error(`Could not reach Kindroid: ${err.message}`);
  }

  const body = await res.text();

  if (!res.ok) {
    const name = path.split('?')[0];
    console.error(`Kindroid ${name} error ${res.status}:`, body);
    if (res.status === 429) throw new Error('Rate limited by Kindroid, try again shortly');
    if (res.status === 401 || res.status === 403) throw new Error('Kindroid rejected the API key');
    throw new Error(`Kindroid returned HTTP ${res.status}`);
  }

  return { body, contentType: res.headers.get('content-type') };
}

// Posts the user's message to the group chat, then has the main kin reply to it.
async function sendToGroup(message) {
  const { apiKey, groupId, aiId } = getConfig();
  const sentAt = Date.now();

  await request('POST', '/groupchats-user-message', apiKey, { group_id: groupId, message });
  const { body, contentType } = await request('POST', '/groupchats-ai-response', apiKey, {
    group_id: groupId,
    ai_id: aiId,
  });
  console.log(`groupchats-ai-response: content-type=${contentType}, ${body.length} chars`);

  // The reply is posted into the group; the response itself usually carries no text.
  const direct = extractReply(body);
  if (direct.trim()) return direct;

  return fetchKinReply({ apiKey, groupId, aiId, message, sentAt });
}

// Reads the group's recent history and returns the kin's reply to our message.
async function fetchKinReply({ apiKey, groupId, aiId, message, sentAt }) {
  const query = new URLSearchParams({
    group_id: groupId,
    limit: '50',
    start_after_timestamp: String(sentAt - HISTORY_WINDOW_MS),
  });

  let lastBody = '';
  for (let attempt = 1; attempt <= HISTORY_RETRIES; attempt++) {
    const { body } = await request('GET', `/get-chat-messages?${query}`, apiKey);
    lastBody = body;

    let messages = [];
    try {
      messages = JSON.parse(body).messages ?? [];
    } catch {
      console.error('get-chat-messages returned non-JSON:', body.slice(0, 1000));
      break;
    }

    const reply = pickKinReply(messages, { aiId, message, sentAt });
    if (reply) return reply;

    if (attempt < HISTORY_RETRIES) await sleep(HISTORY_RETRY_DELAY_MS);
  }

  console.error('Could not find kin reply in history:', lastBody.slice(0, 1000));
  throw new Error('Kin replied, but the reply could not be loaded');
}

// Messages are oldest first. Prefer the kin message right after our own message;
// fall back to the newest kin message since we sent.
function pickKinReply(messages, { aiId, message, sentAt }) {
  const isKinReply = (m) =>
    m.sender === 'ai' &&
    typeof m.message === 'string' &&
    m.message.trim() &&
    (m.ai_id === undefined || m.ai_id === aiId);

  let ownIndex = -1;
  messages.forEach((m, i) => {
    if (m.sender === 'user' && m.message === message) ownIndex = i;
  });

  if (ownIndex >= 0) {
    const reply = messages.slice(ownIndex + 1).find(isKinReply);
    return reply?.message;
  }

  const recent = messages.filter((m) => isKinReply(m) && m.timestamp >= sentAt - HISTORY_WINDOW_MS);
  return recent.at(-1)?.message;
}

// The response may be plain text or JSON; handle both.
function extractReply(body) {
  try {
    const data = JSON.parse(body);
    if (typeof data === 'string') return data;
    const reply = data.reply ?? data.message ?? data.response ?? data.text;
    return typeof reply === 'string' ? reply : '';
  } catch {
    return body;
  }
}

module.exports = { sendToGroup };
