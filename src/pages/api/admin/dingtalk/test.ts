import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getSecret } from '../../../../features/secrets/store';
import { sendDingTalkMarkdown } from '../../../../features/notifications/dingtalk';

export const prerender = false;

export const POST: APIRoute = async ({ redirect }) => {
  const [webhook, secret] = await Promise.all([
    getSecret(env.DB, 'dingtalk_webhook'),
    getSecret(env.DB, 'dingtalk_sign_secret'),
  ]);
  if (!webhook || !secret) {
    return redirect('/admin/settings?msg=' + encodeURIComponent('请先保存 Webhook 和加签密钥。') + '#dingtalk', 303);
  }
  try {
    await sendDingTalkMarkdown(
      webhook,
      secret,
      'Auromai 钉钉通知测试',
      '### ✅ Auromai 钉钉通知测试\n\nCloudflare Worker 已成功连接到这个群机器人。',
    );
    return redirect('/admin/settings?msg=' + encodeURIComponent('钉钉测试消息已发送。') + '#dingtalk', 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return redirect('/admin/settings?msg=' + encodeURIComponent(`发送失败：${message}`) + '#dingtalk', 303);
  }
};
