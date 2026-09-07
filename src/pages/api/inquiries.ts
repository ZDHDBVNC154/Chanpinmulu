import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readCart, resolveCart, clearCart } from '../../features/cart/cart';
import { parseInquiryForm } from '../../features/inquiries/form';
import { createInquiry } from '../../features/inquiries/db';
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
  const reference = await createInquiry(
    env.DB,
    parsed.data,
    lines.map((line) => ({
      productId: line.product.id,
      productPublicId: line.product.public_id,
      sku: line.product.sku ?? null,
      name: line.product.name,
      optionLabel: [line.variant?.label, ...line.extras.map((extra) => extra.label)]
        .filter(Boolean).join(' · ') || null,
      quantity: line.qty,
    })),
  );
  clearCart(cookies);
  return redirect(`/inquiry/thanks?ref=${encodeURIComponent(reference)}`, 303);
};
