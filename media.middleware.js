// Magpie supplies the original client body to each provider attempt. Never mutate it.
const MIME_BY_FORMAT = {
  wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg',
  opus: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
};
const MIME_ALIASES = { 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/mp3': 'audio/mpeg' };
const FORMATS = { 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };

class MediaError extends Error {}

function options(ctx) {
  const value = ctx.options || {};
  if (value.models !== undefined && (!Array.isArray(value.models) || value.models.some(model => typeof model !== 'string'))) {
    throw new MediaError('options.models must be an array of model IDs');
  }
  if (value.nonStreamingAudio !== undefined && !['auto', 'pass', 'reject'].includes(value.nonStreamingAudio)) {
    throw new MediaError('nonStreamingAudio must be auto, pass or reject');
  }
  if (value.providers !== undefined && (!value.providers || typeof value.providers !== 'object' || Array.isArray(value.providers))) {
    throw new MediaError('options.providers must be an object');
  }
  for (const rule of Object.values(value.providers || {})) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new MediaError('Provider profile must be an object');
    if (rule.audio !== undefined && !['data-uri', 'base64', 'file', 'preserve'].includes(rule.audio)) throw new MediaError('Invalid provider audio format');
    if (rule.video !== undefined && !['video_url', 'file', 'preserve'].includes(rule.video)) throw new MediaError('Invalid provider video format');
    for (const key of ['streamingRequired', 'textOnly', 'disabled']) {
      if (rule[key] !== undefined && typeof rule[key] !== 'boolean') throw new MediaError(key + ' must be a boolean');
    }
  }
  return value;
}

function selected(body, ctx, config) {
  return config.models === undefined || config.models.includes('*') || config.models.includes(ctx.model || body.model);
}

function canonicalMime(value) {
  const type = (value || '').split(';')[0].trim().toLowerCase();
  return MIME_ALIASES[type] || type;
}

