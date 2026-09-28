# ATMT Labs — Privacy Policy (DRAFT)

> **Published version:** https://labs.atmt.dev/privacy (`site/privacy.html`). That page is what users see and what Google's OAuth review checks. Change both together.

> **DRAFT: not yet in force. Have it reviewed before you publish.**
> Items marked **[CONFIRM]** need the owner's decision. Everything else lists
> what the code in this repository actually collects.
> If you operate from the Philippines, the Data Privacy Act of 2012 (RA 10173)
> applies. Your reviewer should check the registration and Data Protection
> Officer requirements.

**Last updated:** [CONFIRM: publish date]
**Controller:** Automatika Consulting (ATMT Labs), [CONFIRM: address], hello@automatika.ph
**Data Protection Officer:** [CONFIRM: name / email]

## The short version

- **Your work stays on your computer.** Your projects, files, prompts, agent conversations and output, memory, and the keys you paste for connectors (such as Pancake POS or Webcake) are never sent to us.
- **We keep only what licensing needs.** That is your email, your license status, and which computers are activated.
- **Card details go to Stripe.** They never reach us.
- **Usage statistics are anonymous and optional.** See [TELEMETRY.md](TELEMETRY.md).

## What we collect, and why

| Data | Where it comes from | Why | Kept |
|---|---|---|---|
| Email address, name, sign-in provider ID | Google or Yahoo, when you sign in | Your account; the license is tied to your email | While your account exists |
| License status, trial dates, purchase date, amount and currency | Our licensing service and Stripe | Deciding whether the app is licensed; receipts; support | While your account exists, and as long as tax and accounting law requires |
| Stripe customer ID and saved payment-method ID (not the card number) | Stripe | Charging the trial once on day 7; purchases | Same as above |
| Stripe's card fingerprint (an opaque ID Stripe derives from the card; not the card number) | Stripe | Enforcing one free trial per card | While your account exists |
| For each activated computer: a hashed hardware ID, computer name, operating system, app version, first and last activation time | The app, when it activates | Binding the license to your computers and enforcing the device limit | Until you remove the device or delete your account |
| Unlock code redemption: which account redeemed which code, and when | Our licensing service | Making each code single-use | While your account exists |
| Sign-in sessions and refresh tokens (stored hashed) | Our licensing service | Keeping you signed in | Up to 90 days |
| Anonymous usage events | The app, only if enabled | Understanding feature use | See TELEMETRY.md |

**What we don't collect:**
- your projects, files or code;
- prompts or agent output;
- connector keys;
- raw hardware IDs, which are hashed on your computer before anything is sent;
- your full card number.

## Who processes it

| Service | Role | Where |
|---|---|---|
| Vercel | Hosts the licensing service | Functions run in Singapore (sin1) |
| Neon | Database | Singapore (AWS ap-southeast-1) |
| Stripe | Payments | Stripe's regions, under Stripe's privacy policy |
| Google / Yahoo | Sign-in | Under their privacy policies |
| PostHog | Anonymous usage events, only if enabled | United States (PostHog Cloud US) |

We don't sell personal data, and we don't use it for advertising.

## Your rights

You can ask to see, correct, export or delete your data, or object to how it's used. Email **hello@automatika.ph**.

Deleting your account deletes your license. If you've activated computers, they keep working offline (see the [License Agreement](EULA.md), §3), but can't be activated again.

You can remove computers yourself, and cancel a trial, at `auth.labs.atmt.dev/account`.

## Security

- Tokens and codes are stored hashed.
- License files are signed and bound to one computer.
- Connector keys are encrypted with your operating system's keychain.
- All traffic uses HTTPS.

## Children

ATMT Labs is not directed at children under [CONFIRM: 13/16/18].

## Changes

We'll post changes here and on labs.atmt.dev. Material changes are announced before they take effect.
