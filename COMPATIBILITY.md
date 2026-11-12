# Client and workload checks

Checked on 2026-11-12. These are bounded checks, not a universal compatibility claim.

## Real client capture

Installed clients were run against a loopback-only mock model service with a synthetic credential, temporary configuration and one generated image/audio fixture. No provider inference was performed. The capture retained only API paths, part types, byte counts and media hashes; it did not publish prompts, credentials or user configuration.

| Client | Input | Observed request | Result |
| --- | --- | --- | --- |
| Codex | CLI image attachment | Responses `input_image` | Original image hash preserved; mock response completed |
| Grok | Headless ACP image block | Chat `image_url` | Original image hash preserved; mock response completed |
| OpenCode | CLI image attachment | Chat `image_url` | Original image hash preserved; mock response completed |
| Grok | Headless audio block | No model request | Client rejected audio content before the gateway |
| OpenCode | CLI WAV attachment | Text-only request after file-read failure | No audio bytes reached the model service; not an audio compatibility pass |

A middleware cannot restore media that a client never sent. These captures validate the observed request shapes, not successful speech understanding by a real model. Claude and Qoder were not exercised end-to-end in this round. Their API-family behavior remains covered by synthetic protocol tests only.

## Native gateway pressure checks

Requests targeted a nonexistent synthetic group, so even fail-open could not invoke a paid provider. Non-stream audio rejection and malformed Base64 rejection were tested at approximately 0.1, 1, 6, 12 and 24 MiB, plus a 400-turn text history. All cases returned the adapter's explicit 400, not a silent pass-through. The 24 MiB case took about one second end-to-end on the tested machine.

These tests cover ingress validation/rejection, not streaming generation throughput, sustained concurrency or a hook-time upper bound. An end-to-end request duration includes transport and JSON parsing; it is not the hook's execution time. CLI telemetry creates its own middleware runtime and returned zero counters, so it was not used as evidence for the production gateway's hook-failure count.

## No-change fast path (0.2.1)

The previous implementation copied message arrays even for ordinary text. Version 0.2.1 retains unchanged arrays and objects, and returns `undefined` when a hook has no edit. This lets Magpie retain the original serialized body. Changed media branches still receive independent copies for each provider attempt.

A local Node microbenchmark over 4,000 text turns measured roughly 0.14 ms/request hook and 0.11 ms/provider hook after the change. These are JavaScript-only measurements, not production gateway throughput. Regression tests assert identity preservation and sparse nested-tool edits, so this optimization cannot silently mutate the original fallback body.

## Upstream boundary

Issue [yetone/magpie#6210](https://github.com/yetone/magpie/issues/6210) remained open without a maintainer reply at the time of this check. Capability metadata and cross-protocol audio conversion are still upstream concerns. No new UI, catalog-cache patch, protocol guess or duplicate issue was added in this iteration.
