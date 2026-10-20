import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { api } from './helpers.js';
import { storageFixture } from './storageFixture.js';
process.env.GUEST_CREATION_IP_LIMIT = '200';
process.env.GUEST_GENERATION_IP_LIMIT = '200';
process.env.SUPABASE_STORAGE_BUCKET = 'legacy';
process.env.SUPABASE_PRIVATE_STORAGE_BUCKET = 'originals';
process.env.SUPABASE_PREVIEW_STORAGE_BUCKET = 'previews';
const { storage, objects, buckets } = storageFixture();
mock.module('../lib/supabase.js', { defaultExport: { storage } });
const image = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#bca082' } }).png().toBuffer();
const sourcePhotoDataUrl = `data:image/png;base64,${image.toString('base64')}`;
let fail = false, qaFailures = 0, gate, entered;
const references = [];
async function generate(args) {
  references.push(args);
  entered?.();
  if (gate) await gate;
  if (fail) throw new Error('Fixture failure');
  return image.toString('base64');
}
mock.module('../lib/photoStudioGeneration.js', { namedExports: { generatePhotoStudioComposite: generate } });
mock.module('../lib/photoStudioAgentGeneration.js', { namedExports: {
  PHOTO_STUDIO_AGENT_IMAGE_MODEL: 'fixture',
  async generatePhotoStudioAgentImage(args) { return { imageBase64: await generate(args), model: 'fixture' }; },
} });
mock.module('../lib/photoGenerationQa.js', { namedExports: {
  async evaluateGeneratedFoodImage() { return { passed: qaFailures-- <= 0, score: 95, issues: [], retryPrompt: 'Retry lighting' }; },
} });
let googlePayload;
const accountEmails = [];
mock.module('../lib/email.js', { namedExports: {
  async sendAccountCreatedEmails(user) { accountEmails.push(user.id); },
  async sendPasswordResetEmail() {},
  validateEmailConfig() {},
} });
mock.module('google-auth-library', { namedExports: { OAuth2Client: class {
  async verifyIdToken() { return { getPayload: () => googlePayload }; }
} } });
const m = await import('../models/index.js');
const credits = await import('../lib/photoStudioCredits.js');
const { cleanupGuestTrials } = await import('../lib/guestCleanup.js');
const { originalDownloadUrl } = await import('../lib/photoStudioStorage.js');
const csrf = { Origin: process.env.FRONTEND_URL, 'X-Fussy-Panda-CSRF': '1' };

