import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { listInquiries } from '../../../features/inquiries/db';

export const prerender = false;
const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export const GET: APIRoute = async () => {
  const rows = await listInquiries(env.DB, 10_000);
  const header = ['Reference', 'Status', 'Created at', 'Contact', 'Company', 'Email', 'Phone', 'Country', 'Target delivery', 'Product lines', 'Message', 'Source', 'Source detail', 'UTM source', 'UTM medium', 'UTM campaign', 'IP country', 'IP region', 'IP city', 'Masked IP', 'IP timezone', 'Browser timezone', 'ASN', 'Network', 'Device', 'OS', 'Browser', 'History count', 'Risk level', 'Risk score', 'Risk signals'];
  const lines = [header, ...rows.map((row) => [row.reference, row.status, row.created_at, row.contact_name, row.company, row.email, row.phone, row.country, row.target_delivery, row.item_count ?? 0, row.message, row.source, row.source_detail, row.utm_source, row.utm_medium, row.utm_campaign, row.ip_country, row.ip_region, row.ip_city, row.client_ip_masked, row.ip_timezone, row.browser_timezone, row.ip_asn, row.ip_as_organization, row.device_type, row.device_os, row.browser_name, row.history_count, row.risk_level, row.risk_score, row.risk_signals])];
  return new Response('\uFEFF' + lines.map((line) => line.map(cell).join(',')).join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="inquiries.csv"' } });
};
