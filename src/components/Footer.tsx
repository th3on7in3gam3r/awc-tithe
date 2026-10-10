import React from 'react';
import { Link } from 'react-router-dom';
import { useChurch } from '../context/ChurchContext';
import { AppPortalMode } from '../types';
import { ShieldCheck, Lock, ArrowLeft, Users, Mail, Phone } from 'lucide-react';

interface FooterProps {
  portalMode: AppPortalMode;
  setPortalMode: (mode: AppPortalMode) => void;
  setActiveTab: (tab: string) => void;
  onRequestStaffPortal: () => void;
  onEnterDonorPortal: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  portalMode,
  setActiveTab,
  onRequestStaffPortal,
  onEnterDonorPortal,
}) => {
  const { config } = useChurch();

  const legalName = config.legalEntityName?.trim() || '';
  const street = config.address?.trim() || '';
  const cityStateZip = config.cityStateZip?.trim() || '';
  const locationLine = [street, cityStateZip].filter(Boolean).join(', ');
  const ein = config.ein?.trim() || '';

  return (
    <footer className="mt-20 text-white py-16 no-print" style={{ backgroundColor: '#4A0404' }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 pb-12 mb-8"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/images/awc-logo.png"
                alt="Anointed Worship Center"
                className="w-11 h-11 rounded-full object-contain bg-white"
                style={{ border: '1px solid rgba(212,175,55,0.35)' }}
              />
              <div>
                <h3 className="text-xl font-extrabold tracking-tight text-white">AWC Tithe</h3>
                <p
                  className="text-[10px] uppercase tracking-[0.2em] font-semibold"
                  style={{ color: 'rgba(212,175,55,0.85)' }}
                >
                  {config.name}
                </p>
              </div>
            </div>
            <div className="space-y-1 max-w-md">
              {legalName ? (
                <p className="text-[11px] text-white/55 leading-relaxed">{legalName}</p>
              ) : null}
              {locationLine ? (
                <p className="text-[11px] text-white/45 leading-relaxed">{locationLine}</p>
              ) : null}
              <p className="text-[11px] text-white/40 leading-relaxed">
                Federal Tax-Exempt Status 501(c)(3) Public Charity
                {ein ? ` · EIN: ${ein}` : ''}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 pt-1 text-[11px] text-white/55">
              {config.email?.trim() ? (
                <a
                  href={`mailto:${config.email}`}
                  className="inline-flex items-center gap-1.5 hover:text-[#D4AF37] transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" style={{ color: '#D4AF37' }} />
                  {config.email}
                </a>
              ) : null}
              {config.phone?.trim() ? (
                <a
                  href={`tel:${config.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 hover:text-[#D4AF37] transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" style={{ color: '#D4AF37' }} />
                  {config.phone}
                </a>
              ) : null}
            </div>
          </div>

          <div>
            <h4
              className="text-[10px] font-black uppercase tracking-[0.4em] mb-3"
              style={{ color: 'rgba(212,175,55,0.65)' }}
            >
              {portalMode === 'public' ? 'Navigation' : 'Console'}
            </h4>
            <div className="flex flex-wrap items-center gap-5 text-xs text-white/55">
              {portalMode === 'public' ? (
                <>
                  <button onClick={() => setActiveTab('give')} className="hover:text-[#D4AF37] transition-colors">
                    Give Online
                  </button>
                  <button
                    onClick={onEnterDonorPortal}
                    className="flex items-center gap-1 hover:text-[#D4AF37] transition-colors"
                  >
                    <Users className="h-3 w-3" />
                    Donor Portal
                  </button>
                  <button
                    onClick={onRequestStaffPortal}
                    className="flex items-center gap-1 font-semibold transition-colors"
                    style={{ color: '#D4AF37' }}
                  >
                    <Lock className="h-3 w-3" />
                    Staff Portal
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setActiveTab('admin')} className="hover:text-[#D4AF37] transition-colors">
                    Stewardship Console
                  </button>
                  <button
                    onClick={onEnterDonorPortal}
                    className="flex items-center gap-1 font-medium text-white/70 hover:text-[#D4AF37] transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Exit to Donor Portal
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 text-[11px] text-white/45">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: '#D4AF37' }} />
              <span>Secure checkout via Stripe · Encrypted transport (TLS)</span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link to="/privacy" className="hover:text-[#D4AF37] transition-colors">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-[#D4AF37] transition-colors">
                Terms
              </Link>
              <Link to="/refund-policy" className="hover:text-[#D4AF37] transition-colors">
                Refund Policy
              </Link>
            </nav>
          </div>
          <p className="text-center sm:text-right">
            © {new Date().getFullYear()} {config.name}. Dedicated to kingdom stewardship.
          </p>
        </div>
      </div>
    </footer>
  );
};
