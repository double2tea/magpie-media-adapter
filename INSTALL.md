# Installation

## Requirements

- Magpie with native gateway middleware support (`magpie.middleware`, `onRequest` and `onProvider`). Live checks used 0.1.3820 and 0.1.3830 on macOS arm64; no earlier minimum or other OS is certified.
- Your media-capable providers/models already configured in Magpie.
- Git for a source checkout. Node.js 22+ is only needed to run the development checks.

This plugin requires no MCP setup, additional API key, FFmpeg, Python, server or model download.

## GitHub installation

```sh
magpie plugin add github:double2tea/magpie-media-adapter
magpie plugin list
```

Continue selecting your existing model or group. Check that the plugin lists the `onRequest` and `onProvider` gateway middleware hooks.

## Local checkout

```sh
mkdir -p "$HOME/.config/magpie/local-plugins"
git clone https://github.com/double2tea/magpie-media-adapter.git "$HOME/.config/magpie/local-plugins/media-adapter"
magpie plugin add "$HOME/.config/magpie/local-plugins/media-adapter"
```

For a manually downloaded release archive, extract it into a stable directory and pass that directory to `magpie plugin add`. Magpie reads the middleware from the registered location; keep the files there. A local configuration directory also avoids cloud-synced source paths.

Install one copy. If you already registered a local checkout, retain it or remove its registration before switching to GitHub installation.

## Options

The default installation has no options. For a private alias, set the exact installed spec shown by `magpie plugin list`:

```sh
magpie plugin options github:double2tea/magpie-media-adapter '{"providers":{"my-relay":{"audio":"file"}}}'
```

See the README for all options. Reset options with the supported CLI command:

```sh
magpie plugin options github:double2tea/magpie-media-adapter off
```

## Update

For a local checkout, update the checkout in place after reviewing the changes. For a GitHub installation, use Magpie's plugin management UI to update the selected plugin. The CLI `magpie plugin update` updates every installed community plugin, so use it only when you intend that broader update.

No gateway restart is normally needed: Magpie hot-reloads changed middleware. Re-run a controlled audio/video example when updating.

## Disable or remove

Use the exact registered spec, which may be a GitHub spec or a local path:

```sh
magpie plugin off github:double2tea/magpie-media-adapter
magpie plugin on github:double2tea/magpie-media-adapter
magpie plugin rm github:double2tea/magpie-media-adapter
```

Disabling restores Magpie's original media behavior. It does not remove your providers, groups or credentials.
