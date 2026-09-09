import { describe, expect, it, vi } from 'vitest';
import {
  buildDingTalkInquiryMarkdown,
  isAllowedDingTalkWebhook,
  sendDingTalkMarkdown,
  signedDingTalkUrl,
} from './dingtalk';

const WEBHOOK = 'https://oapi.dingtalk.com/robot/send?access_token=test-token';
const SECRET = 'SEC-test-secret';

describe('DingTalk signing', () => {
  it('uses the documented timestamp-newline-secret HMAC SHA-256 signature', async () => {
    const timestamp = 1700000000000;
    const url = new URL(await signedDingTalkUrl(WEBHOOK, SECRET, timestamp));
    expect(url.searchParams.get('timestamp')).toBe(String(timestamp));
    expect(url.searchParams.get('sign')).toBe('Mrhy389nC5p7fqYHgciQpNWFiBNjbTx4Rn5BqEH45jY=');
  });

  it('only accepts the official HTTPS custom-robot endpoint', () => {
    expect(isAllowedDingTalkWebhook(WEBHOOK)).toBe(true);
    expect(isAllowedDingTalkWebhook('http://oapi.dingtalk.com/robot/send?access_token=x')).toBe(false);
    expect(isAllowedDingTalkWebhook('https://evil.example/robot/send?access_token=x')).toBe(false);
  });

  it('posts a markdown payload and checks DingTalk application errors', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 }));
    await sendDingTalkMarkdown(WEBHOOK, SECRET, 'Test', 'hello', fetcher as typeof fetch);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('timestamp=');
    expect(JSON.parse(String(init?.body))).toMatchObject({ msgtype: 'markdown', markdown: { title: 'Test', text: 'hello' } });
  });
});

describe('DingTalk inquiry content', () => {
  it('includes source, device, history and explainable risk', () => {
    const markdown = buildDingTalkInquiryMarkdown({
      publicId: 'inq_01TEST', reference: 'RFQ-20260909-TEST', adminUrl: 'https://product.auromai.com/admin/inquiries/inq_01TEST',
      contact: { contactName: 'John Smith', company: 'ABC Lighting', email: 'john@example.com', phone: null, country: 'US', targetDelivery: null, message: null },
      lines: [{ productId: 1, productPublicId: 'prod_01TEST', sku: 'X1', name: 'Custom Christmas Lights', optionLabel: null, quantity: 500 }],
      intelligence: {
        clientIpMasked: '203.0.113.x', clientIpHash: 'hash', ipCountry: 'US', ipRegion: 'California', ipCity: null,
        ipTimezone: 'America/Los_Angeles', ipAsn: 12345, ipAsOrganization: 'Example Telecom', browserTimezone: 'Europe/London',
        deviceType: 'Mobile', deviceOs: 'iOS', browserName: 'Safari', source: 'Instagram', sourceDetail: 'Christmas Campaign',
        landingUrl: null, referrer: null, utmSource: 'instagram', utmMedium: 'paid', utmCampaign: 'Christmas Campaign',
        botScore: null, historyCount: 1, riskLevel: 'medium', riskScore: 35, riskSignals: ['IP 与浏览器时区所属区域不一致'],
      },
    });
    expect(markdown).toContain('Instagram / Christmas Campaign');
    expect(markdown).toContain('Mobile · iOS · Safari');
    expect(markdown).toContain('风险：中');
  });
});
