# v0.2.0 — Magpie Media Adapter

First public release of a standalone Magpie gateway middleware for audio/video attachment compatibility.

- Keep using existing models and routing groups; no MCP tool or additional service is required.
- Normalize Chat video files and encode audio for each actual candidate model.
- Recognize common Qwen Omni, Gemini, MiMo and GPT Audio formats; support private aliases with optional profiles.
- Preserve media bytes, explicit output settings, reasoning options and supported video metadata.
- Reject known unsupported audio paths with actionable errors.

Validation: 33 local regression tests pass, including the reviewed edge cases. Direct/grouped media requests were exercised on two macOS Magpie gateways. Model output can still omit or mis-extract information even when media is delivered correctly. The repository CI covers Node.js 22, 24 and 26. Hosted results are checked before release publication.

Known boundaries: Responses/Anthropic audio-document conversion, uncertain non-streaming audio routes, synchronous remote-audio handling, gateway hook time limits and upstream capability-catalog filtering. See the README before using a new provider profile.

License: Apache-2.0. Independent community plugin; no vendor endorsement is implied.
