<p align="center">
  <img src="apps/web/public/logo.png" width="120" alt="SimplestClaw Logo" />
</p>

<h1 align="center">simplestclaw</h1>

<p align="center">
  <strong>The simplest way to run OpenClaw. Desktop app for macOS, Windows, and Linux.</strong>
</p>

<p align="center">
  <a href="https://simplestclaw.com">Website</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="https://github.com/mbron64/simplestclaw/releases">Downloads</a> &bull;
  <a href="https://simplestclaw.com/pricing">Pricing</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/mbron64/simplestclaw/actions/workflows/ci.yml"><img src="https://github.com/mbron64/simplestclaw/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mbron64/simplestclaw/releases"><img src="https://img.shields.io/github/v/release/mbron64/simplestclaw" alt="Release" /></a>
</p>

---

## What is SimplestClaw?

SimplestClaw makes it dead simple to get [OpenClaw](https://github.com/openclawai/openclaw) running. Download the desktop app, sign up, and start coding with AI — no terminal, no config files.

- **Desktop app** for macOS, Windows, and Linux
- **Managed API keys** — sign up and use top AI models instantly (no provider accounts needed)
- **Bring your own key** — use your own Anthropic, OpenAI, Google, or OpenRouter API key
- **Cloud deploy** — self-host on Railway with your own API key
- **100% open source** (MIT license)

---

## Quick Start

### Option 1: Desktop App (Recommended)

Download the app, sign up, and start chatting with AI models.

**[Download for macOS, Windows & Linux](https://github.com/mbron64/simplestclaw/releases/latest)**

Two ways to use it:

| Mode | How it works |
|------|-------------|
| **Managed** (recommended) | Sign up at [simplestclaw.com](https://simplestclaw.com) and get instant access to Claude, GPT, and Gemini models. No API keys needed. |
| **Bring your own key** | Enter your own API key from Anthropic, OpenAI, Google, or OpenRouter. Requests go directly to the provider. |

### Option 2: Cloud (Railway)

Self-host on Railway with your own API key:

| Provider | |
|----------|---|
| **Anthropic** (Claude) | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-anthropic) |
| **OpenAI** (GPT) | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-openai) |
| **Google** (Gemini) | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-gemini) |
| **OpenRouter** | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-openrouter) |

> Note: Cloud deployments run in a sandboxed environment with no knowledge of your local files, tools, or computer.

<details>
<summary><strong>What you'll need</strong></summary>

- Railway Hobby plan ($5/month) — free trial has memory limits
- API key from your chosen provider

</details>

---

## Pricing (Managed Mode)

Use top AI models without managing your own API keys. Manage your subscription at [simplestclaw.com/settings](https://simplestclaw.com/settings).

| | Free | Pro | Ultra |
|---|---|---|---|
| **Price** | $0 | $20/month | $150/month |
| **Messages/day** | 10 | 200 | 2,000 |
| **Models** | Claude Sonnet 4.5, GPT-5 Mini | 5 models | All 7 models including Claude Opus 4.5 and GPT-5.2 |

See full details at [simplestclaw.com/pricing](https://simplestclaw.com/pricing).

> Bring your own key is always free — you pay your provider directly.

---

## Why SimplestClaw?

| | SimplestClaw | Other Options |
|---|---|---|
| Setup | One click | Terminal + config files |
| Telegram | Not required | Often required |
| Desktop | macOS, Windows, Linux | Browser-only |
| Open source | Yes (MIT) | Varies |
| Cost | Free tier / BYO key / Pro plans | Varies |

---

## Development

```bash
git clone https://github.com/mbron64/simplestclaw.git
cd simplestclaw
pnpm install
pnpm dev
```

<details>
<summary><strong>Project structure</strong></summary>

```
simplestclaw/
├── apps/
│   ├── web/        # Marketing website (Next.js)
│   ├── desktop/    # Desktop app (Tauri + React)
│   ├── proxy/      # API proxy & billing service (Hono)
│   └── gateway/    # Railway-deployable gateway
├── packages/
│   ├── models/     # Shared model definitions & plan limits
│   ├── ui/         # Shared components
│   └── openclaw-client/
└── package.json
```

</details>

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

- [Report a bug](https://github.com/mbron64/simplestclaw/issues/new?template=bug_report.md)
- [Request a feature](https://github.com/mbron64/simplestclaw/issues/new?template=feature_request.md)

---

## License

MIT &copy; [SimplestClaw](LICENSE)
