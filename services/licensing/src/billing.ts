/**
 * Billing: ONE-TIME purchase, optionally after a 7-day trial that requires a card.
 *
 *   Trial   Stripe Checkout in `setup` mode saves the card (nothing charged).
 *           On day 7 the card is charged once, off-session (daily cron, plus a
 *           lazy attempt whenever the app renews its trial license).
 *   Buy     Stripe Checkout in `payment` mode (skip or end the trial).
 *
 * Checkout says in plain words, on the button, that nothing is charged today
 * and what is charged when. One trial per account and per card fingerprint.
 * A day-7 charge that fails or needs 3-D Secure moves the license to
 * `payment_required`; the app and the account page then offer a normal
 * on-session Checkout to finish the purchase.
 */
import type Stripe from 'stripe';
import type { Config } from './config.js';
import type { AccountRow, LicenseRow, Store } from './store.js';
import { hashUnlockCode, normalizeUnlockCode, type RedeemError } from './codes.js';

export type StripeLike = {
  customers: Pick<Stripe['customers'], 'create' | 'update'>;
  checkout: { sessions: Pick<Stripe['checkout']['sessions'], 'create'> };
  setupIntents: Pick<Stripe['setupIntents'], 'retrieve'>;
  paymentIntents: Pick<Stripe['paymentIntents'], 'create' | 'cancel'>;
  prices: Pick<Stripe['prices'], 'retrieve'>;
  charges: Pick<Stripe['charges'], 'retrieve'>;
  billingPortal: { sessions: Pick<Stripe['billingPortal']['sessions'], 'create'> };
  webhooks: Pick<Stripe['webhooks'], 'constructEvent'>;
};

const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const PRICE_TTL_MS = 10 * 60 * 1000;

export interface PriceInfo {
  amount: number;
  currency: string;
  label: string;
}

export function formatPrice(amount: number, currency: string): string {
  const major = ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).format(major);
  } catch {
    return `${major} ${currency.toUpperCase()}`;
  }
}

export class Billing {
  private price: { at: number; info: PriceInfo } | null = null;

  constructor(
    private readonly cfg: Config,
    private readonly store: Store,
    private readonly stripe: StripeLike,
    private readonly now: () => number
  ) {}

  async priceInfo(): Promise<PriceInfo> {
    if (this.price && this.now() - this.price.at < PRICE_TTL_MS) return this.price.info;
    const p = await this.stripe.prices.retrieve(this.cfg.stripe.priceId);
    if (p.type !== 'one_time' || typeof p.unit_amount !== 'number') {
      throw new Error('STRIPE_PRICE_ID must be a one-time price with a fixed amount');
    }
    const info = { amount: p.unit_amount, currency: p.currency, label: formatPrice(p.unit_amount, p.currency) };
    this.price = { at: this.now(), info };
    return info;
  }

  canTrial(l: LicenseRow): boolean {
    return l.status === 'none' && !l.trial_started_at;
  }

  private accountUrl(): string {
    return `${this.cfg.authOrigin}/account`;
  }

  private async customer(account: AccountRow, l: LicenseRow): Promise<string> {
    if (l.stripe_customer_id) return l.stripe_customer_id;
    const c = await this.stripe.customers.create(
      { email: account.email, name: account.name ?? undefined, metadata: { account_id: account.id } },
      { idempotencyKey: `customer-${account.id}` }
    );
    await this.store.updateLicense(account.id, { stripe_customer_id: c.id });
    return c.id;
  }

  /** Where "start trial" / "buy" should go for this account right now. */
  async checkoutUrl(account: AccountRow, want: 'trial' | 'buy'): Promise<string> {
    const l = await this.store.license(account.id);
    if (l.status === 'active') return this.accountUrl();
    if (l.status === 'trialing' && want === 'trial') return this.accountUrl();
    const kind = want === 'trial' && this.canTrial(l) ? 'trial' : 'buy';
    const customer = await this.customer(account, l);
    const price = await this.priceInfo();
    const success = `${this.cfg.siteOrigin}/welcome?${kind === 'trial' ? 'trial=1' : 'paid=1'}`;
    const cancel = `${this.cfg.authOrigin}/account`;
    const metadata = { account_id: account.id, purpose: kind === 'trial' ? 'trial' : 'purchase' };
    const session = kind === 'trial'
      ? await this.stripe.checkout.sessions.create({
          mode: 'setup',
          customer,
          payment_method_types: ['card'],
          success_url: success,
          cancel_url: cancel,
          metadata,
          setup_intent_data: { metadata },
          custom_text: {
            submit: {
              message: `Nothing is charged today. After ${this.cfg.trialDays} days your card is charged ${price.label} once for a lifetime license. Cancel any time before then at ${this.cfg.authOrigin.replace('https://', '')}/account.`
            }
          }
        })
      : await this.stripe.checkout.sessions.create({
          mode: 'payment',
          customer,
          line_items: [{ price: this.cfg.stripe.priceId, quantity: 1 }],
          success_url: success,
          cancel_url: cancel,
          metadata,
          payment_intent_data: { metadata, receipt_email: account.email },
          invoice_creation: { enabled: true }
        });
    if (!session.url) throw new Error('Stripe returned no checkout URL');
    return session.url;
  }

