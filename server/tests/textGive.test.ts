/**
 * Text-an-amount giving: parsing, first-time setup link, instant charge,
 * $2,000 limit with OK, daily limit, failed cards, CHANGE / UNLINK, and the
 * Twilio webhook end to end (fake Stripe charge).
 *
 * Run: npx tsx server/tests/textGive.test.ts
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DEV_MEMORY_STORE = 'true';
process.env.TWILIO_AUTH_TOKEN = 'tg_token';
process.env.PUBLIC_APP_URL = 'https://awc-tithe.onrender.com';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
process.env.CASHAPP_RECIPIENT = '$awcgiveplus';
process.env.CASHAPP_RECIPIENT_NAME = 'Anointed Worship Center';
process.env.VENMO_HANDLE = 'anointedworshipcenter';
process.env.ZELLE_RECIPIENT = 'give@example.org';
process.env.ZELLE_RECIPIENT_NAME = 'Anointed Worship Center';
process.env.TEXT_GIVE_MIN = '2';

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) console.log(`OK  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

async function main() {
  const { parseTextGive, handleTextGive, money } = await import('../textGive/service');
  const store = await import('../textGive/store');

  // --- Reading amounts -------------------------------------------------------
  const amt = (s: string) => {
    const c = parseTextGive(s);
    return c && c.kind === 'amount' ? c.cents : null;
  };
  check('50', amt('50') === 5000);
  check('$50', amt('$50') === 5000);
  check('50.25', amt('50.25') === 5025);
  check('50.5', amt('50.5') === 5050);
  check('50.', amt('50.') === 5000);
  check('give 100', amt('give 100') === 10000);
  check('Tithe $1,200', amt('Tithe $1,200') === 120000);
  check('20 dollars', amt('20 dollars') === 2000);
  check('plain GIVE is not an amount', parseTextGive('GIVE') === null);
  check('a sentence is not an amount', parseTextGive('see you at 10') === null);
  check('two numbers is not an amount', parseTextGive('40 for 2 people') === null);
  const withFund = parseTextGive('40 Marrieds Dinner');
  check('amount + fund words', withFund?.kind === 'amount' && withFund.cents === 4000 && withFund.fundText === 'Marrieds Dinner', withFund);
  const wordFirst = parseTextGive('tithe $50');
  check('word before amount', wordFirst?.kind === 'amount' && wordFirst.cents === 5000 && wordFirst.fundText === 'tithe', wordFirst);
  check('OK confirms', parseTextGive('ok')?.kind === 'yes');
  check('YES confirms', parseTextGive('Yes')?.kind === 'yes');
  check('CHANGE', parseTextGive('change')?.kind === 'change');
  check('UNLINK', parseTextGive('Unlink')?.kind === 'unlink');
  check('money format', money(200000) === '$2,000.00');

  // --- Which fund ----------------------------------------------------------------
  const fundsStore = await import('../funds/store');
  const { chooseFund, fundWords, fundHelpText } = await import('../textGive/funds');
  const marrieds = await fundsStore.createFund({ name: 'Marrieds Dinner 2026', isEvent: true, sortOrder: 100 });
  const thanks = await fundsStore.createFund({ name: 'Thanksgiving Dinner 2026', isEvent: true, sortOrder: 100 });
  const building = await fundsStore.createFund({ name: 'Building Fund', sortOrder: 5 });
  await fundsStore.createFund({ name: 'Old Retreat 2024', active: false });
  const active = await fundsStore.listActiveFunds();
  const pick = (text: string) => chooseFund(fundWords(text), active);
  const idOf = (text: string) => {
    const c = pick(text);
    return c.kind === 'ok' ? c.fund.id : c.kind;
  };
  check('no word → Tithes & Offerings', idOf('') === 'fund-tithes');
  check('"tithe" → Tithes & Offerings', idOf('tithe') === 'fund-tithes');
  check('"offering" → Tithes & Offerings', idOf('Offering') === 'fund-tithes');
  check('"give" alone → default', idOf('give') === 'fund-tithes');
  check('"marrieds" → Marrieds Dinner', idOf('marrieds') === marrieds.id);
  check('"married dinner" → Marrieds Dinner', idOf('married dinner') === marrieds.id);
  check('"thanksgiving" → Thanksgiving Dinner', idOf('thanksgiving') === thanks.id);
  {
    const grand = await fundsStore.createFund({ name: 'AWC GRAND FAMILY CELEBRATION 2026', isEvent: true, sortOrder: 101 });
    const { fundKeyword } = await import('../textGive/funds');
    check('AWC event fund is texted by its first real word', fundKeyword(grand) === 'GRAND', fundKeyword(grand));
    const withGrand = await fundsStore.listActiveFunds();
    const g = chooseFund(fundWords('grand'), withGrand);
    check('"grand" → Grand Family Celebration', g.kind === 'ok' && g.fund.id === grand.id, g);
    await fundsStore.updateFund(grand.id, { active: false });
  }
  check('"building" → Building Fund', idOf('building fund') === building.id);
  check('"dinner" matches two → ask', idOf('dinner') === 'many');
  check('closed fund is never chosen', idOf('retreat') === 'none');
  check('unknown word → ask', idOf('pizza') === 'none');
  const help = fundHelpText('40', pick('dinner'), 'dinner');
  check('help lists the words to text', /40 MARRIEDS for Marrieds Dinner 2026/.test(help) && /40 THANKSGIVING/.test(help) && /Nothing was charged/.test(help), help);

  // --- Flows with a fake card charge -----------------------------------------
  const charges: Array<{ cents: number; key: string }> = [];
  const chargedFunds: string[] = [];
  let failNext: 'needs_card' | 'error' | null = null;
  const deps = {
    churchName: 'Anointed Worship Center',
    listFunds: (await import('../funds/store')).listActiveFunds,
    setupUrl: 'https://awc-tithe.onrender.com/text-give',
    minCents: 500,
    instantMaxCents: 200000,
    maxCents: 1000000,
    instantPerDay: 5,
    charge: async (_g: unknown, cents: number, key: string, fund: { id: string }) => {
      chargedFunds.push(fund.id);
      if (failNext) {
        const reason = failNext;
        failNext = null;
        return { ok: false as const, reason };
      }
      charges.push({ cents, key });
      return { ok: true as const, paymentIntentId: `pi_${charges.length}`, principalCents: cents, feeCents: 0 };
    },
  };
  const PHONE = '+15085551234';

  const first = await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 5000 }, 'SM1', deps);
  check('new number gets a setup link', /text-give\?t=[\w-]{20,}/.test(first) && first.includes('$50.00'), first);
  check('no charge before setup', charges.length === 0);
  const token = first.match(/t=([\w-]+)/)![1];
  const link = await store.findOpenLink(token);
  check('link remembers phone and amount', link?.phone === PHONE && link?.amountCents === 5000, link);
  check('wrong token finds nothing', (await store.findOpenLink('x'.repeat(32))) === null);

  await store.saveGiver({
    phone: PHONE,
    method: 'card',
    stripeCustomerId: 'cus_1',
    paymentMethodId: 'pm_1',
    cardBrand: 'visa',
    cardLast4: '4242',
    donorName: 'Ruth Ama',
    donorEmail: 'ruth@example.com',
    coverFees: false,
  });
  check('link is single-use', (await store.useLink(link!.id)) === true && (await store.useLink(link!.id)) === false);

  const gift = await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 5000 }, 'SM2', deps);
  check('set-up number is charged right away', charges.length === 1 && charges[0].cents === 5000, charges);
  check('idempotency key from the message id', charges[0].key === 'textgive-SM2');
  check('thank-you names amount, fund and card', /Thank you! \$50\.00 given to Tithes & Offerings/.test(gift) && gift.includes('Visa ••4242'), gift);

  check('plain amount goes to Tithes & Offerings', chargedFunds[0] === 'fund-tithes', chargedFunds);
  const small = await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 100 }, 'SM3', deps);
  check('under the minimum is refused', /smallest gift/.test(small) && charges.length === 1, small);

  const big = await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 250000 }, 'SM4', deps);
  check('over $2,000 asks for OK', /reply OK/.test(big) && charges.length === 1, big);
  const ok = await handleTextGive(PHONE, { kind: 'yes' }, 'SM5', deps);
  check('OK charges the waiting gift', charges.length === 2 && charges[1].cents === 250000 && /Thank you/.test(ok), ok);
  const okAgain = await handleTextGive(PHONE, { kind: 'yes' }, 'SM6', deps);
  check('a second OK charges nothing', charges.length === 2 && /No gift is waiting/.test(okAgain), okAgain);

  check('exactly $2,000 is instant', /Thank you/.test(await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 200000 }, 'SM7', deps)));

  const huge = await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 2000000 }, 'SM8', deps);
  check('over the text maximum points to the giving page', /please give at/.test(huge) && charges.length === 3, huge);

  failNext = 'needs_card';
  const declined = await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 2000 }, 'SM9', deps);
  check('declined card → nothing taken + new link', /Nothing was taken/.test(declined) && /text-give\?t=/.test(declined), declined);
  failNext = 'error';
  const outage = await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 2000 }, 'SM10', deps);
  check('Stripe trouble → nothing taken, try again', /Nothing was taken/.test(outage) && !/text-give\?t=/.test(outage), outage);

  // Daily limit: 3 instant gifts so far today (SM2, SM5 via OK, SM7) → 2 more, then OK needed
  await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 1000 }, 'SM11', deps);
  await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 1000 }, 'SM12', deps);
  const sixth = await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 1000 }, 'SM13', deps);
  check('after 5 gifts in a day, asks for OK', /reply OK/.test(sixth) && charges.length === 5, { sixth, n: charges.length });

  const change = await handleTextGive(PHONE, { kind: 'change' }, 'SM14', deps);
  const changeToken = change.match(/t=([\w-]+)/)?.[1] || '';
  check('CHANGE sends a card-only link', (await store.findOpenLink(changeToken))?.amountCents === 0, change);

  const unlink = await handleTextGive(PHONE, { kind: 'unlink' }, 'SM15', deps);
  check('UNLINK turns it off', /turned off/.test(unlink) && (await store.getGiver(PHONE)) === null, unlink);
  const after = await handleTextGive(PHONE, { kind: 'amount', fundText: 'tithe', cents: 5000 }, 'SM16', deps);
  // 3 links already went to this number this hour (first, declined card, CHANGE) — so the hourly cap applies.
  check('after UNLINK, an amount is not charged (setup needed again)', !/Thank you!/.test(after) && charges.length === 5, after);

  const OTHER = '+16175550199';
  for (let i = 0; i < 3; i++) await handleTextGive(OTHER, { kind: 'amount', fundText: 'tithe', cents: 5000 }, `SMX${i}`, deps);
  const flood = await handleTextGive(OTHER, { kind: 'amount', fundText: 'tithe', cents: 5000 }, 'SMX4', deps);
  check('at most 3 setup links per hour to one number', !/text-give\?t=/.test(flood) && /several links/.test(flood), flood);

  // Fund choice on its own number, so the limits above aren't affected.
  const PHONE_F = '+15085557777';
  await store.saveGiver({
    phone: PHONE_F, method: 'card', stripeCustomerId: 'cus_f', paymentMethodId: 'pm_f', cardBrand: 'visa',
    cardLast4: '1111', donorName: 'Ruth Ama', donorEmail: 'ruth@example.com', coverFees: false,
  });
  const fundsBefore = chargedFunds.length;
  const dinner = await handleTextGive(PHONE_F, { kind: 'amount', fundText: 'marrieds', cents: 4000 }, 'SMF1', deps);
  check('"40 marrieds" is charged to Marrieds Dinner', /given to Marrieds Dinner 2026/.test(dinner) && chargedFunds.at(-1) === marrieds.id, dinner);
  const unclear = await handleTextGive(PHONE_F, { kind: 'amount', fundText: 'dinner', cents: 4000 }, 'SMF2', deps);
  check('unclear fund is not charged', /matches more than one fund/.test(unclear) && chargedFunds.length === fundsBefore + 1, unclear);
  const unknown = await handleTextGive(PHONE_F, { kind: 'amount', fundText: 'pizza', cents: 4000 }, 'SMF3', deps);
  check('unknown fund is not charged', /couldn't find a fund called "pizza"/.test(unknown) && chargedFunds.length === fundsBefore + 1, unknown);
  const bigFund = await handleTextGive(PHONE_F, { kind: 'amount', fundText: 'building', cents: 300000 }, 'SMF4', deps);
  check('OK request names the fund', /To give \$3,000\.00 to Building Fund/.test(bigFund), bigFund);
  const okFund = await handleTextGive(PHONE_F, { kind: 'yes' }, 'SMF5', deps);
  check('OK charges the named fund', chargedFunds.at(-1) === building.id && /Building Fund/.test(okFund), okFund);
  // --- No fund word → "Which fund?" ---------------------------------------------
  const PHONE_Q = '+15085558888';
  await store.saveGiver({
    phone: PHONE_Q, method: 'card', stripeCustomerId: 'cus_q', paymentMethodId: 'pm_q', cardBrand: 'visa',
    cardLast4: '2222', donorName: 'Ruth Ama', donorEmail: 'ruth@example.com', coverFees: false,
  });
  const qBefore = chargedFunds.length;
  const question = await handleTextGive(PHONE_Q, { kind: 'amount', fundText: '', cents: 5000 }, 'SMQ1', deps);
  check('plain amount asks which fund', /Which fund is your \$50\.00 for\? Reply with a number: 1 Tithes & Offerings/.test(question), question);
  check('…and charges nothing yet', chargedFunds.length === qBefore);
  check('menu lists open funds, not closed ones', /Marrieds Dinner 2026/.test(question) && !/Old Retreat/.test(question), question);
  const menuOrder = question.match(/(\d) Marrieds Dinner 2026/)?.[1];
  const answered = await handleTextGive(PHONE_Q, { kind: 'amount', fundText: '', cents: Number(menuOrder) * 100 }, 'SMQ2', deps);
  check('reply with the number gives $50 to that fund', /\$50\.00 given to Marrieds Dinner 2026/.test(answered) && chargedFunds.at(-1) === marrieds.id, answered);
  check('the number is not charged as a gift', chargedFunds.length === qBefore + 1);
  const again = await handleTextGive(PHONE_Q, { kind: 'amount', fundText: '', cents: 100 }, 'SMQ3', deps);
  check('after answering, a lone "1" is a $1 gift attempt (below minimum), not a choice', /smallest gift/.test(again), again);

  const { answerFundQuestionWithWords } = await import('../textGive/service');
  await handleTextGive(PHONE_Q, { kind: 'amount', fundText: '', cents: 2500 }, 'SMQ4', deps);
  const byWord = await answerFundQuestionWithWords(PHONE_Q, 'tithe', 'SMQ5', deps);
  check('reply with a word gives to that fund', /\$25\.00 given to Tithes & Offerings/.test(byWord || '') && chargedFunds.at(-1) === 'fund-tithes', byWord);
  check('no open question → word reply handled as usual', (await answerFundQuestionWithWords(PHONE_Q, 'tithe', 'SMQ6', deps)) === null);
  await handleTextGive(PHONE_Q, { kind: 'amount', fundText: '', cents: 2500 }, 'SMQ7', deps);
  const nonsense = await answerFundQuestionWithWords(PHONE_Q, 'pizza', 'SMQ8', deps);
  check('unclear word → asked again, nothing charged', /Which fund is your \$25\.00 for/.test(nonsense || '') && chargedFunds.length === qBefore + 2, nonsense);
  const tooBig = await handleTextGive(PHONE_Q, { kind: 'amount', fundText: '', cents: 9900 }, 'SMQ9', deps);
  check('a number beyond the menu is a new amount (asks again)', /Which fund is your \$99\.00 for/.test(tooBig), tooBig);

  // --- Preferred way to give: bank, Cash App, Venmo, Zelle ----------------------
  const { p2pGiftReply, availableP2P } = await import('../textGive/p2p');
  const { env } = await import('../config');
  check('TEXT_GIVE_MIN=2 allows a $2 test', env.textGiveMinCents === 200, env.textGiveMinCents);
  check('all three app methods are offered', availableP2P().join(',') === 'cash_app,venmo,zelle', availableP2P());
  const p2pDeps = { ...deps, p2pReply: p2pGiftReply };
  const base = {
    stripeCustomerId: '', paymentMethodId: '', cardBrand: '', cardLast4: '',
    donorName: 'Ruth Ama', donorEmail: 'ruth@example.com', coverFees: false,
  };
  const before = charges.length;

  await store.saveGiver({ ...base, phone: '+17815550101', method: 'cash_app' });
  const cash = await handleTextGive('+17815550101', { kind: 'amount', fundText: 'tithe', cents: 2000 }, 'SMC1', p2pDeps);
  check('Cash App: tap link with the amount', cash.includes('https://cash.app/$awcgiveplus/20.00'), cash);
  check('Cash App: memo code for Finance', /AWC-[A-Z0-9]{4}/.test(cash), cash);
  check('Cash App: confirms the method', /Using your Cash App\. Text CHANGE to switch/.test(cash), cash);
  check('Cash App: nothing charged by us', charges.length === before);
  const big2 = await handleTextGive('+17815550101', { kind: 'amount', fundText: 'tithe', cents: 300000 }, 'SMC2', p2pDeps);
  check('Cash App: no OK needed (giver sends it)', !/reply OK/.test(big2) && /cash\.app/.test(big2), big2);

  await store.saveGiver({ ...base, phone: '+17815550102', method: 'venmo' });
  const venmo = await handleTextGive('+17815550102', { kind: 'amount', fundText: 'tithe', cents: 2500 }, 'SMV1', p2pDeps);
  check('Venmo: pay link with amount and memo', /venmo\.com\/\?txn=pay/.test(venmo) && venmo.includes('amount=25.00') && /note=AWC-/.test(venmo), venmo);

  await store.saveGiver({ ...base, phone: '+17815550103', method: 'zelle' });
  const zelle = await handleTextGive('+17815550103', { kind: 'amount', fundText: 'tithe', cents: 3000 }, 'SMZ1', p2pDeps);
  check('Zelle: who to send to, amount and memo', zelle.includes('give@example.org') && zelle.includes('$30.00') && /memo AWC-/.test(zelle), zelle);

  const { listManualGiftsForAdmin } = await import('../manualGifts/store');
  const open = await listManualGiftsForAdmin('open');
  check('each app gift is waiting for Finance to match', open.length === 4 && open.every((g) => g.fundId === 'fund-tithes'), open.length);

  await store.saveGiver({ ...base, phone: '+17815550104', method: 'us_bank_account', stripeCustomerId: 'cus_b', paymentMethodId: 'pm_b', cardLast4: '6789' });
  const bank = await handleTextGive('+17815550104', { kind: 'amount', fundText: 'tithe', cents: 10000 }, 'SMB1', p2pDeps);
  check('bank account is charged right away', charges.length === before + 1 && /bank ••6789/.test(bank) && /3–5 business days/.test(bank), bank);

  // --- Twilio webhook end to end -------------------------------------------------
  store.__resetTextGiveMemoryForTests();
  const express = (await import('express')).default;
  const { default: smsRoutes } = await import('../routes/sms');
  const { default: textGiveRoutes } = await import('../routes/textGive');
  const { twilioSignature } = await import('../sms/textToGive');
  const app = express();
  app.use('/api/sms', smsRoutes);
  app.use(express.json());
  app.use('/api/text-give', textGiveRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const port = (server.address() as { port: number }).port;
  const url = 'https://awc-tithe.onrender.com/api/sms/incoming';
  async function sms(body: string, sid: string) {
    const params = { MessageSid: sid, From: '+19785550123', To: '+18552971920', Body: body };
    const res = await fetch(`http://127.0.0.1:${port}/api/sms/incoming`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Twilio-Signature': twilioSignature('tg_token', url, params),
      },
      body: new URLSearchParams(params).toString(),
    });
    return res.text();
  }
  try {
    const reply = await sms('$75 tithe', 'SMA1');
    check('webhook: amount from new number → setup link', /set up text giving once/.test(reply) && /\$75\.00/.test(reply), reply);
    const t = reply.match(/t=([\w-]+)/)?.[1] || '';
    const info = await fetch(`http://127.0.0.1:${port}/api/text-give/link?t=${t}`).then((r) => r.json());
    check('setup page sees amount and masked phone', info.amountCents === 7500 && info.phoneHint === '(•••) •••-0123' && info.mode === 'give', info);
    check('setup page knows the $2,000 limit', info.instantMaxCents === 200000, info);
    check('setup page offers all five ways', info.methods.join(',') === 'card,us_bank_account,cash_app,venmo,zelle', info.methods);
    const chose = await fetch(`http://127.0.0.1:${port}/api/text-give/choose-p2p`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t, method: 'cash_app', name: 'Ruth Ama', email: 'ruth@example.com' }),
    }).then((r) => r.json());
    check('choosing Cash App saves it and returns tap-to-send details', chose.ok && chose.instructions?.link === 'https://cash.app/$awcgiveplus/75.00' && /^AWC-/.test(chose.instructions?.memo), chose);
    check('saved preference is Cash App', (await store.getGiver('+19785550123'))?.method === 'cash_app');
    const reuse = await fetch(`http://127.0.0.1:${port}/api/text-give/choose-p2p`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t, method: 'venmo', name: 'X Y', email: 'x@example.com' }),
    });
    check('setup link works once', reuse.status === 404);
    const bad = await fetch(`http://127.0.0.1:${port}/api/text-give/link?t=${'z'.repeat(32)}`);
    check('unknown link → 404', bad.status === 404);
    const plain = await sms('20', 'SMA1b');
    check('webhook: plain amount asks which fund', /Which fund is your \$20\.00 for/.test(plain), plain);
    const give = await sms('GIVE', 'SMA2');
    check('GIVE still sends the giving page', /Give securely here/.test(give), give);
    const help = await sms('HELP', 'SMA3');
    check('HELP mentions texting an amount', /Text an amount/.test(help), help);
  } finally {
    server.close();
  }

  if (failed > 0) {
    console.error(`\n${failed} text-give check(s) failed.`);
    process.exit(1);
  }
  console.log('\nText-an-amount giving checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
