# Upstream and third-party provenance

This repository is a derivative distribution of
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent),
licensed under the MIT License. The upstream license is preserved in
`LICENSE`; upstream authorship remains credited in source and documentation.

The added `hermes-local` launcher and Local Deck dashboard are new glue and UI
code. Their workflow was informed by public behavior and documentation from:

- [Hermes Studio](https://github.com/JPeetz/Hermes-Studio) — portable and
  enhanced modes for OpenAI-compatible local endpoints.
- [Hermes Agent WebUI](https://github.com/zuziceng/hermes-agent-webui) —
  source/runtime auto-discovery and lightweight browser entry points.
- [Open WebUI](https://github.com/open-webui/open-webui) — local-first model
  discovery and OpenAI-compatible provider conventions.

Hermes Garden vendors animated SVG pets from
[abderrahimghazali/clawd-pet](https://github.com/abderrahimghazali/clawd-pet)
at commit `b208f0c04a4084a17f4e5f5adf5198a752be0b36`. The pet project and its
assets are MIT licensed; its license is preserved beside the vendored assets
at `plugins/local-control/dashboard/dist/assets/clawd-pets/LICENSE`. The
draggable state-and-speech interaction model was informed by
[gibbon/agent-pet](https://github.com/gibbon/agent-pet), which is Apache-2.0;
no agent-pet source is vendored.

No source file from Hermes Studio, Hermes Agent WebUI, Open WebUI, or
agent-pet is vendored by these additions. Hermes' provider configuration,
atomic YAML writer, plugin SDK, dashboard, agent runtime, and tests remain the
implementation authority. This keeps upstream updates practical and avoids
parallel incompatible subsystems.
