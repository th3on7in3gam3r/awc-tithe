/**
 * Twilio inbound SMS webhook for the church's text-to-give number.
 * Twilio console → Phone Numbers → (855) 297-1920 → Messaging configuration:
 *   A message comes in → Webhook → https://<host>/api/sms/incoming → HTTP POST
 */
import express, { Router, type Request, type Response } from 'express';
import { env, isProduction } from '../config';
import {
  classifySms,
  isValidTwilioSignature,
  maskPhone,
  smsGivingUrl,
  smsReply,
  twiml,
} from '../sms/textToGive';

const router = Router();

/** The public URL Twilio posts to — what the signature is computed over. */
export function smsWebhookUrl(): string {
  if (env.twilioWebhookUrl) return env.twilioWebhookUrl;
  return new URL('/api/sms/incoming', env.publicAppUrl).toString();
}

router.post(
  '/incoming',
  express.urlencoded({ extended: false, limit: '64kb' }),
  (req: Request, res: Response) => {
    const params = (req.body || {}) as Record<string, unknown>;

    if (!env.twilioAuthToken) {
      if (isProduction()) {
        console.error('[sms] TWILIO_AUTH_TOKEN is not set — refusing inbound SMS');
        return res.status(503).type('text/plain').send('SMS not configured');
      }
    } else {
      const signature = req.get('X-Twilio-Signature');
      if (!isValidTwilioSignature(env.twilioAuthToken, signature, smsWebhookUrl(), params)) {
        console.warn('[sms] rejected request with an invalid Twilio signature');
        return res.status(403).type('text/plain').send('Forbidden');
      }
    }

    const keyword = classifySms(params.Body);
    const message = smsReply(keyword, {
      churchName: env.churchName,
      givingUrl: smsGivingUrl(env.smsGivingUrl || env.publicAppUrl),
    });

    console.log(
      `[sms] inbound ${String(params.MessageSid || '').slice(0, 40)} from ${maskPhone(params.From)} → ${keyword}`
    );

    res.status(200).type('text/xml').send(twiml(message));
  }
);

export default router;
