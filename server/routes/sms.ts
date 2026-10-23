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
import { handleTextGive, parseTextGive } from '../textGive/service';
import { chargeSavedCard, getTextGiveStripe, textGiveFund } from '../textGive/stripe';

const router = Router();

/** The public URL Twilio posts to — what the signature is computed over. */
export function smsWebhookUrl(): string {
  if (env.twilioWebhookUrl) return env.twilioWebhookUrl;
  return new URL('/api/sms/incoming', env.publicAppUrl).toString();
}

/**
 * URLs the signature may have been computed over: the configured one, plus the
 * address this request actually arrived at (Render terminates TLS; trust proxy
 * gives us https). Every candidate still requires the secret auth token.
 */
export function signatureUrlCandidates(req: Request): string[] {
  const urls = [smsWebhookUrl()];
  const host = req.get('host');
  if (host) urls.push(`${req.protocol}://${host}${req.originalUrl}`);
  return [...new Set(urls)];
}

router.post(
  '/incoming',
  express.urlencoded({ extended: false, limit: '64kb' }),
  async (req: Request, res: Response) => {
    const params = (req.body || {}) as Record<string, unknown>;

    if (!env.twilioAuthToken) {
      if (isProduction()) {
        console.error('[sms] TWILIO_AUTH_TOKEN is not set — refusing inbound SMS');
        return res.status(503).type('text/plain').send('SMS not configured');
      }
    } else {
      const signature = req.get('X-Twilio-Signature');
      const urls = signatureUrlCandidates(req);
      if (!urls.some((url) => isValidTwilioSignature(env.twilioAuthToken, signature, url, params))) {
        console.warn(
          `[sms] rejected request: Twilio signature ${signature ? 'did not match' : 'missing'} ` +
            `(checked ${urls.join(', ')}). If the URL is right, TWILIO_AUTH_TOKEN does not match ` +
            'the Auth Token of the Twilio account that owns the number.'
        );
        return res.status(403).type('text/plain').send('Forbidden');
      }
    }

    // Text an amount ("50") → give with the saved card (or set one up the first time).
    const from = String(params.From || '');
    const command = parseTextGive(params.Body);
    if (command && /^\+\d{10,15}$/.test(from) && getTextGiveStripe()) {
      try {
        const fund = await textGiveFund();
        const reply = await handleTextGive(from, command, String(params.MessageSid || ''), {
          churchName: env.churchName,
          fundName: fund.name,
          setupUrl: new URL('/text-give', env.smsGivingUrl || env.publicAppUrl).toString(),
          minCents: env.minGiftCents,
          instantMaxCents: env.textGiveInstantMaxCents,
          maxCents: env.textGiveMaxCents,
          instantPerDay: env.textGivePerDay,
          charge: chargeSavedCard,
        });
        console.log(`[sms] text-give ${String(params.MessageSid || '').slice(0, 40)} from ${maskPhone(from)} → ${command.kind}`);
        return res.status(200).type('text/xml').send(twiml(reply));
      } catch (err) {
        console.error('[sms] text-give failed', err instanceof Error ? err.message : err);
        return res
          .status(200)
          .type('text/xml')
          .send(twiml('Sorry, something went wrong. Nothing was charged. Please try again in a few minutes.'));
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