  /** The app's "start trial / complete purchase" button. */
  async appCheckoutUrl(account: AccountRow): Promise<string> {
    const l = await this.store.license(account.id);
    if (l.status === 'active' || l.status === 'trialing') return this.accountUrl();
    return this.checkoutUrl(account, this.canTrial(l) ? 'trial' : 'buy');
  }

  /** Stripe customer portal (card, receipts); account page if no customer yet. */
  async portalUrl(account: AccountRow): Promise<string> {
    const l = await this.store.license(account.id);
    if (!l.stripe_customer_id) return this.accountUrl();
    const s = await this.stripe.billingPortal.sessions.create({ customer: l.stripe_customer_id, return_url: this.accountUrl() });
    return s.url;
  }

  async cancelTrial(accountId: string): Promise<boolean> {
    return !!(await this.store.transition(accountId, ['trialing'], { status: 'canceled' }));
  }

  private async markPaid(accountId: string, p: { paymentIntentId: string | null; amount: number | null; currency: string | null }): Promise<void> {
    await this.store.transition(accountId, ['none', 'trialing', 'payment_required', 'canceled', 'refunded'], {
      status: 'active',
      paid_at: new Date(this.now()),
      payment_intent_id: p.paymentIntentId,
      amount: p.amount,
      currency: p.currency,
      failure_reason: null,
      source: 'stripe'
    });
  }

  /**
   * Redeem a single-use unlock code: a free lifetime license, no card. A trial
   * in progress simply ends (the day-7 charge only runs on 'trialing'). A
   * day-7 charge still waiting for 3-D Secure is cancelled so the customer
   * can't be charged afterwards by completing it.
   */
  async redeemUnlockCode(accountId: string, rawCode: string): Promise<{ ok: true; license: LicenseRow } | { ok: false; error: RedeemError }> {
    const normalized = normalizeUnlockCode(rawCode);
    if (!normalized) return { ok: false, error: 'code_invalid' };
    const hash = hashUnlockCode(normalized);
    const before = await this.store.license(accountId);
    if (before.status === 'active') return { ok: false, error: 'already_licensed' };
    const at = new Date(this.now());
    const license = await this.store.redeemUnlockCode(accountId, hash, at);
    if (!license) {
      const row = await this.store.unlockCode(hash);
      if (!row || row.revoked_at) return { ok: false, error: 'code_invalid' };
      if (row.redeemed_at) return { ok: false, error: row.redeemed_by === accountId ? 'already_licensed' : 'code_used' };
      if (row.expires_at && new Date(row.expires_at).getTime() <= at.getTime()) return { ok: false, error: 'code_expired' };
      return { ok: false, error: 'already_licensed' };
    }
    if (before.status === 'payment_required' && before.payment_intent_id) {
      try { await this.stripe.paymentIntents.cancel(before.payment_intent_id); } catch { /* already final */ }
    }
    return { ok: true, license };
  }

