# DevLabs — Privacy Policy

> Published policy: https://devlabs.atmt.dev/privacy (`site/privacy.html`). Keep this copy aligned with that page.

**Last updated:** October 21, 2026

jepoy.dev (Jeffrey Cayao) explains here how data is handled for the open-source DevLabs desktop app and the devlabs.atmt.dev website.

## The short version

- **There is no account and no sign-in.** The app does not send us your email, name or computer details.
- Your projects, files, prompts, agent output, memory and connector keys stay on your computer.
- We do not sell personal data, use it for advertising, or use it to train AI models.

## Your AI tools are separate services

The agents are AI tools you install and sign in to yourself (Claude Code, Codex, Gemini, Cursor and others). When an agent works, that tool sends your prompts and files to its own company under that company's terms. The same applies to connectors such as Pancake POS and Webcake.

## Optional office extras

These are off until you set them up, and each sends data only to the service named:

- **Spoken replies (ElevenLabs).** When you turn on voice replies in the office settings, the first sentences of each agent reply, and any text you preview, go to ElevenLabs to make the audio. Your ElevenLabs key is stored encrypted on your computer.
- **Jukebox (Spotify).** When you connect Spotify, your searches and playback commands go to Spotify. Your Client ID and sign-in tokens are stored encrypted on your computer. During sign-in the app briefly listens on `127.0.0.1:43821` for Spotify's reply.
- **Company builder.** Your company description is sent to Groq if you saved a Groq key, otherwise to Claude through your own Claude Code sign-in, to plan the team.
- **Server room (GitHub).** Pull-request reviews use your own GitHub CLI (`gh`) sign-in and go to GitHub.
- **Discord connector and trigger.** When you save a Discord bot token and switch the connector on, the messages agents post, and the channel messages they read, go to and come from Discord. When the Discord trigger is on, the app reads new messages in the channels you list every few seconds, and posts a short "Received" reply to requests that mention your bot. Your bot token is stored encrypted on your computer and is only sent to Discord.
- **Obsidian connector.** Notes stay in the vault folder you choose on your computer. Nothing is sent anywhere by the connector itself (if your vault syncs through Obsidian Sync, iCloud or similar, that service syncs it as usual).

## Optional anonymous usage stats

Official builds can send anonymous usage events to PostHog Cloud (United States) with a random install ID and no personal data. Turn this off in **Settings → General → Anonymous usage stats** or with `DO_NOT_TRACK`. Builds you compile yourself send nothing. See [TELEMETRY.md](TELEMETRY.md).

## Updates

While auto-update is on, the app asks GitHub for the latest public release. GitHub sees that request under its own privacy policy.

## Website

devlabs.atmt.dev sets no cookies and runs no analytics or advertising scripts. The host (Vercel) keeps short-lived request logs for security and error diagnosis.

## Your rights and contact

You can ask what data we hold about you and ask us to correct or delete it (Data Privacy Act of 2012 (RA 10173) in the Philippines; GDPR / UK GDPR in the EU, EEA and UK). Contact: hello@automatika.ph, or open an issue at https://github.com/jeffreycayao/Dev-Labs/issues.
