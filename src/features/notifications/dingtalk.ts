import type { D1Database } from '@cloudflare/workers-types';
import type { InquiryContact } from '../inquiries/form';
import type { InquiryIntelligence } from '../inquiries/intelligence';
import type { InquiryLineInput } from '../inquiries/db';
import { getSecret } from '../secrets/store';
import { getStoreSettings } from '../settings/db';

export interface DingTalkInquiry {
  publicId: string;
  reference: string;
  contact: InquiryContact;
  lines: InquiryLineInput[];
  intelligence: InquiryIntelligence;
  adminUrl: string;
}

const encoder = new TextEncoder();

export function isAllowedDingTalkWebhook(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'oapi.dingtalk.com' &&
      url.pathname === '/robot/send' &&
      !!url.searchParams.get('access_token');
  } catch {
    return false;
  }
}

export async function signedDingTalkUrl(
  webhook: string,
  secret: string,
  timestamp = Date.now(),
): Promise<string> {
  if (!isAllowedDingTalkWebhook(webhook)) throw new Error('Invalid DingTalk robot webhook.');
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`${timestamp}\n${secret}`),
  );
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  const url = new URL(webhook);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', base64);
  return url.href;
}

const clean = (value: string | null | undefined): string =>
  (value || '—').replaceAll('\\', '\\\\').replaceAll('*', '\\*').replaceAll('[', '\\[').replaceAll(']', '\\]');

const riskLabel = { low: '低', medium: '中', high: '高' } as const;
const advice = { low: '正常跟进', medium: '人工核实', high: '优先核实身份后再报价' } as const;

export function buildDingTalkInquiryMarkdown(input: DingTalkInquiry): string {
  const { contact, intelligence, lines } = input;
  const location = [intelligence.ipCountry, intelligence.ipRegion, intelligence.ipCity]
    .filter(Boolean).join(' · ') || '未知';
  const network = [intelligence.ipAsOrganization, intelligence.ipAsn ? `ASN ${intelligence.ipAsn}` : null]
    .filter(Boolean).join('（') + (intelligence.ipAsOrganization && intelligence.ipAsn ? '）' : '');
  const needs = lines.slice(0, 8).map((line) =>
    `${clean(line.name)} × ${line.quantity}${line.optionLabel ? `（${clean(line.optionLabel)}）` : ''}`,
  ).join('；');
  const signals = intelligence.riskSignals.length > 0
    ? intelligence.riskSignals.map(clean).join('；')
    : '未发现明显风险信号';

  return [
    '### 📩 Auromai 新询盘',
    '',
    `**询价编号：** ${clean(input.reference)}`,
    `**姓名：** ${clean(contact.contactName)}`,
    `**公司：** ${clean(contact.company)}`,
    `**邮箱：** ${clean(contact.email)}`,
    `**需求：** ${needs || '—'}`,
    '',
    `🌐 **IP 位置：** ${clean(location)}${intelligence.clientIpMasked ? `（${clean(intelligence.clientIpMasked)}）` : ''}`,
    `🕐 **IP 时区：** ${clean(intelligence.ipTimezone)}`,
    `🕐 **浏览器时区：** ${clean(intelligence.browserTimezone)}`,
    `📡 **网络：** ${clean(network || null)}`,
    `📱 **设备：** ${clean([intelligence.deviceType, intelligence.deviceOs, intelligence.browserName].join(' · '))}`,
    `🔗 **来源：** ${clean([intelligence.source, intelligence.sourceDetail].filter(Boolean).join(' / '))}`,
    `🔁 **历史提交：** ${intelligence.historyCount} 次`,
    '',
    `🔒 **风险：${riskLabel[intelligence.riskLevel]}（${intelligence.riskScore} 分）**`,
    `**风险信号：** ${signals}`,
    `⭐ **建议：** ${advice[intelligence.riskLevel]}`,
    '',
    `[打开后台查看完整询价](${input.adminUrl})`,
  ].join('\n');
}

export async function sendDingTalkMarkdown(
  webhook: string,
  secret: string,
  title: string,
  markdown: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(await signedDingTalkUrl(webhook, secret), {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: { title, text: markdown },
      at: { isAtAll: false },
    }),
  });
  if (!response.ok) throw new Error(`DingTalk returned HTTP ${response.status}.`);
  const result: { errcode?: number; errmsg?: string } = await response
    .json<{ errcode?: number; errmsg?: string }>()
    .catch(() => ({}));
  if (result.errcode !== 0) throw new Error(result.errmsg || `DingTalk error ${result.errcode ?? 'unknown'}.`);
}

/** Best-effort delivery: callers may run this through waitUntil after D1 commits. */
export async function notifyDingTalkInquiry(db: D1Database, input: DingTalkInquiry): Promise<boolean> {
  const settings = await getStoreSettings(db);
  if (!settings.dingTalkEnabled) return false;
  const [webhook, secret] = await Promise.all([
    getSecret(db, 'dingtalk_webhook'),
    getSecret(db, 'dingtalk_sign_secret'),
  ]);
  if (!webhook || !secret) return false;
  await sendDingTalkMarkdown(
    webhook,
    secret,
    `Auromai 新询盘 ${input.reference}`,
    buildDingTalkInquiryMarkdown(input),
  );
  return true;
}
