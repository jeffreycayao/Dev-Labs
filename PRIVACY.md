# ATMT Labs — Privacy Policy

> Published policy: https://labs.atmt.dev/privacy (`site/privacy.html`). Keep this bundled copy aligned with that page.

**Effective / last updated:** September 30, 2026

Automatika Consulting explains here how we handle personal data for the ATMT Labs Floor desktop app, website and account service.

## The short version

- Your projects, files, prompts, agent conversations and output, memory, and connector keys stay on your computer. AI providers you choose may receive your work under their own policies.
- We keep your email, name, sign-in sessions and signed-in computer details to run your free account.
- ATMT Labs no longer collects payment details for new app access. Historical purchase records may be retained for legal and accounting duties.
- We do not sell or share personal data for advertising or use it to train AI models. Anonymous usage statistics are optional.

## Data we collect

| Data | Source and purpose | Basis |
|---|---|---|
| Verified email, name and provider account ID | Google or Yahoo; create your account and provide support | Contract |
| Hashed computer ID, name, operating system, app version and first/last access time | The app; manage signed-in computers and renew sessions | Contract |
| Hashed sign-in and refresh tokens | Account service; keep you signed in | Contract |
| Historical trial, purchase and payment records, if you used an earlier paid version | Existing records and Stripe; receipts, support and accounting | Legal obligation; contract |
| Request logs such as IP, browser, time and page | Hosting provider; security and error diagnosis | Legitimate interest |
| Anonymous usage events with a random install ID | App, only when enabled; understand feature usage | Consent |
| Support messages | You; answer your request | Legitimate interest; contract |

We do not collect your projects, prompts, agent output, connector keys, raw hardware IDs, full card number, contacts, calendar, Drive files or email content.

## Google and Yahoo sign-in

We request only `openid`, `email` and `profile`. We receive your provider account ID, verified email and name to identify you and provide support. We do not ask for Gmail, Google Drive, Calendar or Contacts access. We do not sell, advertise with or train AI on provider user data. Our hosting and database providers process it only to run the account service. Human access is limited to support you request, security investigations or legal requirements. Data moves over HTTPS and production access is restricted. Our use of Google API information follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including Limited Use. You can remove Google access at [Google connections](https://myaccount.google.com/connections) or remove Yahoo access in Yahoo's security settings.

## Historical payments

ATMT Labs no longer takes payment for app access. Earlier payments were handled by Stripe; we never received your full card number. We may retain historical transaction records for support and legal accounting duties. See [Stripe's privacy policy](https://stripe.com/privacy).

## Data on your computer and in third-party AI tools

The app runs locally. Your files, conversations, agent memory, floor and hire files and connector keys stay there; connector keys are encrypted through your operating system's keychain. The AI tools and connectors you choose may send data to their own providers under their terms and privacy policies.

## Usage statistics and cookies

If enabled, the app sends anonymous usage events to PostHog Cloud in the United States. Events carry a random install ID and no account ID, name, email, file names, prompts or output. Disable this in **Settings → General → Anonymous usage stats** or with `DO_NOT_TRACK`. Unofficial builds send no events.

The marketing website sets no cookies or analytics. The account site uses only required sign-in cookies: `atmt_session` for up to 30 days and `atmt_authz` / `atmt_idp` for up to 10 minutes. There are no advertising cookies.

## Processors and retention

Vercel hosts the website and account service; Neon stores account data in Singapore; Google and Yahoo provide sign-in; PostHog receives optional anonymous events; Stripe holds historical payment data. These providers may process data outside your country, including Singapore and the United States. Where required, appropriate transfer safeguards apply.

Account data remains while your account exists. Historical payment records remain as long as tax and accounting law requires. Computer details remain until removed or your account is deleted. Web sessions last up to 30 days, refresh tokens up to 90 days, and host request logs follow the host's retention period.

## Your rights and deletion

Ask us for a copy, correction, export, deletion or restriction of your data, object to legitimate-interest processing, or withdraw consent. Email our Data Protection Officer at [support@automatika.ph](mailto:support@automatika.ph); we answer within 30 days and may verify your account. Applicable Philippine, EU/UK and US state rights remain available. We do not sell or share data for cross-context behavioural advertising.

To delete your account, email [hello@automatika.ph](mailto:hello@automatika.ph) from your account email. We delete account data within 30 days except records law requires us to retain. Deleting the account ends app access when its short-lived token expires. Remove computers at [your account page](https://auth.labs.atmt.dev/account). Uninstall the app and delete its local folders to remove local data.

## Security and changes

Traffic uses HTTPS; server tokens are hashed; short-lived app access tokens are signed and computer-bound; connector keys use the operating system keychain; production access is restricted. We will notify people and authorities of a data breach as law requires. We will post material policy changes before they take effect.

**Contact:** Automatika Consulting, 1209 Mountain Road PL NE, Albuquerque, New Mexico 87110, USA · +1 520 413 9685 · [support@automatika.ph](mailto:support@automatika.ph).
