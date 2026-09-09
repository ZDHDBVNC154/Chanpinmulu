import type { D1Database } from '@cloudflare/workers-types';
import { generatePublicId, parsePublicId } from '../ids/publicId';
import type { InquiryContact } from './form';
import type { InquiryIntelligence, InquiryRiskLevel } from './intelligence';

export type InquiryStatus = 'new' | 'contacted' | 'quoted' | 'closed';

export interface InquiryLineInput {
  productId: number;
  productPublicId: string | null;
  sku: string | null;
  name: string;
  optionLabel: string | null;
  quantity: number;
}

export interface InquiryRow {
  id: number;
  public_id: string;
  reference: string;
  contact_name: string;
  company: string;
  email: string;
  phone: string | null;
  country: string;
  target_delivery: string | null;
  message: string | null;
  status: InquiryStatus;
  client_ip_masked: string | null;
  client_ip_hash: string | null;
  ip_country: string | null;
  ip_region: string | null;
  ip_city: string | null;
  ip_timezone: string | null;
  ip_asn: number | null;
  ip_as_organization: string | null;
  browser_timezone: string | null;
  device_type: string | null;
  device_os: string | null;
  browser_name: string | null;
  source: string | null;
  source_detail: string | null;
  landing_url: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  risk_level: InquiryRiskLevel;
  risk_score: number;
  risk_signals: string | null;
  history_count: number;
  bot_score: number | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

export interface InquiryItemRow {
  id: number;
  inquiry_public_id: string;
  product_public_id: string | null;
  product_id: number | null;
  sku: string | null;
  name: string;
  option_label: string | null;
  quantity: number;
  notes: string | null;
}

export async function createInquiry(
  db: D1Database,
  contact: InquiryContact,
  lines: InquiryLineInput[],
  intelligence: InquiryIntelligence,
  now = new Date(),
): Promise<{ publicId: string; reference: string }> {
  if (lines.length === 0) throw new Error('An inquiry needs at least one product.');
  const publicId = generatePublicId('inquiry');
  const token = parsePublicId(publicId, 'inquiry')!.slice('inq_'.length).toUpperCase();
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  const reference = `RFQ-${day}-${token}`;
  await db.batch([
    db.prepare(
      `INSERT INTO inquiries (
         public_id, reference, contact_name, company, email, phone, country,
         target_delivery, message, client_ip_masked, client_ip_hash,
         ip_country, ip_region, ip_city, ip_timezone, ip_asn, ip_as_organization,
         browser_timezone, device_type, device_os, browser_name,
         source, source_detail, landing_url, referrer, utm_source, utm_medium,
         utm_campaign, risk_level, risk_score, risk_signals, history_count, bot_score
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      publicId, reference, contact.contactName, contact.company, contact.email,
      contact.phone, contact.country, contact.targetDelivery, contact.message,
      intelligence.clientIpMasked, intelligence.clientIpHash,
      intelligence.ipCountry, intelligence.ipRegion, intelligence.ipCity,
      intelligence.ipTimezone, intelligence.ipAsn, intelligence.ipAsOrganization,
      intelligence.browserTimezone, intelligence.deviceType, intelligence.deviceOs,
      intelligence.browserName, intelligence.source, intelligence.sourceDetail,
      intelligence.landingUrl, intelligence.referrer, intelligence.utmSource,
      intelligence.utmMedium, intelligence.utmCampaign, intelligence.riskLevel,
      intelligence.riskScore, JSON.stringify(intelligence.riskSignals),
      intelligence.historyCount, intelligence.botScore,
    ),
    ...lines.map((line) =>
      db.prepare(
        `INSERT INTO inquiry_items (
           inquiry_public_id, product_public_id, product_id, sku, name,
           option_label, quantity
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        publicId, line.productPublicId, line.productId, line.sku, line.name,
        line.optionLabel, line.quantity,
      ),
    ),
  ]);
  return { publicId, reference };
}

/** Count earlier submissions matching either the normalized email or keyed IP hash. */
export async function countInquiryHistory(
  db: D1Database,
  email: string,
  ipHash: string | null,
): Promise<number> {
  const row = ipHash
    ? await db.prepare(
      'SELECT COUNT(*) AS n FROM inquiries WHERE lower(email) = ? OR client_ip_hash = ?',
    ).bind(email.toLowerCase(), ipHash).first<{ n: number }>()
    : await db.prepare(
      'SELECT COUNT(*) AS n FROM inquiries WHERE lower(email) = ?',
    ).bind(email.toLowerCase()).first<{ n: number }>();
  return row?.n ?? 0;
}

export function inquiryRiskSignals(row: Pick<InquiryRow, 'risk_signals'>): string[] {
  try {
    const value = JSON.parse(row.risk_signals ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function countInquiries(db: D1Database, status?: InquiryStatus): Promise<number> {
  const statement = status
    ? db.prepare('SELECT COUNT(*) AS n FROM inquiries WHERE status = ?').bind(status)
    : db.prepare('SELECT COUNT(*) AS n FROM inquiries');
  return (await statement.first<{ n: number }>())?.n ?? 0;
}

export async function listInquiries(
  db: D1Database,
  limit = 50,
  offset = 0,
): Promise<InquiryRow[]> {
  const { results } = await db.prepare(
    `SELECT i.*, COUNT(ii.id) AS item_count
       FROM inquiries i
       LEFT JOIN inquiry_items ii ON ii.inquiry_public_id = i.public_id
      GROUP BY i.id
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ? OFFSET ?`,
  ).bind(limit, offset).all<InquiryRow>();
  return results ?? [];
}

export async function getInquiry(
  db: D1Database,
  publicId: string,
): Promise<{ inquiry: InquiryRow; items: InquiryItemRow[] } | null> {
  const inquiry = await db.prepare('SELECT * FROM inquiries WHERE public_id = ?')
    .bind(publicId).first<InquiryRow>();
  if (!inquiry) return null;
  const { results } = await db.prepare(
    'SELECT * FROM inquiry_items WHERE inquiry_public_id = ? ORDER BY id',
  ).bind(publicId).all<InquiryItemRow>();
  return { inquiry, items: results ?? [] };
}

export async function updateInquiryStatus(
  db: D1Database,
  publicId: string,
  status: InquiryStatus,
): Promise<void> {
  await db.prepare(
    "UPDATE inquiries SET status = ?, updated_at = datetime('now') WHERE public_id = ?",
  ).bind(status, publicId).run();
}
