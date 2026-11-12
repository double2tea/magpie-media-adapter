import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, onProvider } from './media.middleware.js';

const wav = 'data:audio/wav;base64,YWJj';
const mp3 = 'data:audio/mpeg;base64,YWJj';
const mp4 = 'data:video/mp4;base64,YWJj';
const file = (value = wav, filename = 'clip.wav') => ({ type: 'file', file: { filename, file_data: value } });
function request(part = file(), extra = {}) {
  return { model: 'group/any-name', stream: true, messages: [{ role: 'user', content: [part, { type: 'text', text: 'Analyze' }] }], ...extra };
}
// Magpie's reject does not throw. onProvider deliberately has no rejection authority.
function context({ model = 'group/any-name', protocol = 'chat', options = {}, provider = { id: 'renamed', model: 'qwen3.8-omni-flash' } } = {}) {
  const ctx = { protocol, model, options, provider, rejected: [] };
  ctx.reject = (status, message) => { ctx.rejected.push({ status, message }); };
  return ctx;
}
function first(body) { return body.messages[0].content[0]; }
function applyRequest(body, ctx) {
  const result = onRequest(body, ctx);
  if (ctx.rejected.length) throw new Error('Unexpected request rejection');
  return result ?? body;
}
function applyProvider(body, ctx) { return onProvider(body, ctx) ?? body; }
function reject(part, pattern, extra = {}) {
  const ctx = context();
  assert.equal(onRequest(request(part, extra), ctx), undefined);
  assert.equal(ctx.rejected[0]?.status, 400);
  assert.match(ctx.rejected[0].message, pattern);
}

