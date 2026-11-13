/**
 * Text to give, shown on the main giving page with a QR code: scanning it opens a
 * text to the church's number with GIVE typed in (the reply has the giving link).
 */
import { MessageSquare } from 'lucide-react';

export const DEFAULT_TEXT_GIVE_NUMBER = '(855) 297-1920';

export function smsHref(number: string): string {
  const digits = number.replace(/\D/g, '');
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return `sms:${e164}?&body=GIVE`;
}

export default function TextGiveCard({ number, className = '' }: { number?: string | null; className?: string }) {
  const shown = (number || '').trim() || DEFAULT_TEXT_GIVE_NUMBER;
  // The printed QR is for the church's number; a different configured number gets no QR.
  const qr = shown.replace(/\D/g, '').endsWith('8552971920') ? '/images/text-to-give-qr.svg' : null;
  return (
    <div className={`flex items-center gap-4 rounded-[20px] border border-awc-line bg-awc-paper p-4 ${className}`}>
      {qr ? (
        <img
          src={qr}
          alt={`QR code: text GIVE to ${shown}`}
          width={96}
          height={96}
          className="h-24 w-24 shrink-0 rounded-lg border border-awc-line bg-white"
        />
      ) : null}
      <div className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-awc-muted">
          <MessageSquare className="h-4 w-4 text-awc-accent" aria-hidden="true" /> Text to give
        </p>
        <a href={smsHref(shown)} className="mt-1 block text-[20px] font-bold tabular-nums text-awc-accent">
          {shown}
        </a>
        <p className="mt-0.5 text-[13px] leading-snug text-awc-muted">
          Text <strong className="text-awc-ink">GIVE</strong> or an amount (like <strong className="text-awc-ink">50</strong>).
          {qr ? ' Scan the code with your phone camera to start a text.' : ''}
        </p>
      </div>
    </div>
  );
}