  /**
   * Charge a finished trial once. Safe to call from the cron and from the app
   * at the same time: Stripe's idempotency key makes both calls the same
   * PaymentIntent, and the status move is conditional.
   */
  async convertTrial(l: LicenseRow, account: AccountRow): Promise<LicenseRow> {
    if (l.status !== 'trialing' || !l.trial_end || l.trial_end.getTime() > this.now()) return l;
    const price = await this.priceInfo();
    if (!l.stripe_customer_id || !l.payment_method_id) {
      return (await this.store.transition(account.id, ['trialing'], { status: 'payment_required', failure_reason: 'no_payment_method' })) ?? l;
    }
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: price.amount,
          currency: price.currency,
          customer: l.stripe_customer_id,
          payment_method: l.payment_method_id,
          off_session: true,
          confirm: true,
          description: 'ATMT Labs lifetime license',
          receipt_email: account.email,
          metadata: { account_id: account.id, purpose: 'trial_conversion' }
        },
        { idempotencyKey: `trial-conversion-${account.id}-${l.trial_started_at?.getTime() ?? 0}` }
      );
      if (pi.status === 'succeeded') {
        await this.markPaid(account.id, { paymentIntentId: pi.id, amount: pi.amount, currency: pi.currency });
      } else if (pi.status !== 'processing') {
        await this.store.transition(account.id, ['trialing'], { status: 'payment_required', payment_intent_id: pi.id, failure_reason: pi.status });
      }
    } catch (e) {
      const err = e as { code?: string; type?: string };
      // Card declined / authentication_required: the customer finishes on-session.
      if (err.type === 'StripeCardError' || err.code) {
        await this.store.transition(account.id, ['trialing'], { status: 'payment_required', failure_reason: err.code ?? 'card_error' });
      } else {
        throw e; // network / API outage: leave it trialing, the next run retries
      }
    }
    return this.store.license(account.id);
  }

  /** Cron: every trial whose day has come. */
  async runDueTrials(): Promise<{ attempted: number; paid: number; failed: number }> {
    const due = await this.store.dueTrials(new Date(this.now()));
    let paid = 0;
    let failed = 0;
    for (const l of due) {
      const account = await this.store.account(l.account_id);
      if (!account) continue;
      try {
        const next = await this.convertTrial(l, account);
        if (next.status === 'active') paid++;
        else if (next.status === 'payment_required') failed++;
      } catch {
        failed++;
      }
    }
    return { attempted: due.length, paid, failed };
  }

  verifyWebhook(rawBody: string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.cfg.stripe.webhookSecret);
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const accountId = pi.metadata?.account_id;
        if (accountId && (pi.metadata.purpose === 'trial_conversion' || pi.metadata.purpose === 'purchase')) {
          await this.markPaid(accountId, { paymentIntentId: pi.id, amount: pi.amount, currency: pi.currency });
        }
        return;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.account_id && pi.metadata.purpose === 'trial_conversion') {
          await this.store.transition(pi.metadata.account_id, ['trialing'], {
            status: 'payment_required',
            payment_intent_id: pi.id,
            failure_reason: pi.last_payment_error?.code ?? 'payment_failed'
          });
        }
        return;
      }
      case 'charge.refunded': {
        const ch = event.data.object as Stripe.Charge;
        if (ch.refunded) await this.revokeForCustomer(ch.customer);
        return;
      }
      case 'charge.dispute.created': {
        const d = event.data.object as Stripe.Dispute;
        const chargeId = typeof d.charge === 'string' ? d.charge : d.charge.id;
        const ch = await this.stripe.charges.retrieve(chargeId);
        await this.revokeForCustomer(ch.customer);
        return;
      }
      default:
        return;
    }
  }

  private async revokeForCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<void> {
    const id = typeof customer === 'string' ? customer : customer?.id;
    if (!id) return;
    const l = await this.store.licenseByCustomer(id);
    // A license later granted by an unlock code isn't the one being refunded.
    if (l && l.source !== 'unlock_code') await this.store.transition(l.account_id, ['active'], { status: 'refunded' });
  }

  private async onCheckoutCompleted(s: Stripe.Checkout.Session): Promise<void> {
    const accountId = s.metadata?.account_id;
    if (!accountId) return;
    if (s.mode === 'payment' && s.payment_status === 'paid') {
      const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
      await this.markPaid(accountId, { paymentIntentId: pi, amount: s.amount_total, currency: s.currency });
      return;
    }
    if (s.mode !== 'setup' || !s.setup_intent) return;
    const siId = typeof s.setup_intent === 'string' ? s.setup_intent : s.setup_intent.id;
    const si = await this.stripe.setupIntents.retrieve(siId, { expand: ['payment_method'] });
    const pm = si.payment_method && typeof si.payment_method === 'object' ? si.payment_method : null;
    if (!pm) return;
    const customerId = typeof s.customer === 'string' ? s.customer : s.customer?.id;
    if (customerId) {
      await this.stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
    }
    const l = await this.store.license(accountId);
    const fingerprint = pm.card?.fingerprint ?? null;
    const fresh = this.canTrial(l) && !!fingerprint && (await this.store.claimTrialCard(fingerprint, accountId));
    if (fresh) {
      const start = this.now();
      await this.store.transition(accountId, ['none'], {
        status: 'trialing',
        payment_method_id: pm.id,
        trial_started_at: new Date(start),
        trial_end: new Date(start + this.cfg.trialDays * 86_400_000),
        failure_reason: null
      });
    } else {
      // This card (or account) already had its trial: no second free week.
      await this.store.transition(accountId, ['none', 'canceled'], {
        status: 'payment_required',
        payment_method_id: pm.id,
        failure_reason: 'trial_already_used'
      });
    }
  }
}
