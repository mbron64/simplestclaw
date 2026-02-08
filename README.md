# simplestclaw

The simplest way to set up and use OpenClaw. One click. No Telegram required.

**🌐 [simplestclaw.com](https://simplestclaw.com)**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/mbron64/simplestclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/mbron64/simplestclaw/actions/workflows/ci.yml)

## What is this?

simplestclaw makes it dead simple to get OpenClaw running - either on your own machine or in the cloud. No complex setup, no Telegram bots, just click and go.

**Two ways to use it:**

1. **Local (Free)** - Download our desktop app, it bundles OpenClaw and runs on your machine
2. **Hosted (~$5/mo)** - Click "Deploy on Railway" and get a cloud instance in 60 seconds

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-anthropic)

## Features

- One-click setup for both local and hosted deployments
- Built-in chat UI with streaming responses
- Tool call visualization (see what OpenClaw is doing)
- Dashboard for managing your instance
- 100% open source (MIT license)

## Quick Start

### Option 1: Local (Desktop App)

Download for your platform:

- [macOS (Universal)](https://github.com/mbron64/simplestclaw/releases/latest)
- Windows - Coming soon
- Linux - Coming soon

### Option 2: Hosted (Railway)

Deploy OpenClaw to the cloud in under 60 seconds. Choose your AI provider:

| Provider | Deploy |
|----------|--------|
| Anthropic (Claude) | [![Deploy](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-anthropic) |
| OpenAI (GPT-4) | [![Deploy](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-openai) |
| Google (Gemini) | [![Deploy](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-gemini) |
| OpenRouter | [![Deploy](https://railway.com/button.svg)](https://railway.com/new/template/simplestclaw-openrouter) |

**Steps:**
1. Click the deploy button for your provider
2. Sign in to Railway (or create account)
3. Enter your API key when prompted
4. Click "Deploy"
5. Copy your gateway token and connect

**Requirements:**
- Railway Hobby plan ($5/month) - free trial has memory limits
- API key from one of: Anthropic, OpenAI, Google, or OpenRouter

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY` | From [platform.openai.com](https://platform.openai.com) |
| `GOOGLE_API_KEY` | From [aistudio.google.com](https://aistudio.google.com) |
| `OPENROUTER_API_KEY` | From [openrouter.ai](https://openrouter.ai) |
| `OPENCLAW_GATEWAY_TOKEN` | Auto-generated (don't change) |

*You only need one API key. You pay Railway directly - we never touch your money.*

## Development

```bash
# Clone the repo
git clone https://github.com/mbron64/simplestclaw.git
cd simplestclaw

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Project Structure

```
simplestclaw/
├── apps/
│   ├── web/           # Marketing website
│   ├── gateway/       # Railway-deployable OpenClaw gateway
│   └── desktop/       # Tauri desktop app (macOS)
├── packages/
│   ├── ui/            # Shared UI components
│   └── openclaw-client/  # OpenClaw Gateway WebSocket client
└── package.json
```

## How is this different from simpleclaw?

| Feature | simpleclaw | simplestclaw |
|---------|------------|--------------|
| Setup | Telegram bot required | One-click button |
| Deployment | Cloud only | Local + Cloud |
| Chat | External (Telegram) | Built-in web UI |
| Payment | Through simpleclaw | Direct to Railway |
| Open source | No | Yes (MIT) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE)
