# v0.2.1 — Preserve unchanged requests

- Keep original request bodies when no media conversion is needed, allowing Magpie to avoid unnecessary serialization.
- Copy only edited media branches, including nested tool results, without mutating input shared by fallback attempts.
- Document real Codex, Grok and OpenCode image-request captures and their observed audio-input limitations.
- Document native gateway rejection-path tests up to 24 MiB and with 400 history turns.

Validation: 35 regression tests pass; independent review found no defect in the optimization. Real direct/group media checks ran on two Macs. Model semantics remain imperfect: one video answer invented an extra color, and one MiMo response omitted the requested full transcript. These are recorded rather than counted as complete semantic passes.

Model profiles, routing priorities, reasoning settings and existing protocol boundaries remain unchanged. This is not a fix for upstream capability-catalog filtering or Responses/Anthropic audio-document conversion. Pressure checks do not certify sustained concurrency or arbitrary attachment sizes.

License: Apache-2.0.
