'use strict';

async function stripeReq(key, path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.stripe.com/v1${path}${qs ? '?' + qs : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2023-10-16' } });
  if (!r.ok) { const e = await r.json(); throw new Error(`Stripe ${r.status}: ${e.error?.message || JSON.stringify(e)}`); }
  return r.json();
}

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'stripe_get_revenue',
      description: 'Get Stripe revenue metrics: MRR, total charges, recent payments.',
      parameters: { type: 'object', properties: {
        period: { type: 'string', description: 'Period: "today", "week", "month", "year" (default: month)' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'stripe_list_customers',
      description: 'List recent Stripe customers.',
      parameters: { type: 'object', properties: {
        limit: { type: 'integer', description: 'Max results (default 20)' },
        email: { type: 'string', description: 'Filter by email' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'stripe_list_subscriptions',
      description: 'List active Stripe subscriptions.',
      parameters: { type: 'object', properties: {
        status: { type: 'string', description: 'Filter: active, past_due, canceled, all (default: active)' },
        limit:  { type: 'integer' },
      }, required: [] }
    }
  },
  {
    type: 'function', function: {
      name: 'stripe_get_balance',
      description: 'Get current Stripe account balance (available + pending).',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
];

function periodToTimestamp(period = 'month') {
  const now = Math.floor(Date.now() / 1000);
  switch (period) {
    case 'today': return now - 86400;
    case 'week':  return now - 7 * 86400;
    case 'month': return now - 30 * 86400;
    case 'year':  return now - 365 * 86400;
    default:      return now - 30 * 86400;
  }
}

function cents(amount, currency = 'usd') {
  return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

async function execute(name, args, { apiKey }) {
  if (!apiKey) return { error: 'Stripe API key not configured. Add it in admin settings → Intégrations.' };

  switch (name) {
    case 'stripe_get_revenue': {
      const since = periodToTimestamp(args.period);
      const charges = await stripeReq(apiKey, '/charges', { created: `[gte]${since}`.replace('[', '['), limit: 100, expand: ['data.invoice'] });
      const successful = (charges.data || []).filter(c => c.status === 'succeeded');
      const total = successful.reduce((s, c) => s + c.amount, 0);
      const refunded = successful.reduce((s, c) => s + c.amount_refunded, 0);
      // Try to get MRR from subscriptions
      let mrr = 0;
      try {
        const subs = await stripeReq(apiKey, '/subscriptions', { status: 'active', limit: 100 });
        mrr = (subs.data || []).reduce((s, sub) => {
          const plan = sub.items?.data?.[0]?.price;
          if (!plan) return s;
          const amount = plan.unit_amount || 0;
          const interval = plan.recurring?.interval;
          const monthly = interval === 'year' ? amount / 12 : interval === 'week' ? amount * 4 : amount;
          return s + monthly;
        }, 0);
      } catch {}
      return {
        period: args.period || 'month',
        total_revenue: cents(total, successful[0]?.currency),
        net_revenue: cents(total - refunded, successful[0]?.currency),
        refunded: cents(refunded, successful[0]?.currency),
        transactions: successful.length,
        mrr: mrr ? cents(mrr, 'usd') : 'N/A',
        recent: successful.slice(0, 10).map(c => ({ amount: cents(c.amount, c.currency), date: new Date(c.created * 1000).toISOString().slice(0, 10), description: c.description })),
      };
    }
    case 'stripe_list_customers': {
      const params = { limit: Math.min(args.limit || 20, 100) };
      if (args.email) params.email = args.email;
      const data = await stripeReq(apiKey, '/customers', params);
      return { total: data.data?.length, customers: (data.data || []).map(c => ({ id: c.id, email: c.email, name: c.name, created: new Date(c.created * 1000).toISOString().slice(0, 10), currency: c.currency })) };
    }
    case 'stripe_list_subscriptions': {
      const params = { status: args.status === 'all' ? undefined : (args.status || 'active'), limit: Math.min(args.limit || 20, 100) };
      const data = await stripeReq(apiKey, '/subscriptions', params);
      return {
        total: data.data?.length,
        subscriptions: (data.data || []).map(s => ({
          id: s.id, status: s.status,
          customer: s.customer,
          plan: s.items?.data?.[0]?.price?.nickname || s.items?.data?.[0]?.price?.id,
          amount: cents(s.items?.data?.[0]?.price?.unit_amount || 0, s.currency),
          interval: s.items?.data?.[0]?.price?.recurring?.interval,
          current_period_end: new Date(s.current_period_end * 1000).toISOString().slice(0, 10),
        }))
      };
    }
    case 'stripe_get_balance': {
      const bal = await stripeReq(apiKey, '/balance');
      const fmt = (arr) => (arr || []).map(b => `${cents(b.amount, b.currency)}`).join(', ');
      return { available: fmt(bal.available), pending: fmt(bal.pending) };
    }
    default: return { error: `Unknown Stripe tool: ${name}` };
  }
}

async function testConnection(apiKey) {
  try {
    const data = await stripeReq(apiKey, '/account');
    return { ok: true, id: data.id, email: data.email, country: data.country };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { SCHEMAS, execute, testConnection };