test('anonymous trial, private originals, account claims and cleanup', async t => {
  const { request, signup } = await api(t);
  async function trial() {
    const r = await request('/api/photoStudio/session', { method: 'POST', headers: csrf });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const cookie = r.cookie.split(';')[0];
    const secret = cookie.split('=')[1];
    const guest = await m.GuestSession.findOne({ where: { secretHash: crypto.createHash('sha256').update(secret).digest('hex') } });
    assert.ok(guest);
    return { cookie, guest, response: r };
  }
  const first = await trial();
  const { cookie, guest } = first;
  let chatId, messageId, generationId;
  await t.test('exactly five credits, hashed HttpOnly credential, repeated creation and tamper/CSRF protection', async () => {
    assert.equal(first.response.data.studio.availableTokens, 5);
    assert.match(first.response.cookie, /HttpOnly/);
    assert.match(first.response.cookie, /SameSite=Lax/);
    assert.notEqual(guest.secretHash, cookie.split('=')[1]);
    const repeated = await request('/api/photoStudio/session', { method: 'POST', cookie });
    assert.equal(repeated.data.studio.availableTokens, 5);
    assert.equal(await m.PhotoStudioCreditBucket.count({ where: { guestId: guest.id } }), 1);
    assert.equal((await request('/api/photoStudio/session', { method: 'POST' })).data.code, 'CSRF_REJECTED');
    assert.equal((await request('/api/photoStudio/session', { method: 'POST', cookie, headers: { 'X-Fussy-Panda-CSRF': '' } })).status, 403);
    assert.equal((await request('/api/photoStudio/session', { cookie: 'fp_guest=bad' })).status, 410);
    assert.equal((await request('/api/photoStudio/session', { cookie: `fp_guest=${'a'.repeat(64)}` })).status, 410);
    assert.equal((await request('/api/photoStudio/session', { cookie, headers: { Origin: 'https://evil.example' } })).status, 403);
  });
  await t.test('a public originals bucket fails closed and returns its reserved token', async () => {
    buckets.set('originals', true);
    try {
      const r = await request('/api/photoStudio/generations', { method: 'POST', cookie, body: { sourcePhotoDataUrl } });
      assert.equal(r.status, 503);
      assert.equal(objects.size, 0);
      assert.equal((await request('/api/photoStudio/session', { cookie })).data.studio.availableTokens, 5);
    } finally { buckets.set('originals', false); }
  });
  await t.test('database enforces one owner and invalid account credentials never fall back to guest access', async () => {
    await assert.rejects(m.PhotoStudioChat.create({ userId: null, guestId: null, title: 'Invalid', sourceImageUrl: 'fixture', sourceStoragePath: 'fixture' }));
    assert.equal((await request('/api/photoStudioChats', { cookie, token: 'invalid' })).status, 401);
  });
  await t.test('optional environment, free uploads and chat creation ignore client ownership and balances', async () => {
    const r = await request('/api/photoStudioChats', { method: 'POST', cookie, body: { sourcePhotoDataUrl, guestId: crypto.randomUUID(), userId: crypto.randomUUID(), balance: 999 } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    chatId = r.data.chat.id;
    assert.equal(r.data.studio.availableTokens, 5);
    const chat = await m.PhotoStudioChat.findByPk(chatId);
    assert.equal(chat.guestId, guest.id);
    assert.equal(chat.environmentStoragePath, null);
    assert.equal((await request(`/api/photoStudioChats/${chatId}/source`, { method: 'POST', cookie, body: { sourcePhotoDataUrl } })).data.studio.availableTokens, 5);
  });
  await t.test('quality retries cost one token and responses contain only reduced watermarked previews', async () => {
    qaFailures = 1;
    const r = await request(`/api/photoStudioChats/${chatId}/messages`, { method: 'POST', cookie, body: {} });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    messageId = r.data.agentMessage.id;
    assert.equal(r.data.studio.availableTokens, 4);
    assert.equal(await m.PhotoStudioGenerationAttempt.count({ where: { agentMessageId: messageId } }), 2);
    const text = JSON.stringify(r.data);
    assert.doesNotMatch(text, /signed\/|storagePath|guestId|secretHash|creditOperationId|token=fixture/);
    const message = await m.PhotoStudioMessage.findByPk(messageId);
    const preview = objects.get(`${message.storagePath}.preview.webp`);
    const meta = await sharp(preview).metadata();
    assert.ok(meta.width <= 640 && meta.height <= 640);
    const unmarked = await sharp(image).resize({ width: 600, height: 600, fit: 'inside' }).webp({ quality: 70 }).toBuffer();
    assert.notDeepEqual(preview, unmarked);
    assert.ok(references.every(r => r.sourceImageUrl.includes('/signed/originals/')));
    assert.equal((await request(`/api/photoStudioChats/${chatId}`, { cookie })).status, 200);
  });
  await t.test('guest originals and library writes are blocked; other owners cannot view work', async () => {
    const other = await trial();
    const account = await signup();
    assert.equal((await request(`/api/photoStudioChats/${chatId}`, { cookie: other.cookie })).status, 404);
    assert.equal((await request(`/api/photoStudioChats/${chatId}/messages/${messageId}/download`, { cookie })).data.code, 'AUTHENTICATION_REQUIRED');
    assert.equal((await request(`/api/photoStudioChats/${chatId}/messages/${messageId}/library`, { method: 'POST', cookie })).status, 401);
    assert.equal((await request(`/api/photoStudioChats/${chatId}/messages/${messageId}/download`, { token: account.token })).status, 404);
    const message = await m.PhotoStudioMessage.findByPk(messageId);
    await assert.rejects(originalDownloadUrl(account.user, message.storagePath), { code: 'OWNERSHIP_VIOLATION' });
  });
  await t.test('rejected chat quality attempts refund the single reservation', async () => {
    qaFailures = 2;
    const r = await request(`/api/photoStudioChats/${chatId}/messages`, { method: 'POST', cookie, body: { instruction: 'Improve lighting' } });
    assert.equal(r.status, 502);
    assert.equal((await request('/api/photoStudio/session', { cookie })).data.studio.availableTokens, 4);
    qaFailures = 0;
  });
  await t.test('failed provider work refunds tokens; direct generation and redo share the trial balance', async () => {
    fail = true;
    const failed = await request('/api/photoStudio/generations', { method: 'POST', cookie, body: { sourcePhotoDataUrl } });
    fail = false;
    assert.equal(failed.status, 500);
    assert.equal((await request('/api/photoStudio/session', { cookie })).data.studio.availableTokens, 4);
    const r = await request('/api/photoStudio/generations', { method: 'POST', cookie, body: { sourcePhotoDataUrl } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    generationId = r.data.generation.id;
    assert.equal(r.data.studio.availableTokens, 3);
    assert.equal((await request(`/api/photoStudio/generations/${generationId}/download`, { cookie })).status, 401);
    assert.equal((await request(`/api/photoStudio/generations/${generationId}/redo`, { method: 'POST', cookie })).data.studio.availableTokens, 2);
  });
  await t.test('concurrent reservations cannot overspend the five tokens and exhaustion preserves chats', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => credits.reservePhotoStudioCredit({ guestId: guest.id })));
    const successful = results.filter(r => r.status === 'fulfilled');
    assert.equal(successful.length, 2);
    assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'GUEST_TRIAL_EXHAUSTED'));
    for (const r of successful) await credits.consumePhotoStudioCredit({ guestId: guest.id, operationId: r.value.operationId });
    const status = await request('/api/photoStudio/session', { cookie });
    assert.equal(status.data.studio.availableTokens, 0);
    assert.equal(status.data.studio.trialExhausted, true);
    assert.equal((await request(`/api/photoStudioChats/${chatId}`, { cookie })).status, 200);
    assert.equal((await request(`/api/photoStudioChats/${chatId}/messages`, { method: 'POST', cookie, body: { instruction: 'Warm light' } })).data.code, 'GUEST_TRIAL_EXHAUSTED');
    assert.equal((await request(`/api/photoStudio/generations/${generationId}/redo`, { method: 'POST', cookie })).data.code, 'GUEST_TRIAL_EXHAUSTED');
  });
  let owner;
  await t.test('email signup atomically claims spent trial, chats, images, environment and originals', async () => {
    const env = await request('/api/photoStudio/environment', { method: 'PUT', cookie, body: { environmentPhotoDataUrl: sourcePhotoDataUrl } });
    assert.equal(env.status, 201);
    const r = await request('/api/user/register', { method: 'POST', cookie, body: { email: `guest-${crypto.randomUUID()}@example.com`, password: 'Original123!' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    owner = r.data;
    assert.equal(r.data.guestClaim.status, 'claimed');
    assert.equal(r.data.studio.availableTokens, 25);
    assert.equal(r.data.studio.downloadEligible, true);
    assert.equal((await m.PhotoStudioChat.findByPk(chatId)).userId, r.data.user.id);
    assert.equal((await m.PhotoStudioEnvironment.findByPk(env.data.environment.id)).userId, r.data.user.id);
    assert.equal(await m.PhotoStudioFile.count({ where: { guestId: guest.id } }), 0);
    assert.equal((await request(`/api/photoStudioChats/${chatId}/messages/${messageId}/download`, { token: r.data.token })).status, 200);
    assert.equal((await request(`/api/photoStudio/generations/${generationId}/download`, { token: r.data.token })).status, 200);
    const saved = await request(`/api/photoStudioChats/${chatId}/messages/${messageId}/library`, { method: 'POST', token: r.data.token });
    assert.equal(saved.status, 201, JSON.stringify(saved.data));
    assert.equal((await request(`/api/photoStudio/library/${saved.data.photo.id}/download`, { token: r.data.token })).status, 200);
    assert.equal((await request('/api/photoStudio/session', { method: 'POST', cookie })).data.code, 'GUEST_SESSION_CLAIMED');
  });
  await t.test('repeated and concurrent claims are idempotent and a second account cannot claim', async () => {
    const repeat = await Promise.all(Array.from({ length: 3 }, () => request('/api/photoStudio/session/claim', { method: 'POST', token: owner.token, cookie })));
    assert.ok(repeat.every(r => r.data.guestClaim.status === 'already_claimed'));
    const other = await signup();
    assert.equal((await request('/api/photoStudio/session/claim', { method: 'POST', token: other.token, cookie })).status, 409);
    assert.equal(await m.PhotoStudioCreditBucket.count({ where: { userId: owner.user.id, kind: 'claimed_trial' } }), 1);
    const fresh = await trial();
    const race = await Promise.all([owner, { token: other.token }].map(a => request('/api/photoStudio/session/claim', { method: 'POST', token: a.token, cookie: fresh.cookie })));
    assert.equal(race.filter(r => r.status === 200).length, 1);
    assert.equal(race.filter(r => r.status === 409).length, 1);
  });
  await t.test('password login transfers remaining trial credits separately and preserves existing environment', async () => {
    const fresh = await trial();
    const account = await signup();
    await request('/api/photoStudio/environment', { method: 'PUT', token: account.token, body: { environmentPhotoDataUrl: sourcePhotoDataUrl } });
    await request('/api/photoStudio/environment', { method: 'PUT', cookie: fresh.cookie, body: { environmentPhotoDataUrl: sourcePhotoDataUrl } });
    const reservation = await credits.reservePhotoStudioCredit({ guestId: fresh.guest.id });
    await credits.consumePhotoStudioCredit({ guestId: fresh.guest.id, operationId: reservation.operationId });
    const r = await request('/api/user/login', { method: 'POST', cookie: fresh.cookie, body: { email: account.user.email, password: 'Original123!' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.guestClaim.status, 'claimed');
    assert.equal(r.data.studio.availableTokens, 29);
    assert.equal(r.data.studio.remainingTrialTokens, 4);
    assert.equal(await m.PhotoStudioEnvironment.count({ where: { userId: account.user.id } }), 2);
    const reserved = await credits.reservePhotoStudioCredit({ userId: account.user.id });
    await credits.consumePhotoStudioCredit({ userId: account.user.id, operationId: reserved.operationId });
    assert.equal((await credits.getPhotoStudioCreditSummary({ userId: account.user.id })).permanent, 25);
  });
  await t.test('Google signup and returning Google login both claim trial work without repeating signup grants', async () => {
    process.env.GOOGLE_CLIENT_ID = 'fixture';
    googlePayload = { sub: crypto.randomUUID(), email: `google-${crypto.randomUUID()}@example.com`, email_verified: true };
    const first = await trial();
    const r = await request('/api/user/oauth/google', { method: 'POST', cookie: first.cookie, body: { credential: 'fixture' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.guestClaim.status, 'claimed');
    assert.equal(r.data.studio.availableTokens, 30);
    assert.equal(accountEmails.filter(id => id === r.data.user.id).length, 1);
    const second = await trial();
    const login = await request('/api/user/oauth/google', { method: 'POST', cookie: second.cookie, body: { credential: 'fixture' } });
    assert.equal(login.data.guestClaim.status, 'claimed');
    assert.equal(login.data.user.id, r.data.user.id);
    assert.equal(accountEmails.filter(id => id === r.data.user.id).length, 1);
    assert.equal(await m.PhotoStudioCreditBucket.count({ where: { userId: r.data.user.id, kind: 'signup' } }), 1);
    delete process.env.GOOGLE_CLIENT_ID;
  });
  await t.test('active generation blocks claims and expiry cleanup until provider work finishes', async () => {
    const fresh = await trial();
    const account = await signup();
    let release;
    gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const running = request('/api/photoStudio/generations', { method: 'POST', cookie: fresh.cookie, body: { sourcePhotoDataUrl } });
    try {
      await started;
      assert.equal((await request('/api/photoStudio/session/claim', { method: 'POST', token: account.token, cookie: fresh.cookie })).data.guestClaim.status, 'pending');
      await fresh.guest.update({ expiresAt: new Date(Date.now() - 1000) });
      await cleanupGuestTrials();
      assert.equal((await fresh.guest.reload()).status, 'active');
    } finally { release(); gate = null; entered = null; }
    assert.equal((await running).status, 201);
    assert.equal((await request('/api/photoStudio/session', { cookie: fresh.cookie })).data.code, 'GUEST_SESSION_EXPIRED');
    await cleanupGuestTrials();
    assert.equal((await fresh.guest.reload()).status, 'expired');
    assert.equal(await m.PhotoStudioFile.count({ where: { guestId: fresh.guest.id } }), 0);
  });
  await t.test('cleanup recovers abandoned reservations, retries storage failure and preserves claimed work', async () => {
    const fresh = await trial();
    const created = await request('/api/photoStudioChats', { method: 'POST', cookie: fresh.cookie, body: { sourcePhotoDataUrl } });
    await credits.reservePhotoStudioCredit({ guestId: fresh.guest.id });
    await fresh.guest.update({ lastWorkAt: new Date(Date.now() - 3600000) });
    await cleanupGuestTrials();
    assert.equal((await credits.getPhotoStudioCreditSummary({ guestId: fresh.guest.id })).available, 5);
    await fresh.guest.update({ expiresAt: new Date(Date.now() - 1000) });
    const originalFrom = storage.from;
    storage.from = bucket => ({ ...originalFrom(bucket), async remove() { return { error: new Error('Unavailable') }; } });
    try { await cleanupGuestTrials(); } finally { storage.from = originalFrom; }
    assert.equal((await fresh.guest.reload()).status, 'active');
    await cleanupGuestTrials();
    assert.equal((await fresh.guest.reload()).status, 'expired');
    assert.equal(await m.PhotoStudioChat.findByPk(created.data.chat.id), null);
    assert.equal((await request('/api/photoStudio/session', { method: 'POST', cookie: fresh.cookie })).status, 410);
    assert.equal((await m.GuestSession.findByPk(guest.id)).status, 'claimed');
    assert.equal((await request(`/api/photoStudioChats/${chatId}/messages/${messageId}/download`, { token: owner.token })).status, 200);
  });
});
