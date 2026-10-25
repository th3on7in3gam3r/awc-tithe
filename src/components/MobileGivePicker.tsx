/**
 * Phone start screen for the giving page: the church crest, "AWC Tithe", and one
 * big row per way to give (card, Zelle, Cash App, Venmo, other options).
 * Tapping a row opens the normal gift form with that method chosen.
 * Desktop and RSVP / balance payments never see this screen.
 */
import React, { useEffect, useState } from 'react';
import { ChevronRight, Landmark, Lock, MessageSquare, MoreHorizontal, Church, Mail } from 'lucide-react';
import type { ApiConfig } from '../lib/api';

export type PickerMethodId = 'card' | 'us_bank_account' | 'cashapp' | 'zelle' | 'venmo' | 'cash_app';

export interface PickerMethod {
  id: PickerMethodId;
  label: string;
  tag: string;
  disabledReason?: string;
}

/** True on phone-width screens (under 640px). Follows rotation and window resizes. */
export function useIsPhone(): boolean {
  const query = '(max-width: 639px)';
  const [isPhone, setIsPhone] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = () => setIsPhone(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return isPhone;
}

/** Simple colored tile with a letter or icon for each way to give. */
function MethodTile({ id }: { id: PickerMethodId | 'other' }) {
  const base = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-white shadow-sm';
  if (id === 'card') {
    return (
      <span className={`${base} bg-[#2E6BE6]`} aria-hidden="true">
        <span className="flex flex-col gap-[5px]">
          <span className="block h-[5px] w-7 rounded-full bg-white" />
          <span className="block h-[5px] w-7 -translate-x-1 rounded-full bg-white/90" />
          <span className="block h-[5px] w-7 rounded-full bg-white" />
        </span>
      </span>
    );
  }
  if (id === 'us_bank_account') {
    return (
      <span className={`${base} bg-awc-primary`} aria-hidden="true">
        <Landmark className="h-6 w-6" />
      </span>
    );
  }
  if (id === 'zelle') {
    return (
      <span className={`${base} bg-[#6D1ED4] text-2xl font-black`} aria-hidden="true">
        Z
      </span>
    );
  }
  if (id === 'cashapp' || id === 'cash_app') {
    return (
      <span className={`${base} bg-[#00C244] text-[26px] font-black`} aria-hidden="true">
        $
      </span>
    );
  }
  if (id === 'venmo') {
    return (
      <span className={`${base} bg-[#008CFF] text-2xl font-black italic`} aria-hidden="true">
        V
      </span>
    );
  }
  return (
    <span className={`${base} bg-[#5F5A58]`} aria-hidden="true">
      <MoreHorizontal className="h-7 w-7" />
    </span>
  );
}

const ROW_LABEL: Partial<Record<PickerMethodId, { title: string; sub: string }>> = {
  card: { title: 'Credit or Debit Card', sub: 'Apple Pay too · Secured by Stripe' },
  us_bank_account: { title: 'Bank Account', sub: 'Lowest fee · Secured by Stripe' },
  cashapp: { title: 'Cash App', sub: 'Pay here · instant receipt' },
};

const rowClass =
  'flex w-full min-h-[76px] items-center gap-4 rounded-[20px] border border-awc-line bg-awc-paper px-4 py-3 text-left shadow-[0_2px_10px_rgba(59,10,13,0.07)] transition-[transform,border-color] active:scale-[0.99] disabled:opacity-55';

export const MobileGivePicker: React.FC<{
  methods: PickerMethod[];
  loading: boolean;
  apiConfig: ApiConfig | null;
  onPick: (id: PickerMethodId) => void;
  onViewMyGiving?: () => void;
}> = ({ methods, loading, apiConfig, onPick, onViewMyGiving }) => {
  const [otherOpen, setOtherOpen] = useState(false);
  // Main list: card, Zelle, Cash App, Venmo. Bank account lives under "Other Giving Options".
  const ORDER: PickerMethodId[] = ['card', 'zelle', 'cashapp', 'cash_app', 'venmo'];
  const main = methods
    .filter((m) => m.id !== 'us_bank_account')
    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const bank = methods.find((m) => m.id === 'us_bank_account');
  const church = apiConfig?.church;
  const payee = (church?.legalEntityName || church?.name || 'Anointed Worship Center').replace(/\.$/, '');
  const mailLines = [church?.address, church?.cityStateZip].filter((v) => v && v.trim());
  const textNumber = apiConfig?.textGiveNumber || null;
  const email = church?.email || 'stewardship@anointedworshipcenter.com';

  return (
    <section aria-label="Choose how to give" className="min-h-[calc(100dvh-72px)] bg-awc-cream px-4 pb-10 pt-8">
      <div className="mx-auto w-full max-w-[440px]">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-b from-awc-gold to-awc-gold-soft p-[3px] shadow-[0_8px_24px_rgba(154,111,34,0.35)]">
            <img
              src="/images/awc-crest.png"
              alt="Anointed Worship Center"
              className="h-full w-full rounded-full bg-awc-paper object-contain p-1.5"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/images/awc-logo.png';
              }}
            />
          </span>
          <h1 className="mt-5 font-serif-display text-[2.6rem] font-semibold leading-none text-awc-primary">AWC Tithe</h1>
          <p className="mt-2 font-serif-display text-lg italic text-awc-accent">Give Securely. Support the Mission.</p>
        </div>

        <ul className="mt-8 space-y-3" aria-busy={loading}>
          {loading
            ? [0, 1, 2, 3].map((i) => (
                <li key={i} className="h-[76px] animate-pulse rounded-[20px] bg-awc-sand" aria-hidden="true" />
              ))
            : main.map((m) => {
                const label = ROW_LABEL[m.id];
                return (
                  <li key={m.id}>
                    <button type="button" className={rowClass} disabled={Boolean(m.disabledReason)} onClick={() => onPick(m.id)}>
                      <MethodTile id={m.id} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[18px] font-semibold leading-tight text-awc-ink">{label?.title || m.label}</span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-awc-muted">
                          {m.disabledReason || label?.sub || m.tag}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-awc-muted" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}

          {!loading ? (
            <li>
              <button
                type="button"
                className={rowClass}
                aria-expanded={otherOpen}
                aria-controls="other-giving-options"
                onClick={() => setOtherOpen((o) => !o)}
              >
                <MethodTile id="other" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[18px] font-semibold leading-tight text-awc-ink">Other Giving Options</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-awc-muted">
                    {bank ? 'Bank account, ' : ''}
                    {textNumber ? 'text, ' : ''}in person or by mail
                  </span>
                </span>
                <ChevronRight
                  className={`h-5 w-5 shrink-0 text-awc-muted transition-transform ${otherOpen ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {otherOpen ? (
                <div id="other-giving-options" className="mt-3 space-y-3 rounded-[20px] border border-awc-line bg-awc-paper p-4">
                  {bank ? (
                    <button
                      type="button"
                      className="flex w-full min-h-[60px] items-center gap-3 rounded-2xl bg-awc-cream px-3 text-left disabled:opacity-55"
                      disabled={Boolean(bank.disabledReason)}
                      onClick={() => onPick('us_bank_account')}
                    >
                      <MethodTile id="us_bank_account" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold text-awc-ink">Bank Account</span>
                        <span className="block text-[13px] text-awc-muted">{bank.disabledReason || 'Lowest fee · Secured by Stripe'}</span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-awc-muted" aria-hidden="true" />
                    </button>
                  ) : null}
                  {textNumber ? (
                    <a
                      href={`sms:${textNumber.replace(/[^\d+]/g, '')}`}
                      className="flex min-h-[60px] items-start gap-3 rounded-2xl bg-awc-cream px-3 py-3"
                    >
                      <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-awc-accent" aria-hidden="true" />
                      <span className="text-[15px] leading-snug text-awc-ink">
                        <strong className="font-semibold">Text to give.</strong> Text an amount (like 50) to{' '}
                        <span className="font-semibold tabular-nums">{textNumber}</span>.
                      </span>
                    </a>
                  ) : null}
                  <div className="flex items-start gap-3 rounded-2xl bg-awc-cream px-3 py-3">
                    <Church className="mt-0.5 h-5 w-5 shrink-0 text-awc-accent" aria-hidden="true" />
                    <p className="text-[15px] leading-snug text-awc-ink">
                      <strong className="font-semibold">In person.</strong> Give in the offering during Sunday service.
                    </p>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl bg-awc-cream px-3 py-3">
                    <Mail className="mt-0.5 h-5 w-5 shrink-0 text-awc-accent" aria-hidden="true" />
                    <p className="text-[15px] leading-snug text-awc-ink">
                      <strong className="font-semibold">By mail.</strong> Make checks payable to {payee}
                      {mailLines.length ? (
                        <>
                          {' '}and mail to {mailLines.join(', ')}.
                        </>
                      ) : (
                        <>
                          . Questions?{' '}
                          <a className="font-semibold text-awc-accent underline" href={`mailto:${email}`}>
                            {email}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              ) : null}
            </li>
          ) : null}
        </ul>

        {!loading && methods.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-awc-line bg-awc-paper px-4 py-3 text-[15px] text-awc-ink">
            Online giving is temporarily unavailable. Please email{' '}
            <a className="font-semibold text-awc-accent underline" href={`mailto:${email}`}>
              {email}
            </a>
            .
          </p>
        ) : null}

        <p className="mt-7 flex items-center justify-center gap-1.5 text-[13px] text-awc-muted">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Secure giving · A receipt for every gift
        </p>
        {onViewMyGiving ? (
          <button
            type="button"
            onClick={onViewMyGiving}
            className="mx-auto mt-2 flex min-h-11 items-center text-[15px] font-semibold text-awc-accent underline-offset-2 hover:underline"
          >
            Given before? View My giving
          </button>
        ) : null}
        <p className="mt-6 text-center font-serif-display text-[15px] italic text-awc-muted">
          “God loveth a cheerful giver.” — 2 Corinthians 9:7
        </p>
      </div>
    </section>
  );
};
