export type InquiryRiskLevel = 'low' | 'medium' | 'high';

export interface InquiryAttribution {
  source: string;
  sourceDetail: string | null;
  landingUrl: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface InquiryIntelligence extends InquiryAttribution {
  clientIpMasked: string | null;
  clientIpHash: string | null;
  ipCountry: string | null;
  ipRegion: string | null;
  ipCity: string | null;
  ipTimezone: string | null;
  ipAsn: number | null;
  ipAsOrganization: string | null;
  browserTimezone: string | null;
  deviceType: string;
  deviceOs: string;
  browserName: string;
  botScore: number | null;
  historyCount: number;
  riskLevel: InquiryRiskLevel;
  riskScore: number;
  riskSignals: string[];
}

interface CfRequestProperties {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  asn?: number;
  asOrganization?: string;
  botManagement?: { score?: number };
}

const text = (value: FormDataEntryValue | null, max: number): string | null => {
  const result = String(value ?? '').trim().slice(0, max);
  return result || null;
};

const hostname = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

export function deriveAttribution(form: FormData): InquiryAttribution {
  const landingUrl = text(form.get('landing_url'), 800);
  const referrer = text(form.get('referrer'), 800);
  const utmSource = text(form.get('utm_source'), 120);
  const utmMedium = text(form.get('utm_medium'), 120);
  const utmCampaign = text(form.get('utm_campaign'), 180);
  const refHost = hostname(referrer);
  const lowerSource = utmSource?.toLowerCase() ?? '';

  let source = 'Direct';
  let sourceDetail: string | null = null;
  if (/instagram|(^|\W)ig($|\W)/i.test(lowerSource) || refHost?.includes('instagram.com')) {
    source = 'Instagram';
  } else if (/facebook|(^|\W)fb($|\W)/i.test(lowerSource) || refHost?.includes('facebook.com')) {
    source = 'Facebook';
  } else if (/google|bing|baidu|yahoo|duckduckgo/i.test(lowerSource)) {
    source = 'Search campaign';
  } else if (utmSource) {
    source = utmSource.slice(0, 60);
  } else if (refHost && /google\.|bing\.|baidu\.|yahoo\.|duckduckgo\./.test(refHost)) {
    source = 'Organic search';
    sourceDetail = refHost;
  } else if (refHost) {
    source = 'Referral';
    sourceDetail = refHost;
  }

  if (!sourceDetail) {
    sourceDetail = [utmMedium, utmCampaign].filter(Boolean).join(' / ') || null;
  }
  return { source, sourceDetail, landingUrl, referrer, utmSource, utmMedium, utmCampaign };
}

export function classifyDevice(userAgent: string): Pick<InquiryIntelligence, 'deviceType' | 'deviceOs' | 'browserName'> {
  const ua = userAgent.toLowerCase();
  const deviceType = /ipad|tablet/.test(ua) ? 'Tablet' : /mobile|iphone|android/.test(ua) ? 'Mobile' : 'Desktop';
  const deviceOs = /iphone|ipad|ipod/.test(ua) ? 'iOS'
    : /android/.test(ua) ? 'Android'
    : /windows/.test(ua) ? 'Windows'
    : /mac os|macintosh/.test(ua) ? 'macOS'
    : /linux/.test(ua) ? 'Linux'
    : 'Unknown';
  const browserName = /edg\//.test(ua) ? 'Edge'
    : /firefox\//.test(ua) ? 'Firefox'
    : /crios\//.test(ua) ? 'Chrome'
    : /chrome\//.test(ua) ? 'Chrome'
    : /safari\//.test(ua) ? 'Safari'
    : 'Other';
  return { deviceType, deviceOs, browserName };
}

export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : null;
  }
  if (ip.includes(':')) return `${ip.split(':').slice(0, 4).join(':')}::`;
  return null;
}

export async function hashIp(ip: string | null, secret: string | null | undefined): Promise<string | null> {
  if (!ip || !secret) return null;
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, bytes.encode(ip));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const timezoneRegion = (timezone: string | null): string | null => {
  if (!timezone || !timezone.includes('/')) return null;
  return timezone.split('/')[0].toLowerCase();
};

export function assessRisk(input: {
  ipTimezone: string | null;
  browserTimezone: string | null;
  asOrganization: string | null;
  botScore: number | null;
  historyCount: number;
}): { riskLevel: InquiryRiskLevel; riskScore: number; riskSignals: string[] } {
  let riskScore = 0;
  const riskSignals: string[] = [];
  const ipRegion = timezoneRegion(input.ipTimezone);
  const browserRegion = timezoneRegion(input.browserTimezone);
  if (ipRegion && browserRegion && ipRegion !== browserRegion) {
    riskScore += 35;
    riskSignals.push('IP 与浏览器时区所属区域不一致');
  }
  if (input.asOrganization && /\b(vpn|proxy|hosting|host|cloud|datacenter|data center|server|amazon|azure|digitalocean|ovh|hetzner)\b/i.test(input.asOrganization)) {
    riskScore += 30;
    riskSignals.push('网络运营商名称疑似机房、云服务或代理网络');
  }
  if (input.botScore != null && input.botScore < 30) {
    riskScore += 45;
    riskSignals.push(`Cloudflare 机器人评分较低（${input.botScore}/99）`);
  }
  if (input.historyCount >= 4) {
    riskScore += 25;
    riskSignals.push(`相同邮箱或网络历史提交较多（${input.historyCount} 次）`);
  } else if (input.historyCount >= 2) {
    riskScore += 10;
    riskSignals.push(`相同邮箱或网络曾提交（${input.historyCount} 次）`);
  }
  const riskLevel: InquiryRiskLevel = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';
  return { riskLevel, riskScore, riskSignals };
}

export async function buildInquiryIntelligence(
  request: Request,
  form: FormData,
  secret: string | null | undefined,
  historyCount: number,
): Promise<InquiryIntelligence> {
  const cf = ((request as Request & { cf?: CfRequestProperties }).cf ?? {}) as CfRequestProperties;
  const ip = request.headers.get('cf-connecting-ip');
  const browserTimezone = text(form.get('browser_timezone'), 120);
  const device = classifyDevice(request.headers.get('user-agent') ?? '');
  const botScore = Number.isFinite(cf.botManagement?.score) ? Number(cf.botManagement?.score) : null;
  const risk = assessRisk({
    ipTimezone: cf.timezone ?? null,
    browserTimezone,
    asOrganization: cf.asOrganization ?? null,
    botScore,
    historyCount,
  });
  return {
    ...deriveAttribution(form),
    clientIpMasked: maskIp(ip),
    clientIpHash: await hashIp(ip, secret),
    ipCountry: cf.country ?? null,
    ipRegion: cf.region ?? null,
    ipCity: cf.city ?? null,
    ipTimezone: cf.timezone ?? null,
    ipAsn: Number.isFinite(cf.asn) ? Number(cf.asn) : null,
    ipAsOrganization: cf.asOrganization ?? null,
    browserTimezone,
    ...device,
    botScore,
    historyCount,
    ...risk,
  };
}