// Only recognized media parts enter validation. Text, images, PDFs and opaque IDs survive untouched.
function readMedia(part) {
  if (!part || typeof part !== 'object') return null;
  if (!['file', 'input_file', 'document', 'input_audio', 'video_url', 'audio_url'].includes(part.type)) return null;
  const file = part.file || part;
  const source = part.source || {};
  const value = part.input_audio?.data ?? part.video_url?.url ?? part.audio_url?.url ?? file.file_data ?? file.data ?? file.file_url ?? source.data ?? source.url;
  const format = part.input_audio?.format?.toLowerCase();
  const explicit = canonicalMime(source.media_type || part.mime_type || part.mediaType || file.mime_type);
  const filename = file.filename || part.name || '';
  const extension = filename.split('.').pop().toLowerCase();
  const header = typeof value === 'string' ? /^data:([^;,]+)(;base64)?,/i.exec(value) : null;
  const embedded = canonicalMime(header?.[1]);
  const remote = typeof value === 'string' && /^https?:\/\//i.test(value);
  const urlExtension = remote ? value.split(/[?#]/)[0].split('.').pop().toLowerCase() : '';
  const type = embedded || explicit || MIME_BY_FORMAT[extension] || MIME_BY_FORMAT[format] || MIME_BY_FORMAT[urlExtension] || (remote && part.type === 'video_url' ? 'video/mp4' : '');
  const kind = type.startsWith('audio/') ? 'audio' : type.startsWith('video/') ? 'video' : '';
  if (!kind && !['input_audio', 'audio_url', 'video_url'].includes(part.type)) return null;
  if (file.file_id && value === undefined) return null;
  if (!kind) throw new MediaError('Audio/video requires a MIME type or a recognized format/filename');
  if (embedded && explicit && embedded !== explicit) throw new MediaError('Media MIME declarations disagree');
  if (part.type === 'input_audio' && kind !== 'audio') throw new MediaError('input_audio contains non-audio media');
  if (part.type === 'video_url' && kind !== 'video') throw new MediaError('video_url contains non-video media');
  if (format && MIME_BY_FORMAT[format] && canonicalMime(MIME_BY_FORMAT[format]) !== type) throw new MediaError('Audio format conflicts with its MIME');
  if (typeof value !== 'string' || !value) throw new MediaError('Media attachment has no data');
  if (!remote) {
    if (value.startsWith('data:') && (!header || !header[2])) throw new MediaError('Inline media must use a Base64 data URI');
    const bytes = header ? value.slice(header[0].length) : value;
    // Reject paths and malformed encodings without decoding or allocating another media buffer.
    if (!bytes || !/^[A-Za-z0-9+/]*={0,2}$/.test(bytes) || bytes.length % 4 === 1) throw new MediaError('Expected Base64 media bytes, not a local path or malformed encoding');
  }
  return { kind, mime: type, format: format || FORMATS[type] || type.split('/')[1], value, remote,
    payload: header ? value.slice(header[0].length) : value,
    uri: remote || header ? value : 'data:' + type + ';base64,' + value };
}

function mapContent(content, visit) {
  if (!Array.isArray(content)) return content;
  return content.map(part => {
    if (part?.type === 'tool_result' && Array.isArray(part.content)) return { ...part, content: mapContent(part.content, visit) };
    return visit(part);
  });
}

function mapTurns(turns, visit) {
  if (!Array.isArray(turns)) return turns;
  return turns.map(turn => {
    if (!turn || typeof turn !== 'object') return turn;
    return { ...turn, content: mapContent(turn.content, visit) };
  });
}

function modelProfile(model, override = {}) {
  const name = (model || '').toLowerCase();
  let profile = { audio: 'preserve', video: 'video_url', streamingRequired: null, textOnly: false };
  if (/gemini-/.test(name)) profile = { ...profile, audio: 'file', streamingRequired: false };
  else if (/qwen.*omni/.test(name)) profile = { ...profile, audio: 'data-uri', streamingRequired: true, textOnly: true };
  else if (/mimo-/.test(name)) profile = { ...profile, audio: 'data-uri', streamingRequired: false };
  else if (/gpt.*audio/.test(name)) profile = { ...profile, audio: 'base64', streamingRequired: false };
  return { ...profile, ...override };
}

function encode(part, media, profile) {
  const mapping = media.kind === 'audio' ? profile.audio : profile.video;
  if (mapping === 'preserve') return part;
  if (mapping === 'file') {
    const file = { filename: media.kind + '.' + media.format };
    if (media.remote) file.file_url = media.value;
    else file.file_data = media.uri;
    return { type: 'file', file };
  }
  if (media.kind === 'video') {
    // Retain fps/detail hints on an already-correct video part.
    if (part.type === 'video_url') return { ...part, video_url: { ...part.video_url, url: media.uri } };
    return { type: 'video_url', mime_type: media.mime, video_url: { url: media.uri } };
  }
  if (mapping === 'base64' && media.remote) return part; // Resolving URLs belongs to the provider, not this synchronous hook.
  return { type: 'input_audio', input_audio: { data: mapping === 'base64' ? media.payload : media.uri, format: media.format } };
}

export function onRequest(body, ctx) {
  try {
    const config = options(ctx);
    if (!selected(body, ctx, config)) return;
    const protocol = ctx.protocol;
    if (!['chat', 'responses', 'anthropic'].includes(protocol)) return;
    const key = protocol === 'responses' ? 'input' : 'messages';
    const id = ctx.model || body.model || '';
    const requestedProfile = modelProfile(id, config.providers?.[id.split('/')[0]]);
    const videoFileOverride = Object.values(config.providers || {}).some(rule => rule.video === 'file');
    let hasAudio = false;
    const messages = mapTurns(body[key], part => {
      const media = readMedia(part);
      if (!media) return part;
      if (media.kind === 'audio') hasAudio = true;
      if (protocol !== 'chat') {
        if (media.kind === 'audio') throw new MediaError('This gateway cannot reliably translate audio documents on Responses/Messages; use a supported Chat audio request');
        return part; // Upstream has video support on these protocols; do not reject it.
      }
      if (media.kind === 'audio' && media.remote && requestedProfile.audio !== 'file') {
        throw new MediaError('This audio route needs inline Base64 bytes; remote URLs cannot be resolved by a synchronous middleware');
      }
      if (media.kind === 'video' && videoFileOverride && (part.video_url?.fps !== undefined || part.video_url?.detail !== undefined)) {
        throw new MediaError('Configured video file conversion cannot retain fps/detail; use video_url or preserve for that provider');
      }
      return media.kind === 'video' ? encode(part, media, { video: 'video_url' }) : part;
    });
    if (hasAudio && body.stream !== true) {
      const policy = config.nonStreamingAudio || 'auto';
      // Actual group candidates and hidden model aliases are not available yet.
      const needsStreaming = id.startsWith('group/') || requestedProfile.streamingRequired !== false;
      if (policy === 'reject' || (policy === 'auto' && needsStreaming)) throw new MediaError('Audio on this route requires stream=true; non-streaming candidate translation cannot be guaranteed');
    }
    return { ...body, [key]: messages };
  } catch (error) {
    if (!(error instanceof MediaError)) throw error;
    ctx.reject(400, 'Magpie Media Adapter: ' + error.message);
    return;
  }
}

export function onProvider(body, ctx) {
  const config = options(ctx);
  if (!selected(body, ctx, config) || ctx.protocol !== 'chat') return;
  const override = config.providers?.[ctx.provider?.id];
  if (override?.disabled) return;
  const profile = modelProfile(ctx.provider?.model || body.model, override);
  let hasAudio = false;
  const messages = mapTurns(body.messages, part => {
    const media = readMedia(part);
    if (!media) return part;
    hasAudio ||= media.kind === 'audio';
    return encode(part, media, profile);
  });
  // onProvider cannot reject. All intentional validation/rejection happens in onRequest.
  const result = { ...body, messages };
  if (hasAudio && profile.textOnly && body.modalities === undefined) result.modalities = ['text'];
  return result;
}