test('zero configuration adapts any model/group and does not hardcode provider IDs', () => {
  const body = request(file(), { model: 'company/rebranded' });
  const ctx = context({ model: body.model });
  const result = applyProvider(applyRequest(body, ctx), ctx);
  assert.equal(first(result).input_audio.data, wav);
  assert.deepEqual(result.modalities, ['text']);
});
test('Gemini format follows candidate model even when provider is renamed', () => {
  const body = request();
  const ctx = context({ provider: { id: 'my-native', model: 'gemini-3.8-flash' } });
  const result = applyProvider(applyRequest(body, ctx), ctx);
  assert.equal(first(result).file.file_data, wav);
});
test('unknown audio models preserve original format', () => {
  const body = request();
  const ctx = context({ provider: { id: 'unknown', model: 'new-model' } });
  assert.deepEqual(applyProvider(applyRequest(body, ctx), ctx), body);
});
test('selection applies consistently to both hooks, empty selection disables adaptation', () => {
  for (const models of [[], ['group/another']]) {
    const ctx = context({ options: { models } });
    assert.equal(onRequest(request(), ctx), undefined);
    assert.equal(onProvider(request(), ctx), undefined);
  }
});
test('wildcard selection supported explicitly', () => {
  const ctx = context({ options: { models: ['*'] } });
  assert.equal(first(onProvider(request(), ctx)).type, 'input_audio');
});
test('video files normalized before route selection with bytes preserved', () => {
  const body = request(file(mp4, 'clip.mp4'));
  const result = onRequest(body, context());
  assert.deepEqual(first(result), { type: 'video_url', mime_type: 'video/mp4', video_url: { url: mp4 } });
  assert.equal(first(body).type, 'file');
});
test('images and PDFs preserve all metadata', () => {
  for (const part of [{ type: 'image_url', image_url: { url: 'https://example.com/img', detail: 'high' } }, { type: 'file', file: { filename: 'x.pdf', file_data: 'data:application/pdf;base64,YWJj' } }]) {
    const body = request(part);
    assert.deepEqual(applyRequest(body, context()), body);
    assert.deepEqual(applyProvider(body, context()), body);
  }
});
test('video hints survive normalization and repeated provider attempts', () => {
  const body = request({ type: 'video_url', video_url: { url: mp4, fps: 2 } });
  assert.deepEqual(applyProvider(applyRequest(body, context()), context()), body);
});
test('history audio and tool result audio count toward stream requirement', () => {
  const body = request(file(), { stream: false });
  body.messages.push({ role: 'user', content: 'Continue' });
  const ctx = context();
  assert.equal(onRequest(body, ctx), undefined);
  assert.match(ctx.rejected[0].message, /stream=true/);
  reject({ type: 'tool_result', content: [file()] }, /stream=true/, { stream: false });
});
test('nonstream group audio rejects at onRequest with real reject semantics', () => {
  reject(file(), /stream=true/, { stream: false });
});
test('direct Xiaomi nonstream audio is accepted without changing thinking', () => {
  const model = 'custom/mimo-v2.6-flash';
  const body = request(file(), { model, stream: false, thinking: { type: 'enabled' } });
  const ctx = context({ model, provider: { id: 'custom', model: 'mimo-v2.6-flash' } });
  const result = applyProvider(applyRequest(body, ctx), ctx);
  assert.equal(first(result).input_audio.data, wav);
  assert.deepEqual(result.thinking, body.thinking);
  assert.deepEqual(ctx.rejected, []);
});
test('direct Qwen nonstream audio rejects based on model rather than vendor ID', () => {
  const model = 'different/qwen3.8-omni-flash';
  const ctx = context({ model });
  onRequest(request(file(), { model, stream: false }), ctx);
  assert.equal(ctx.rejected[0]?.status, 400);
});
test('explicit nonstream pass supports tested custom group', () => {
  const ctx = context({ options: { nonStreamingAudio: 'pass' } });
  assert.ok(applyRequest(request(file(), { stream: false }), ctx));
  assert.deepEqual(ctx.rejected, []);
});
test('direct Gemini nonstream audio remains available', () => {
  const model = 'native/gemini-3.8-flash';
  const ctx = context({ model, provider: { id: 'native', model: 'gemini-3.8-flash' } });
  assert.ok(applyRequest(request(file(), { model, stream: false }), ctx));
  assert.deepEqual(ctx.rejected, []);
});
test('Responses audio rejects but its video is preserved for gateway support', () => {
  for (const [value, filename, rejected] of [[wav, 'a.wav', true], [mp4, 'a.mp4', false]]) {
    const ctx = context({ protocol: 'responses' });
    const body = { model: ctx.model, input: [{ role: 'user', content: [{ type: 'input_file', filename, file_data: value }] }] };
    const result = onRequest(body, ctx);
    assert.equal(ctx.rejected.length > 0, rejected);
    if (!rejected) assert.deepEqual(result ?? body, body);
  }
});
test('Anthropic nested audio rejects, video and PDF documents are preserved', () => {
  for (const type of ['audio/wav', 'video/mp4', 'application/pdf']) {
    const body = request({ type: 'tool_result', content: [{ type: 'document', source: { type: 'base64', media_type: type, data: 'YWJj' } }] });
    const ctx = context({ protocol: 'anthropic' });
    const result = onRequest(body, ctx);
    assert.equal(ctx.rejected.length > 0, type === 'audio/wav');
    if (type !== 'audio/wav') assert.deepEqual(result ?? body, body);
    assert.equal(onProvider(body, ctx), undefined);
  }
});
test('native Gemini protocol is untouched', () => {
  const body = { contents: [{ parts: [{ inlineData: { mimeType: 'audio/wav', data: 'YWJj' } }] }] };
  const ctx = context({ protocol: 'gemini' });
  assert.equal(onRequest(body, ctx), undefined);
  assert.equal(onProvider(body, ctx), undefined);
});
test('missing or contradictory media is explicitly rejected rather than hook failure', () => {
  reject({ type: 'input_audio', input_audio: { data: mp4, format: 'wav' } }, /non-audio/);
  reject({ type: 'input_audio', input_audio: { data: wav, format: 'mp3' } }, /conflicts/);
  reject({ type: 'file', mime_type: 'video/mp4', file: { file_data: wav } }, /disagree/);
  reject({ type: 'input_audio', input_audio: { format: 'wav' } }, /no data/);
  reject(file('data:audio/wav,percent%20encoded'), /Base64 data URI/);
  reject(file('/Users/me/audio.wav'), /Base64 media bytes/);
});
test('audio MIME aliases and bare Base64 retain correct format', () => {
  const ctx = context();
  for (const [part, format, expected] of [
    [file(mp3, 'clip.bin'), 'mp3', mp3],
    [file('data:audio/x-wav;base64,YWJj'), 'wav', 'data:audio/x-wav;base64,YWJj'],
    [{ type: 'input_audio', input_audio: { data: 'YWJj', format: 'wav' } }, 'wav', wav],
    [file('YWJj', 'clip.flac'), 'flac', 'data:audio/flac;base64,YWJj'],
  ]) {
    const result = first(applyProvider(applyRequest(request(part), ctx), ctx));
    assert.equal(result.input_audio.format, format);
    assert.equal(result.input_audio.data, expected);
  }
});
test('opaque file IDs are not interpreted as missing bytes', () => {
  const body = request({ type: 'file', file: { file_id: 'opaque', filename: 'clip.wav' } });
  assert.deepEqual(applyRequest(body, context()), body);
});
test('URL attachments remain URLs when converted to Gemini file', () => {
  const model = 'native/gemini-3.8-flash';
  const ctx = context({ model, provider: { id: 'renamed', model: 'gemini-3.8-flash' } });
  const body = request({ type: 'input_audio', input_audio: { format: 'wav', data: 'https://example.com/clip.wav' } }, { model });
  const result = first(applyProvider(applyRequest(body, ctx), ctx));
  assert.equal(result.file.file_url, 'https://example.com/clip.wav');
  assert.equal(result.file.file_data, undefined);
});
test('Qwen then Gemini then Xiaomi attempts independently preserve the original bytes', () => {
  const body = request(file());
  const initial = JSON.stringify(body);
  const prepared = applyRequest(body, context());
  for (const model of ['qwen3.8-omni-flash', 'gemini-3.8-flash', 'mimo-v2.6-flash']) {
    const ctx = context({ provider: { id: 'vendor-alias', model } });
    const part = first(onProvider(prepared, ctx));
    assert.equal(part.input_audio?.data || part.file?.file_data, wav);
  }
  assert.equal(JSON.stringify(body), initial);
  assert.deepEqual(prepared, body);
});
test('explicit modalities and reasoning options are preserved', () => {
  const body = request(file(), { modalities: ['text', 'audio'], reasoning_effort: 'high', thinking: { type: 'enabled' } });
  const result = onProvider(body, context());
  assert.deepEqual(result.modalities, body.modalities);
  assert.deepEqual(result.thinking, body.thinking);
  assert.equal(result.reasoning_effort, 'high');
});
test('OpenAI audio model profile emits bare bytes, not a data URI', () => {
  const ctx = context({ provider: { id: 'openai-alias', model: 'gpt-audio' } });
  assert.equal(first(onProvider(request(file()), ctx)).input_audio.data, 'YWJj');
});
test('custom profiles support aliases without changing source', () => {
  const ctx = context({ provider: { id: 'relay', model: 'private-alias' }, options: { providers: { relay: { audio: 'file', video: 'file' } } } });
  assert.equal(first(onProvider(request(), ctx)).file.file_data, wav);
  assert.equal(first(onProvider(request(file(mp4, 'clip.mp4')), ctx)).file.file_data, mp4);
});
test('disabled provider skips all adaptation on that attempt', () => {
  const ctx = context({ options: { providers: { renamed: { disabled: true } } } });
  assert.equal(onProvider(request(), ctx), undefined);
});
test('invalid config rejects at the request boundary with non-throwing ctx.reject', () => {
  for (const options of [{ models: 'bad' }, { providers: [] }, { nonStreamingAudio: 'maybe' }, { providers: { relay: { audio: 'video_url' } } }]) {
    const ctx = context({ options });
    assert.equal(onRequest(request(), ctx), undefined);
    assert.equal(ctx.rejected[0]?.status, 400);
  }
});
test('history text and tools are preserved, no media response options added', () => {
  const body = request({ type: 'text', text: 'hello' }, { tools: [{ type: 'function', function: { name: 'run' } }] });
  assert.deepEqual(applyProvider(applyRequest(body, context()), context()), body);
});
test('remote video without suffix keeps URL and sampling hints', () => {
  const body = request({ type: 'video_url', video_url: { url: 'https://example.com/download?id=123', fps: 1 } });
  assert.deepEqual(applyRequest(body, context()), body);
});
test('remote audio rejects before an unknown/group or data-URI-only route', () => {
  const part = { type: 'file', file: { filename: 'a.wav', file_url: 'https://example.com/a.wav' } };
  for (const model of ['group/any-name', 'ali/qwen3.8-omni-flash', 'my-provider/alias']) {
    const ctx = context({ model });
    onRequest(request(part, { model }), ctx);
    assert.equal(ctx.rejected[0]?.status, 400);
    assert.match(ctx.rejected[0].message, /inline Base64/);
  }
});
test('nonstream hidden aliases cannot evade request-side audio checks', () => {
  const model = 'my-provider/friendly-alias';
  const ctx = context({ model, provider: { id: 'my-provider', model: 'qwen3.8-omni-flash' } });
  onRequest(request(file(), { model, stream: false }), ctx);
  assert.equal(ctx.rejected[0]?.status, 400);
});
test('WebM MIME survives generic file normalization then file encoding', () => {
  const ctx = context({ options: { providers: { renamed: { video: 'file' } } } });
  const body = request({ type: 'file', mime_type: 'video/webm', file: { filename: 'unknown', file_data: 'https://example.com/download?id=17' } });
  const prepared = onRequest(body, ctx);
  assert.equal(first(prepared).mime_type, 'video/webm');
  const output = first(onProvider(prepared, ctx));
  assert.equal(output.file.filename, 'video.webm');
  assert.equal(output.file.file_url, 'https://example.com/download?id=17');
});
test('configured file conversion cannot silently discard video sampling options', () => {
  const ctx = context({ options: { providers: { renamed: { video: 'file' } } } });
  const body = request({ type: 'video_url', video_url: { url: mp4, fps: 2, detail: 'high' } });
  assert.equal(onRequest(body, ctx), undefined);
  assert.match(ctx.rejected[0].message, /fps\/detail/);
});
test('text-only long histories return no replacement body', () => {
  const body = { model: 'ordinary/model', stream: true, messages: Array.from({length: 4000}, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: [{ type: 'text', text: 'unchanged' }] })) };
  const ctx = context({model: body.model});
  assert.equal(onRequest(body, ctx), undefined);
  assert.equal(onProvider(body, ctx), undefined);
});
test('sparse media changes copy only affected branches', () => {
  const untouched = { role: 'assistant', content: [{ type: 'text', text: 'keep' }] };
  const toolText = { type: 'tool_result', content: [{type:'text',text:'unchanged tool'}] };
  const toolVideo = { type: 'tool_result', content: [file(mp4, 'clip.mp4')] };
  const body = request(file()); body.messages = [untouched, {role:'user', content:[toolText, toolVideo]}];
  const result = onRequest(body, context());
  assert.equal(result.messages[0], untouched);
  assert.equal(result.messages[1].content[0], toolText);
  assert.notEqual(result.messages[1].content[1], toolVideo);
  assert.equal(toolVideo.content[0].type, 'file');
  assert.equal(result.messages[1].content[1].content[0].type, 'video_url');
});
