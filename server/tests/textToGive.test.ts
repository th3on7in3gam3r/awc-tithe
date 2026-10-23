/**
 * Text-to-give SMS: keywords, replies, TwiML and Twilio signature checks.
 *
 * Run: npx tsx server/tests/textToGive.test.ts
 */
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token_123';
process.env.PUBLIC_APP_URL = 'https://awc-tithe.onrender.com';
process.env.CHURCH_NAME = 'Anointed Worship Center';

const {
  classifySms,
  isValidTwilioSignature,
  maskPhone,
  smsGivingUrl,
  smsReply,
  twilioSignature,
  twiml,
} = await import('../sms/textToGive');
const { normalizeGiftSource } = await import('../../shared/giftSource');
const { parseGiveLink } = await import('../../src/lib/giveLink');
const express = (await import('express')).default;
const { default: smsRoutes, smsWebhookUrl } = await import('../routes/sms');

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

// Keywords
check('GIVE', classifySms('GIVE') === 'give');
check('give lower-case with spaces', classifySms('  give ') === 'give');
check('give with punctuation', classifySms('Give!') === 'give');
check('give with extra words', classifySms('give 50') === 'give');
for (const w of ['TITHE', 'offering', 'Donate', 'giving']) check(`${w} → give`, classifySms(w) === 'give');
check('HELP', classifySms('help') === 'help');
check('STOP is opt-out', classifySms('Stop') === 'opt_out');
check('UNSUBSCRIBE is opt-out', classifySms('unsubscribe') === 'opt_out');
check('START is opt-in', classifySms('start') === 'opt_in');
check('anything else', classifySms('hello pastor') === 'other');
check('empty body', classifySms('') === 'other');
check('missing body', classifySms(undefined) === 'other');

// Replies
const opts = { churchName: 'Anointed Worship Center', givingUrl: 'https://awc-tithe.onrender.com/?from=sms' };
const give = smsReply('give', opts) || '';
check('give reply has link', give.includes('https://awc-tithe.onrender.com/?from=sms'), give);
check('give reply has STOP', /Reply STOP to opt out/.test(give), give);
check('help reply mentions rates and STOP', /rates may apply/.test(smsReply('help', opts) || '') && /STOP/.test(smsReply('help', opts) || ''));
check('STOP left to Twilio', smsReply('opt_out', opts) === null);
check('START left to Twilio', smsReply('opt_in', opts) === null);
check('other nudges to text an amount or GIVE', /Text an amount/.test(smsReply('other', opts) || ''));
check('giving url adds from=sms', smsGivingUrl('https://awc-tithe.onrender.com') === 'https://awc-tithe.onrender.com/?from=sms');
check('giving url keeps other params', smsGivingUrl('https://x.org/give?fund=1') === 'https://x.org/give?fund=1&from=sms');

// TwiML
check('empty twiml', twiml(null) === '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
check('twiml escapes xml', twiml('a & <b>').includes('<Message>a &amp; &lt;b&gt;</Message>'));
check('mask phone', maskPhone('+15085551234') === '***1234');
check('mask short phone', maskPhone('12') === '***');

// Reference signatures computed with Twilio's official library
// (twilio.getExpectedTwilioSignature) for the same inputs.
const docUrl = 'https://example.com/myapp.php?foo=1&bar=2';
const docParams = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };
check('matches Twilio library', twilioSignature('12345', docUrl, docParams) === 'vNe7KK2kJwCsxc9K3OLkkKB3qqI=', twilioSignature('12345', docUrl, docParams));
check(
  'matches Twilio library (SMS, special chars)',
  twilioSignature('tok', 'https://awc-tithe.onrender.com/api/sms/incoming', { MessageSid: 'SM1', Body: 'Give & go', From: '+1508' }) ===
    'xGWkdr+Q3sf/3aAFRc76JlLCt/I='
);
check('valid signature accepted', isValidTwilioSignature('12345', 'vNe7KK2kJwCsxc9K3OLkkKB3qqI=', docUrl, docParams));
check('tampered params rejected', !isValidTwilioSignature('12345', 'vNe7KK2kJwCsxc9K3OLkkKB3qqI=', docUrl, { ...docParams, Digits: '9' }));
check('missing signature rejected', !isValidTwilioSignature('12345', undefined, docUrl, docParams));
check('no token rejected', !isValidTwilioSignature('', 'x', docUrl, docParams));

// Gift source from the link
check('from=sms kept', parseGiveLink('?from=sms').source === 'sms');
check('from=connect kept', parseGiveLink('?from=connect').source === 'connect');
check('unknown from ignored', parseGiveLink('?from=evil').source === undefined);
check('normalize source', normalizeGiftSource(' SMS ') === 'sms' && normalizeGiftSource('x') === null);

// Webhook over HTTP
const app = express();
app.use('/api/sms', smsRoutes);
const server = app.listen(0);
const port = (server.address() as { port: number }).port;
const webhookUrl = smsWebhookUrl();
check('webhook url from PUBLIC_APP_URL', webhookUrl === 'https://awc-tithe.onrender.com/api/sms/incoming', webhookUrl);

async function post(params: Record<string, string>, signature?: string) {
  const res = await fetch(`http://127.0.0.1:${port}/api/sms/incoming`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(signature ? { 'X-Twilio-Signature': signature } : {}),
    },
    body: new URLSearchParams(params).toString(),
  });
  return { status: res.status, type: res.headers.get('content-type') || '', text: await res.text() };
}

try {
  const params = { MessageSid: 'SM123', From: '+15085551234', To: '+18552971920', Body: 'Give' };
  const good = await post(params, twilioSignature('test_auth_token_123', webhookUrl, params));
  check('signed GIVE → 200', good.status === 200, good);
  check('signed GIVE → xml', good.type.includes('text/xml'), good.type);
  check('signed GIVE → giving link', good.text.includes('https://awc-tithe.onrender.com/?from=sms'), good.text);

  const stop = { ...params, Body: 'STOP' };
  const stopRes = await post(stop, twilioSignature('test_auth_token_123', webhookUrl, stop));
  check('STOP → empty response', stopRes.text.endsWith('<Response></Response>'), stopRes.text);

  // Signed for the address the request actually reached (PUBLIC_APP_URL differs)
  const localUrl = `http://127.0.0.1:${port}/api/sms/incoming`;
  const viaHost = await post(params, twilioSignature('test_auth_token_123', localUrl, params));
  check('signature over actual request URL accepted', viaHost.status === 200, viaHost);
  const wrongToken = await post(params, twilioSignature('some_other_token', webhookUrl, params));
  check('wrong token → 403', wrongToken.status === 403, wrongToken);

  const bad = await post(params, 'not-a-real-signature');
  check('bad signature → 403', bad.status === 403, bad);
  const none = await post(params);
  check('no signature → 403', none.status === 403, none);
} finally {
  server.close();
}

if (failed > 0) {
  console.error(`\n${failed} text-to-give check(s) failed.`);
  process.exit(1);
}
console.log('\nText-to-give checks passed.');
