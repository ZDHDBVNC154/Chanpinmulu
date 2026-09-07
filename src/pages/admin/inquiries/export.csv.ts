import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { listInquiries } from '../../../features/inquiries/db';

export const prerender = false;
const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export const GET: APIRoute = async () => {
  const rows = await listInquiries(env.DB, 10_000);
  const header = ['Reference', 'Status', 'Created at', 'Contact', 'Company', 'Email', 'Phone', 'Country', 'Target delivery', 'Product lines', 'Message'];
  const lines = [header, ...rows.map((row) => [row.reference, row.status, row.created_at, row.contact_name, row.company, row.email, row.phone, row.country, row.target_delivery, row.item_count ?? 0, row.message])];
  return new Response('\uFEFF' + lines.map((line) => line.map(cell).join(',')).join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="inquiries.csv"' } });
};
