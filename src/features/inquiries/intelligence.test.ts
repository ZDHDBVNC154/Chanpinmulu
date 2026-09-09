import { describe, expect, it } from 'vitest';
import { assessRisk, classifyDevice, deriveAttribution, maskIp } from './intelligence';

describe('inquiry attribution', () => {
  it('recognizes Instagram campaigns and keeps campaign detail', () => {
    const form = new FormData();
    form.set('utm_source', 'instagram');
    form.set('utm_medium', 'paid_social');
    form.set('utm_campaign', 'christmas-2027');
    expect(deriveAttribution(form)).toMatchObject({
      source: 'Instagram',
      sourceDetail: 'paid_social / christmas-2027',
    });
  });

  it('recognizes Facebook from the referrer without an SDK', () => {
    const form = new FormData();
    form.set('referrer', 'https://www.facebook.com/some-post');
    expect(deriveAttribution(form).source).toBe('Facebook');
  });
});

describe('device and IP normalization', () => {
  it('parses a mobile iPhone Safari user agent', () => {
    expect(classifyDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17 Mobile/15E148 Safari/604.1')).toEqual({
      deviceType: 'Mobile', deviceOs: 'iOS', browserName: 'Safari',
    });
  });

  it('masks IPv4 and IPv6 addresses', () => {
    expect(maskIp('203.0.113.42')).toBe('203.0.113.x');
    expect(maskIp('2001:db8:abcd:12::99')).toBe('2001:db8:abcd:12::');
  });
});

describe('risk assessment', () => {
  it('marks a cross-region timezone mismatch as medium risk', () => {
    expect(assessRisk({
      ipTimezone: 'America/Los_Angeles',
      browserTimezone: 'Europe/London',
      asOrganization: 'Example Telecom',
      botScore: null,
      historyCount: 1,
    })).toMatchObject({ riskLevel: 'medium', riskScore: 35 });
  });

  it('combines independent signals instead of claiming VPN certainty', () => {
    const result = assessRisk({
      ipTimezone: 'Asia/Shanghai',
      browserTimezone: 'Europe/London',
      asOrganization: 'Example Cloud Hosting',
      botScore: 12,
      historyCount: 4,
    });
    expect(result.riskLevel).toBe('high');
    expect(result.riskSignals.length).toBe(4);
  });
});
