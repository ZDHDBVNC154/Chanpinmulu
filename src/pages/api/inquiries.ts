import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readCart, resolveCart, clearCart } from '../../features/cart/cart';
import { parseInquiryForm } from '../../features/inquiries/form';
import { countInquiryHistory, createInquiry } from '../../features/inquiries/db';
import { buildInquiryIntelligence, hashIp } from '../../features/inquiries/intelligence';
import { notifyDingTalkInquiry } from '../../features/notifications/dingtalk';
import { getSecret } from '../../features/secrets/store';
import { TURNSTILE_FIELD, verifyConfiguredTurnstile } from '../../features/auth/turnstile';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const form = await request.formData();
  const parsed = parseInquiryForm(form);
  if ('error' in parsed) {
    if (parsed.error === 'spam') return redirect('/inquiry/thanks', 303);
    return redirect(`/cart?error=${encodeURIComponent(parsed.error)}`, 303);
  }

  const enabled = locals.settings?.turnstileEnabled ?? false;
  const secret = enabled ? await getSecret(env.DB, 'turnstile_secret_key') : null;
  const verified = await verifyConfiguredTurnstile(
    enabled,
    form.get(TURNSTILE_FIELD)?.toString(),
    secret,
    request.headers.get('cf-connecting-ip'),
  );
  if (!verified) return redirect('/cart?error=Please%20complete%20the%20security%20check.', 303);

  const { lines } = await resolveCart(env.DB, readCart(cookies));
  if (lines.length === 0) return redirect('/cart?error=Your%20inquiry%20list%20is%20empty.', 303);
  const ipHash = await hashIp(
    request.headers.get('cf-connecting-ip'),
    env.AUTH_SECRET ?? env.SECRETS_KEK,
  );
  const historyCount = (await countInquiryHistory(env.DB, parsed.data.email, ipHash)) + 1;
  const intelligence = await buildInquiryIntelligence(
    request,
    form,
    env.AUTH_SECRET ?? env.SECRETS_KEK,
    historyCount,
  );
  const inquiryLines = lines.map((line) => ({
    productId: line.product.id,
    productPublicId: line.product.public_id,
    sku: line.product.sku ?? null,
    name: line.product.name,
    optionLabel: [line.variant?.label, ...line.extras.map((extra) => extra.label)]
      .filter(Boolean).join(' · ') || null,
    quantity: line.qty,
  }));
  const created = await createInquiry(
    env.DB,
    parsed.data,
    inquiryLines,
    intelligence,
  );
  clearCart(cookies);
  const origin = env.CANONICAL_ORIGIN || new URL(request.url).origin;
  const delivery = notifyDingTalkInquiry(env.DB, {
    ...created,
    contact: parsed.data,
    lines: inquiryLines,
    intelligence,
    adminUrl: new URL(`/admin/inquiries/${created.publicId}`, origin).href,
  }).catch((error) => {
    console.error(JSON.stringify({
      event: 'dingtalk_inquiry_notification_failed',
      inquiry: created.publicId,
      message: error instanceof Error ? error.message : String(error),
    }));
  });
  if (locals.cfContext) locals.cfContext.waitUntil(delivery);
  else await delivery;
  return redirect(`/inquiry/thanks?ref=${encodeURIComponent(created.reference)}`, 303);
};
