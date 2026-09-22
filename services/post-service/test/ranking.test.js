const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src');

const AGENT_ID = '11111111-1111-1111-1111-111111111111';
const PARTNER_ID = '22222222-2222-2222-2222-222222222222';
const VOLUNTEER_ID = '33333333-3333-3333-3333-333333333333';

function createPool() {
  return {
    async query(text) {
      if (text.includes('FROM posts') && text.includes('GROUP BY author_id')) {
        return { rows: [{ user_id: AGENT_ID, posts: 2, resolved_posts: 1, reactions_received: 4, comments_received: 3 }] };
      }
      if (text.includes('FROM supports') && text.includes('GROUP BY user_id')) {
        return { rows: [{ user_id: PARTNER_ID, supports: 3, supported_posts: 2, financial_amount: '0' }] };
      }
      if (text.includes('FROM reactions')) {
        return { rows: [{ user_id: VOLUNTEER_ID, reactions: 4 }] };
      }
      if (text.includes('FROM comments')) {
        return { rows: [{ user_id: VOLUNTEER_ID, comments: 2 }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

test('GET /ranking returns only persisted activity metrics', async () => {
  const server = createApp({ pool: createPool() }).listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/ranking`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      {
        userId: AGENT_ID,
        posts: 2,
        resolvedPosts: 1,
        reactionsReceived: 4,
        commentsReceived: 3,
        supportsReceived: 0,
        supports: 0,
        supportedPosts: 0,
        reactions: 0,
        comments: 0,
        financialAmount: 0,
      },
      {
        userId: PARTNER_ID,
        posts: 0,
        resolvedPosts: 0,
        reactionsReceived: 0,
        commentsReceived: 0,
        supportsReceived: 0,
        supports: 3,
        supportedPosts: 2,
        reactions: 0,
        comments: 0,
        financialAmount: 0,
      },
      {
        userId: VOLUNTEER_ID,
        posts: 0,
        resolvedPosts: 0,
        reactionsReceived: 0,
        commentsReceived: 0,
        supportsReceived: 0,
        supports: 0,
        supportedPosts: 0,
        reactions: 4,
        comments: 2,
        financialAmount: 0,
      },
    ]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
