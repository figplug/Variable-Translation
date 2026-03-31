<div align="center">
  <h1>Variable Translation</h1>
  <p>A Figma plugin to translate String variables across modes with OpenAI, Gemini, Claude, and DeepL.</p>
</div>

<div align="center">
  <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/figplug/Variable-Translation?style=plastic" />
  <img alt="Repo size" src="https://img.shields.io/github/repo-size/figplug/Variable-Translation?style=plastic" />
  <img alt="License" src="https://img.shields.io/github/license/figplug/Variable-Translation?style=plastic" />
  <a href="https://github.com/figplug/Variable-Translation/issues">
    <img alt="GitHub issues" src="https://img.shields.io/github/issues/figplug/Variable-Translation?style=plastic" />
  </a>
  <a href="https://github.com/figplug/Variable-Translation/pulls">
    <img alt="GitHub pull requests" src="https://img.shields.io/github/issues-pr/figplug/Variable-Translation?style=plastic" />
  </a>
</div>

<div align="center">
  <a href="https://github.com/figplug/Variable-Translation">GitHub Repository</a>
</div>

## Overview

Variable Translation helps teams localize Figma variable collections by generating translated modes from an existing source mode.

It supports:

- local String variable collections in the current Figma file
- manual source language selection or automatic detection
- single or multi-language output mode generation
- OpenAI, Gemini, Claude, DeepL Free, and DeepL Pro
- automatic source-mode renaming when the source language is known or detected

## Features

- Select a variable collection that contains `STRING` values
- Choose the source mode to translate from
- Translate to one or many output languages in one run
- Create missing target modes or update existing ones
- Skip unsupported or non-translatable entries safely
- Store provider API keys locally with `figma.clientStorage`
- Use a hosted DeepL proxy for published builds

## Tech Stack

- Plugma
- React
- Tailwind CSS
- Figma Plugin API
- Vercel Functions for the hosted DeepL proxy

## Providers

The plugin currently supports:

- OpenAI
- Gemini
- Gemini Free
- Claude
- DeepL Free
- DeepL Pro

## Project Structure

```text
src/main/           Figma plugin logic
src/ui/             React UI
src/shared/         Shared types and provider/language config
api/                Hosted serverless proxy for DeepL
server/             Local dev proxy for DeepL
manifest.json       Importable manifest for Figma
manifest.ts         Plugma build manifest
```

## Development

Install dependencies:

```bash
npm install
```

Run type checking:

```bash
npm run typecheck
```

Build the plugin:

```bash
npm run build
```

Run Plugma in dev mode:

```bash
npm run dev
```

If you want to test DeepL locally, start the local proxy too:

```bash
npm run deepl-proxy
```

## Environment Variables

For published or hosted DeepL usage, create a local `.env` file:

```bash
VITE_DEEPL_PROXY_URL=https://your-project.vercel.app/api/deepl-translate
```

Keep only [.env.example](/Users/mrsteven/Documents/GitHub/Variable%20Translation/.env.example) in the repository.

## Import in Figma

1. Open `Plugins > Development > Import plugin from manifest...`
2. Select [manifest.json](/Users/mrsteven/Documents/GitHub/Variable%20Translation/manifest.json)
3. Make sure `npm run build` has been executed at least once
4. Launch the plugin from Figma

## DeepL Architecture

DeepL does not allow direct browser-based requests from a Figma plugin context.

To support DeepL safely, this project includes:

- a local dev proxy in [server/deepl-proxy.mjs](/Users/mrsteven/Documents/GitHub/Variable%20Translation/server/deepl-proxy.mjs)
- a hosted serverless proxy in [api/deepl-translate.js](/Users/mrsteven/Documents/GitHub/Variable%20Translation/api/deepl-translate.js)

For production builds, the plugin should point to a hosted proxy through `VITE_DEEPL_PROXY_URL`.

## Contributing

Issues and pull requests are welcome.

If you contribute, please keep the plugin safe for public release:

- avoid introducing secrets into the repo
- preserve provider-specific validation and error handling
- keep Figma Community publishing constraints in mind
