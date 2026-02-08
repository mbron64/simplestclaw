<p align="center">
  <img src="apps/web/public/red_claw.png" width="80" alt="SimplestClaw Logo" />
</p>

<h1 align="center">simplestclaw</h1>

<p align="center">
  <strong>The simplest way to run OpenClaw. One click. No Telegram required.</strong>
</p>

<p align="center">
  <a href="https://simplestclaw.com">Website</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="https://github.com/mbron64/simplestclaw/releases">Downloads</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/mbron64/simplestclaw/actions/workflows/ci.yml"><img src="https://github.com/mbron64/simplestclaw/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mbron64/simplestclaw/releases"><img src="https://img.shields.io/github/v/release/mbron64/simplestclaw" alt="Release" /></a>
</p>

---

## What is SimplestClaw?

SimplestClaw makes it dead simple to get [OpenClaw](https://github.com/openclawai/openclaw) running — either on your own machine or in the cloud. No complex setup, no Telegram bots, just click and go.

- ✅ **One-click setup** for both local and cloud deployments
- ✅ **Desktop app** that bundles everything you need (macOS)
- ✅ **Cloud deploy** to Railway in under 60 seconds
- ✅ **100% open source** (MIT license)

---

## Quick Start

### Option 1: Desktop App (Free)

Download and run locally — your data stays on your machine.

**[⬇️ Download for macOS](https://github.com/mbron64/simplestclaw/releases/latest)**

> Windows & Linux coming soon

### Option 2: Cloud (Railway)

Deploy to the cloud in 60 seconds. Pick your AI provider:

| Provider | |
|----------|---|
| **Anthropic** (Claude) | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-anthropic) |
| **OpenAI** (GPT-4) | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-openai) |
| **Google** (Gemini) | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-gemini) |
| **OpenRouter** | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-openrouter) |

<details>
<summary><strong>What you'll need</strong></summary>

- Railway Hobby plan ($5/month) — free trial has memory limits
- API key from your chosen provider

</details>

---

## Why SimplestClaw?

| | SimplestClaw | Other Options |
|---|---|---|
| Setup | One click | Terminal + config files |
| Telegram | Not required | Often required |
| Desktop | Native app | Browser-only |
| Open source | Yes (MIT) | Varies |
| Cost | Free local / $5 cloud | Varies |

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
│   ├── web/        # Marketing website
│   ├── gateway/    # Railway-deployable gateway
│   └── desktop/    # Tauri desktop app
├── packages/
│   ├── ui/         # Shared components
│   └── openclaw-client/
└── package.json
```

</details>

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

- 🐛 [Report a bug](https://github.com/mbron64/simplestclaw/issues/new?template=bug_report.md)
- 💡 [Request a feature](https://github.com/mbron64/simplestclaw/issues/new?template=feature_request.md)

---

## License

MIT © [SimplestClaw](LICENSE)
