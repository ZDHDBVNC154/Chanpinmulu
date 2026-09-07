import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { parsePublicId } from '../../../../features/ids/publicId';
import { updateInquiryStatus, type InquiryStatus } from '../../../../features/inquiries/db';

export const prerender = false;
const statuses = new Set<InquiryStatus>(['new', 'contacted', 'quoted', 'closed']);

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const publicId = parsePublicId(params.id, 'inquiry');
  const form = await request.formData();
  const status = String(form.get('status') ?? '') as InquiryStatus;
  if (!publicId || !statuses.has(status)) return new Response('Bad request', { status: 400 });
  await updateInquiryStatus(env.DB, publicId, status);
  return redirect(`/admin/inquiries/${publicId}`, 303);
};
