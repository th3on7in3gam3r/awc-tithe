import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { ReconciliationDiscrepancy, DcuBankDeposit } from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Download,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  Building2,
  BookOpen,
  DollarSign,
  AlertCircle,
  Clock,
  Sparkles,
  Check,
  Layers,
  FileSpreadsheet,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';

export const RealTimeReconciliationPanel: React.FC = () => {
  const {
    config,
    donations,
    dcuDeposits,
    discrepancies,
    resolveDiscrepancy,
    runAutoReconciliation,
    simulateIncomingDcuDeposit,
    addNotification,
  } = useChurch();

  const { dcuBank, awcDcb } = config;

  // Filter states
  const [filterMode, setFilterMode] = useState<'all' | 'discrepancies_only' | 'matched' | 'resolved'>('discrepancies_only');
  const [searchTerm, setSearchTerm] = useState('');
  const [isReconciling, setIsReconciling] = useState(false);

  // Active Discrepancy Resolution Drawer / Modal
  const [activeResolvingDisc, setActiveResolvingDisc] = useState<ReconciliationDiscrepancy | null>(null);
  const [resolutionAction, setResolutionAction] = useState<'adjust_fee' | 'create_voucher' | 'mark_cleared'>('adjust_fee');
  const [resolutionNote, setResolutionNote] = useState('');

  // Simulation Form Modal
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [simAmount, setSimAmount] = useState('275.00');
  const [simDesc, setSimDesc] = useState('DCU ONLINE BILLPAY - TITHE TRANSFER (MEMO: ENV-1033)');
  const [simType, setSimType] = useState<DcuBankDeposit['type']>('member_direct_deposit');
  const [simEnvelope, setSimEnvelope] = useState('ENV-1033');

  // Compute live reconciliation totals
  const totalDcuBankVolume = dcuDeposits.reduce((sum, d) => sum + d.amount, 0);
  const totalAwcDcbVolume = donations.reduce((sum, d) => sum + d.amount, 0);
  const netVariance = Math.abs(totalDcuBankVolume - totalAwcDcbVolume);

  const activeDiscrepancies = discrepancies.filter((d) => d.status !== 'resolved');
  const resolvedDiscrepancies = discrepancies.filter((d) => d.status === 'resolved');

  // Match ratio
  const totalItemsCount = dcuDeposits.length + activeDiscrepancies.length;
  const matchRatio = totalItemsCount > 0 ? (((totalItemsCount - activeDiscrepancies.length) / totalItemsCount) * 100).toFixed(1) : '100.0';

  // Handle auto-reconciliation run
  const handleRunReconcile = () => {
    setIsReconciling(true);
    setTimeout(() => {
      setIsReconciling(false);
      const res = runAutoReconciliation();
      addNotification(
        'success',
        'Real-Time Reconciliation Complete',
        `Evaluated ${dcuDeposits.length} DCU bank deposits. ${res.remainingCount} active discrepancies remain flagged for review.`
      );
    }, 1000);
  };

  // Handle Discrepancy Submission
  const handleConfirmResolution = () => {
    if (!activeResolvingDisc) return;
    const note = resolutionNote || (
      resolutionAction === 'adjust_fee'
        ? `Adjusted processor fee in AWC DCB to balance against DCU net bank settlement ($${activeResolvingDisc.varianceAmount.toFixed(2)} variance zeroed).`
        : resolutionAction === 'create_voucher'
        ? `Generated missing AWC DCB contribution voucher for envelope ${activeResolvingDisc.envelopeNumber || 'General Offerings'}.`
        : 'Approved and cleared by financial director following bank statement review.'
    );

    resolveDiscrepancy(activeResolvingDisc.id, note, resolutionAction);
    setActiveResolvingDisc(null);
    setResolutionNote('');
  };

  // Handle Simulated Incoming Deposit
  const handleSimulateDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(simAmount);
    if (!amt || amt <= 0) return;

    simulateIncomingDcuDeposit(amt, simDesc, simType, simEnvelope);
    setShowSimulateModal(false);
    setSimAmount('275.00');
  };

  // Export CSV Report
  const handleExportReconciliationReport = () => {
    const headers = [
      'Reconciliation Item ID',
      'Discrepancy Type',
      'Status',
      'DCU Deposit Trace #',
      'DCU Bank Deposit Amount ($)',
      'AWC DCB Voucher #',
      'AWC DCB Gross Amount ($)',
      'Net Variance ($)',
      'Envelope #',
      'Contributor / Member',
      'Discrepancy Audit Details',
      'Resolution Note',
      'Resolved By',
      'Timestamp',
    ];

    const rows = discrepancies.map((d) => [
      d.id,
      d.discrepancyType,
      d.status,
      d.dcuDepositId || 'N/A',
      d.dcuAmount.toFixed(2),
      d.awcVoucherNumber || 'UNMATCHED',
      d.awcAmount.toFixed(2),
      d.varianceAmount.toFixed(2),
      `"${d.envelopeNumber || 'N/A'}"`,
      `"${(d.donorName || '').replace(/"/g, '""')}"`,
      `"${d.details.replace(/"/g, '""')}"`,
      `"${(d.resolutionNote || '').replace(/"/g, '""')}"`,
      `"${d.resolvedBy || ''}"`,
      d.timestamp,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `DCU_vs_AWC_DCB_Reconciliation_Discrepancies_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addNotification('success', 'Report Exported', 'Downloaded DCU vs AWC DCB reconciliation audit report.');
  };

  // Filtered Discrepancies
  const filteredDiscrepancies = discrepancies.filter((d) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      d.details.toLowerCase().includes(term) ||
      (d.donorName || '').toLowerCase().includes(term) ||
      (d.envelopeNumber || '').toLowerCase().includes(term) ||
      (d.awcVoucherNumber || '').toLowerCase().includes(term);

    if (!matchesSearch) return false;

    if (filterMode === 'discrepancies_only') return d.status !== 'resolved';
    if (filterMode === 'resolved') return d.status === 'resolved';
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                <span>DCU Credit Union Feed Active</span>
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-semibold bg-church-gold/10 text-church-burgundy dark:bg-church-burgundy/40 dark:text-church-gold-light rounded border border-church-gold/30 dark:border-church-gold/50 flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                <span>AWC Digital Contribution Book (AWC DCB)</span>
              </span>
              {activeDiscrepancies.length > 0 ? (
                <span className="px-2.5 py-0.5 text-[10px] font-semibold bg-church-gold/10 text-church-gold-dark dark:text-church-gold-light border border-church-gold/30 rounded flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-church-gold-dark" />
                  <span>{activeDiscrepancies.length} Discrepancies Requiring Action</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>100% Balanced &amp; Reconciled</span>
                </span>
              )}
            </div>

            <h2 className="font-serif-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Real-Time Bank Reconciliation &amp; Discrepancy Panel
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Automated side-by-side reconciliation continuously compares incoming bank deposits from <strong>DCU Credit Union (Digital Federal Credit Union)</strong> against records captured in the <strong>AWC Digital Contribution Book</strong>. Any timing lag, processor fee deduction, or unassigned member transfer is immediately flagged for review.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowSimulateModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-xl transition-all"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Simulate DCU Deposit</span>
            </button>

            <button
              onClick={handleRunReconcile}
              disabled={isReconciling}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
              <span>{isReconciling ? 'Evaluating...' : 'Run Real-Time Auto-Match'}</span>
            </button>

            <button
              onClick={handleExportReconciliationReport}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-xl shadow transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Audit CSV</span>
            </button>
          </div>
        </div>

        {/* 5 Real-Time Reconciliation KPI Stat Tiles */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total DCU Bank Inflows
            </span>
            <p className="font-mono text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              ${totalDcuBankVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{dcuDeposits.length} Cleared Deposits</span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total AWC DCB Captured
            </span>
            <p className="font-mono text-xl font-bold text-church-burgundy dark:text-church-gold mt-1 tabular-nums">
              ${totalAwcDcbVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{donations.length} Member Contributions</span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Net Reconciled Variance
            </span>
            <p className={`font-mono text-xl font-bold mt-1 tabular-nums ${netVariance > 0 ? 'text-church-gold-dark dark:text-church-gold' : 'text-emerald-600 dark:text-emerald-400'}`}>
              ${netVariance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {netVariance === 0 ? 'Exact 1:1 Balance' : 'Discrepancy In-Flight'}
            </span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Discrepancies Requiring Action
            </span>
            <p className="font-mono text-xl font-bold text-church-gold-dark dark:text-church-gold mt-1 tabular-nums">
              {activeDiscrepancies.length} Flagged
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{resolvedDiscrepancies.length} Resolved to Date</span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Reconciliation Match Ratio
            </span>
            <p className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
              {matchRatio}%
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">Automated Rule Precision</span>
          </div>
        </div>
      </div>

      {/* Discrepancy Highlighting Engine & Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        
        {/* Table Filter Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
            <button
              onClick={() => setFilterMode('discrepancies_only')}
              className={`px-3 py-1.5 font-medium rounded-lg transition-all ${
                filterMode === 'discrepancies_only'
                  ? 'bg-church-burgundy text-white font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <span>Discrepancies Only ({activeDiscrepancies.length})</span>
            </button>

            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 font-medium rounded-lg transition-all ${
                filterMode === 'all'
                  ? 'bg-church-burgundy text-white font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <span>All Items ({discrepancies.length})</span>
            </button>

            <button
              onClick={() => setFilterMode('resolved')}
              className={`px-3 py-1.5 font-medium rounded-lg transition-all ${
                filterMode === 'resolved'
                  ? 'bg-church-burgundy text-white font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <span>Resolved ({resolvedDiscrepancies.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search donor, envelope #, voucher..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-church-gold"
            />
          </div>
        </div>

        {/* Discrepancy Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
              <tr>
                <th className="px-5 py-3 font-medium">Discrepancy Category &amp; Status</th>
                <th className="px-5 py-3 font-medium">DCU Credit Union Bank Deposit</th>
                <th className="px-5 py-3 font-medium">AWC Digital Contribution Book Entry</th>
                <th className="px-5 py-3 font-medium text-right">Net Variance</th>
                <th className="px-5 py-3 font-medium">Audit Analysis &amp; Notes</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredDiscrepancies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        No discrepancies in this filter view.
                      </span>
                      <p className="text-[11px] text-slate-400 max-w-sm">
                        All DCU Credit Union bank deposits are in balance with AWC Digital Contribution Book records.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDiscrepancies.map((disc) => {
                  const isResolved = disc.status === 'resolved';

                  return (
                    <tr
                      key={disc.id}
                      className={`transition-colors ${
                        isResolved
                          ? 'bg-slate-50/40 dark:bg-slate-900/40 opacity-70'
                          : disc.discrepancyType === 'unmatched_bank_deposit'
                          ? 'bg-red-50/30 dark:bg-red-950/20'
                          : disc.discrepancyType === 'fee_variance'
                          ? 'bg-church-gold/10 dark:bg-church-burgundy/20'
                          : 'bg-blue-50/30 dark:bg-blue-950/20'
                      }`}
                    >
                      {/* Category & Status */}
                      <td className="px-5 py-4 align-top">
                        <div className="space-y-1.5">
                          {isResolved ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Resolved</span>
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                disc.discrepancyType === 'unmatched_bank_deposit'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-300 dark:border-red-800'
                                  : disc.discrepancyType === 'fee_variance'
                                  ? 'bg-church-gold/15 text-church-burgundy dark:bg-church-burgundy-dark/80 dark:text-church-gold-light border border-church-gold/40 dark:border-church-gold/50'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                              }`}
                            >
                              <AlertCircle className="h-3 w-3" />
                              <span className="capitalize">
                                {disc.discrepancyType === 'unmatched_bank_deposit'
                                  ? 'Unmatched Bank Deposit'
                                  : disc.discrepancyType === 'fee_variance'
                                  ? 'Processor Fee Variance'
                                  : 'Pending Bank Clearance'}
                              </span>
                            </span>
                          )}

                          <span className="text-[10px] font-mono text-slate-400 block">
                            ID: {disc.id}
                          </span>
                        </div>
                      </td>

                      {/* DCU Bank Inflow Side */}
                      <td className="px-5 py-4 align-top">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-blue-600" />
                            <strong className="font-mono text-slate-900 dark:text-white">
                              ${disc.dcuAmount.toFixed(2)}
                            </strong>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            {disc.dcuDepositId ? `Ref: ${disc.dcuDepositId}` : 'No Deposit Record Found'}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            DCU Checking (*******8492)
                          </span>
                        </div>
                      </td>

                      {/* AWC DCB Side */}
                      <td className="px-5 py-4 align-top">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5 text-church-gold-dark" />
                            <strong className="font-mono text-slate-900 dark:text-white">
                              ${disc.awcAmount.toFixed(2)}
                            </strong>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-mono text-church-burgundy dark:text-church-gold-light font-semibold">
                              {disc.awcVoucherNumber || 'No AWC Voucher'}
                            </span>
                            {disc.envelopeNumber && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {disc.envelopeNumber}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 block truncate max-w-xs">
                            {disc.donorName || 'Unassigned Contributor'}
                          </span>
                        </div>
                      </td>

                      {/* Net Variance */}
                      <td className="px-5 py-4 text-right align-top">
                        <span
                          className={`font-mono font-bold text-sm block tabular-nums ${
                            isResolved
                              ? 'text-slate-400 line-through'
                              : disc.varianceAmount > 0
                              ? 'text-church-gold-dark dark:text-church-gold'
                              : 'text-blue-700 dark:text-blue-400'
                          }`}
                        >
                          {disc.varianceAmount > 0 ? `+$${disc.varianceAmount.toFixed(2)}` : `-$${Math.abs(disc.varianceAmount).toFixed(2)}`}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {disc.varianceAmount === 0 ? 'Balanced' : 'Variance Gap'}
                        </span>
                      </td>

                      {/* Audit Details */}
                      <td className="px-5 py-4 align-top max-w-md">
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                          {disc.details}
                        </p>
                        {disc.resolutionNote && (
                          <div className="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 dark:border-emerald-800 text-[10px] text-emerald-800 dark:text-emerald-300">
                            <strong>Resolution:</strong> {disc.resolutionNote}
                            <span className="block text-emerald-600/80 font-mono mt-0.5">
                              By: {disc.resolvedBy} · {new Date(disc.resolvedAt || '').toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-4 text-right align-top">
                        {!isResolved ? (
                          <button
                            onClick={() => {
                              setActiveResolvingDisc(disc);
                              setResolutionAction(disc.discrepancyType === 'fee_variance' ? 'adjust_fee' : 'create_voucher');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-lg shadow-sm transition-all"
                          >
                            <span>Resolve</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium italic">
                            Closed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>
              Real-time discrepancy engine automatically enforces double-entry audit standards between <strong>DCU Federal Credit Union</strong> and <strong>AWC DCB</strong>.
            </span>
          </div>
          <span className="font-mono text-[11px]">
            {activeDiscrepancies.length} active discrepancies remaining
          </span>
        </div>
      </div>

      {/* Discrepancy Resolution Modal Drawer */}
      {activeResolvingDisc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden space-y-5 p-6">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-church-gold/15 dark:bg-church-burgundy-dark text-church-burgundy dark:text-church-gold-light">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif-display text-base font-bold text-slate-900 dark:text-white">
                    Resolve Reconciliation Discrepancy
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">Discrepancy ID: {activeResolvingDisc.id}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveResolvingDisc(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Discrepancy Detail Pill */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span>DCU Bank Settled Deposit:</span>
                <strong className="font-mono text-slate-900 dark:text-white">${activeResolvingDisc.dcuAmount.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span>AWC DCB Captured Amount:</span>
                <strong className="font-mono text-slate-900 dark:text-white">${activeResolvingDisc.awcAmount.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between items-center text-church-burgundy dark:text-church-gold-light font-bold border-t border-slate-200 dark:border-slate-700 pt-2">
                <span>Net Variance Gap:</span>
                <span className="font-mono">${activeResolvingDisc.varianceAmount.toFixed(2)}</span>
              </div>
              <p className="text-[11px] text-slate-500 italic mt-1">{activeResolvingDisc.details}</p>
            </div>

            {/* Resolution Action Picker */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Select Resolution Strategy
              </label>

              <div className="space-y-2 text-xs">
                <label
                  onClick={() => setResolutionAction('adjust_fee')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    resolutionAction === 'adjust_fee'
                      ? 'border-church-gold/50 bg-church-gold/10 dark:bg-church-burgundy/40 dark:border-church-gold'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="resolution_action"
                    checked={resolutionAction === 'adjust_fee'}
                    onChange={() => setResolutionAction('adjust_fee')}
                    className="mt-0.5 text-church-burgundy focus:ring-church-gold"
                  />
                  <div>
                    <strong className="text-slate-900 dark:text-white block font-semibold">
                      Auto-Adjust Processor Fee in AWC DCB
                    </strong>
                    <span className="text-[11px] text-slate-500">
                      Allocate ${activeResolvingDisc.varianceAmount.toFixed(2)} to credit card processing expense ledger to balance against DCU net bank deposit.
                    </span>
                  </div>
                </label>

                <label
                  onClick={() => setResolutionAction('create_voucher')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    resolutionAction === 'create_voucher'
                      ? 'border-church-gold/50 bg-church-gold/10 dark:bg-church-burgundy/40 dark:border-church-gold'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="resolution_action"
                    checked={resolutionAction === 'create_voucher'}
                    onChange={() => setResolutionAction('create_voucher')}
                    className="mt-0.5 text-church-burgundy focus:ring-church-gold"
                  />
                  <div>
                    <strong className="text-slate-900 dark:text-white block font-semibold">
                      Generate Missing AWC DCB Voucher
                    </strong>
                    <span className="text-[11px] text-slate-500">
                      Create a manual journal entry in AWC DCB assigning funds to envelope {activeResolvingDisc.envelopeNumber || 'ENV-1004'}.
                    </span>
                  </div>
                </label>

                <label
                  onClick={() => setResolutionAction('mark_cleared')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    resolutionAction === 'mark_cleared'
                      ? 'border-church-gold/50 bg-church-gold/10 dark:bg-church-burgundy/40 dark:border-church-gold'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="resolution_action"
                    checked={resolutionAction === 'mark_cleared'}
                    onChange={() => setResolutionAction('mark_cleared')}
                    className="mt-0.5 text-church-burgundy focus:ring-church-gold"
                  />
                  <div>
                    <strong className="text-slate-900 dark:text-white block font-semibold">
                      Approve &amp; Clear Timing Variance
                    </strong>
                    <span className="text-[11px] text-slate-500">
                      Sign off that funds have cleared DCU Credit Union and ledger transit has concluded.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Bookkeeper Note */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Auditor / Bookkeeper Note (Optional)
              </label>
              <textarea
                rows={2}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="e.g. Verified with DCU commercial wire report and Sunday envelope cash count."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setActiveResolvingDisc(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResolution}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Confirm &amp; Reconcile Item</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Simulate Incoming Deposit Modal */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <form
            onSubmit={handleSimulateDeposit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                    Simulate Incoming DCU Deposit
                  </h3>
                  <p className="text-[11px] text-slate-500">Inject real-time bank statement deposit</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSimulateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">
                  Deposit Amount ($ USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  required
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">
                  Deposit Source / Instrument
                </label>
                <select
                  value={simType}
                  onChange={(e) => setSimType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="member_direct_deposit">DCU Direct Member Billpay Transfer</option>
                  <option value="plaid_bank_transfer">Plaid Instant Bank Transfer (Direct-to-DCU)</option>
                  <option value="card_batch_settlement">Stripe Card Batch Clearing</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">
                  Member Envelope Reference (Memo)
                </label>
                <input
                  type="text"
                  value={simEnvelope}
                  onChange={(e) => setSimEnvelope(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">
                  Bank Statement Description
                </label>
                <input
                  type="text"
                  value={simDesc}
                  onChange={(e) => setSimDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSimulateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-1.5"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Inject DCU Deposit</span>
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
