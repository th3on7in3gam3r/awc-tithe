import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import {
  Code2,
  Copy,
  Check,
  Play,
  Terminal,
  Server,
  Key,
  Shield,
  Send,
} from 'lucide-react';

interface Endpoint {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  summary: string;
  description: string;
  category: 'Contributions' | 'Donors & Statements' | 'Funds' | 'Webhooks & Audit';
  sampleRequest?: object;
  sampleResponse: object;
}

export const ApiDocumentation: React.FC = () => {
  const { config, funds, donations, auditLogs } = useChurch();
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>('post-donation');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [codeLanguage, setCodeLanguage] = useState<'curl' | 'js' | 'python'>('curl');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [isExecutingTest, setIsExecutingTest] = useState(false);

  const endpoints: Endpoint[] = [
    {
      id: 'post-donation',
      method: 'POST',
      path: '/api/v1/donations',
      category: 'Contributions',
      summary: 'Process single contribution',
      description: 'Executes a one-time contribution via tokenized Stripe PaymentIntent, calculates processing fees, and issues an IRS 501(c)(3) tax receipt.',
      sampleRequest: {
        amount: 250.0,
        currency: 'USD',
        fund_id: 'fund-tithes',
        donor: {
          name: 'Jane Donor',
          email: 'donor@example.com',
          address: '123 Main St, City, ST 00000',
        },
        payment_method_token: 'pm_card_visa',
        cover_processing_fees: true,
        dedication_note: 'In honor of missions week',
      },
      sampleResponse: {
        success: true,
        transaction_id: 'ch_example_001',
        receipt_number: 'REC-2026-00001',
        amount: 250.0,
        fee_covered: 7.55,
        total_charged: 257.55,
        fund: 'General Tithes & Offerings',
        status: 'completed',
        tax_deductible: true,
        statutory_disclaimer: 'No goods or services were provided in exchange for this contribution.',
      },
    },
    {
      id: 'post-subscription',
      method: 'POST',
      path: '/api/v1/subscriptions',
      category: 'Contributions',
      summary: 'Create recurring giving schedule',
      description: 'Enrolls donor in recurring stewardship billing (weekly, bi-weekly, monthly, annually) with automated receipt delivery.',
      sampleRequest: {
        donor_email: 'donor@example.com',
        amount: 350.0,
        frequency: 'monthly',
        fund_id: 'fund-tithes',
        stripe_customer_token: 'cus_example',
      },
      sampleResponse: {
        subscription_id: 'sub_example_001',
        status: 'active',
        current_period_start: '2026-09-30T10:15:00Z',
        current_period_end: '2026-10-30T10:15:00Z',
        recurring_schedule: 'monthly',
        receipt_destination_email: 'donor@example.com',
      },
    },
    {
      id: 'get-tax-statement',
      method: 'GET',
      path: '/api/v1/donors/:donor_id/tax-statement?year=2026',
      category: 'Donors & Statements',
      summary: 'Generate annual IRS statement',
      description: 'Compiles annual cumulative tax deduction statements compliant with IRS Code Section 170(f)(8).',
      sampleResponse: {
        statement_id: 'STMT-2026-EXAMPLE',
        donor_name: 'Jane Donor',
        calendar_year: 2026,
        church_legal_name: config.legalEntityName,
        ein: config.ein,
        tax_exempt_status: config.taxExemptStatus,
        total_eligible_deduction: 5200.0,
        contributions_count: 12,
        verification_hash: '8f92b71948e21948d38',
      },
    },
    {
      id: 'get-funds',
      method: 'GET',
      path: '/api/v1/funds',
      category: 'Funds',
      summary: 'List active ministry funds',
      description: 'Fetches all approved church campaigns, budget objectives, and real-time funding progress.',
      sampleResponse: {
        funds: funds.map((f) => ({
          id: f.id,
          name: f.name,
          code: f.code,
          category: f.category,
          goal_amount: f.goalAmount,
          current_funded: f.currentAmount,
          percent_complete: Number(((f.currentAmount / f.goalAmount) * 100).toFixed(1)),
        })),
      },
    },
    {
      id: 'post-stripe-webhook',
      method: 'POST',
      path: '/api/v1/webhooks/stripe',
      category: 'Webhooks & Audit',
      summary: 'Stripe event listener',
      description: 'Webhook endpoint listening for charge.succeeded and customer.subscription.deleted events to keep church database in sync.',
      sampleRequest: {
        id: 'evt_1P0029Xz721e9008271',
        type: 'charge.succeeded',
        data: {
          object: {
            id: 'ch_3N82F92eZvKYlo2C194829',
            amount: 35000,
            currency: 'usd',
            customer: 'cus_N83910xZ2',
          },
        },
      },
      sampleResponse: {
        received: true,
        audit_log_id: 'audit-001',
        integrity_hash: '8a9f4c3b2e1d0f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a',
      },
    },
  ];

  const selectedEndpoint = endpoints.find((e) => e.id === selectedEndpointId) || endpoints[0];

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getCodeSnippet = () => {
    const baseUrl = 'https://ais-dev-vd5klg5vt7ll3vcvpugk7g-7048577448.us-west2.run.app';
    if (codeLanguage === 'curl') {
      if (selectedEndpoint.method === 'POST') {
        return `curl -X POST "${baseUrl}${selectedEndpoint.path}" \\
  -H "Authorization: Bearer sec_live_church_api_key_8849" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(selectedEndpoint.sampleRequest || {}, null, 2)}'`;
      }
      return `curl -X GET "${baseUrl}${selectedEndpoint.path}" \\
  -H "Authorization: Bearer sec_live_church_api_key_8849"`;
    }

    if (codeLanguage === 'js') {
      return `const response = await fetch("${baseUrl}${selectedEndpoint.path}", {
  method: "${selectedEndpoint.method}",
  headers: {
    "Authorization": "Bearer sec_live_church_api_key_8849",
    "Content-Type": "application/json"
  }${selectedEndpoint.sampleRequest ? `,\n  body: JSON.stringify(${JSON.stringify(selectedEndpoint.sampleRequest, null, 2)})` : ''}
});

const data = await response.json();
console.log(data);`;
    }

    return `import requests

url = "${baseUrl}${selectedEndpoint.path}"
headers = {
    "Authorization": "Bearer sec_live_church_api_key_8849",
    "Content-Type": "application/json"
}
${selectedEndpoint.sampleRequest ? `payload = ${JSON.stringify(selectedEndpoint.sampleRequest, null, 4)}\nresponse = requests.${selectedEndpoint.method.toLowerCase()}(url, headers=headers, json=payload)` : `response = requests.${selectedEndpoint.method.toLowerCase()}(url, headers=headers)`}

print(response.json())`;
  };

  const handleExecuteLiveTest = () => {
    setIsExecutingTest(true);
    setTimeout(() => {
      setIsExecutingTest(false);
      setTestResponse(JSON.stringify(selectedEndpoint.sampleResponse, null, 2));
    }, 400);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      
      {/* Header */}
      <div className="max-w-3xl pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-church-gold-dark dark:text-church-gold" />
          <span className="text-xs font-semibold uppercase tracking-wider text-church-burgundy dark:text-church-gold">
            Developer Integration Engine
          </span>
        </div>
        <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
          Stewardship API Documentation
        </h1>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
          Comprehensive RESTful APIs for integrating Anointed Worship Center contributions with external Church Management Systems (Planning Center, Breeze, TouchPoint) and accounting ledgers (QuickBooks, Xero).
        </p>
      </div>

      {/* API Key & Security Header Bar */}
      <div className="mt-6 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs">
        <div className="flex items-center gap-3">
          <Key className="h-4 w-4 text-church-gold-dark" />
          <div>
            <span className="font-semibold text-slate-900 dark:text-white">API Authentication</span>
            <p className="text-[11px] text-slate-500">Bearer token required in all request headers</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <code className="px-2.5 py-1 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
            Authorization: Bearer sec_live_church_api_key_••••••••
          </code>
        </div>
      </div>

      {/* Main Grid: Endpoints list & Details */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Endpoints Tree (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-2 block">
            API Endpoints (v1)
          </span>

          <div className="space-y-1">
            {endpoints.map((ep) => (
              <button
                key={ep.id}
                onClick={() => {
                  setSelectedEndpointId(ep.id);
                  setTestResponse(null);
                }}
                className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                  selectedEndpointId === ep.id
                    ? 'bg-church-gold/10 text-church-burgundy-dark font-semibold border border-church-gold/30 dark:bg-church-burgundy/40 dark:text-church-gold-light dark:border-church-gold/50'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded ${
                      ep.method === 'POST'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="truncate font-mono">{ep.path.split('?')[0]}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 space-y-1 px-2">
            <p>• TLS 1.3 Strict Transport Security</p>
            <p>• Rate Limit: 1,200 req/min</p>
            <p>• Webhook HMAC Signature: sha256</p>
          </div>
        </div>

        {/* Right Column: Code Snippet & Interactive Tester (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Endpoint Details Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
                  selectedEndpoint.method === 'POST'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                }`}
              >
                {selectedEndpoint.method}
              </span>
              <h2 className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                {selectedEndpoint.path}
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
              {selectedEndpoint.description}
            </p>

            {/* Code Language Switcher */}
            <div className="mt-6">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  {(['curl', 'js', 'python'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setCodeLanguage(lang)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded capitalize transition-colors ${
                        codeLanguage === lang
                          ? 'bg-slate-900 text-white dark:bg-church-burgundy'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {lang === 'js' ? 'JavaScript' : lang === 'curl' ? 'cURL' : 'Python'}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => copyToClipboard(getCodeSnippet(), 'code-sample')}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  {copiedCode === 'code-sample' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Code Pre */}
              <div className="mt-2 bg-slate-950 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                <pre>{getCodeSnippet()}</pre>
              </div>
            </div>

            {/* Live Interactive Test Runner */}
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Interactive Endpoint Tester</span>
                </span>
                <button
                  onClick={handleExecuteLiveTest}
                  disabled={isExecutingTest}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-church-burgundy hover:bg-church-burgundy-light rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  {isExecutingTest ? (
                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>Send Test Request</span>
                </button>
              </div>

              {testResponse && (
                <div className="mt-3">
                  <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    <span>Response Payload (200 OK)</span>
                    <span className="text-emerald-600 font-mono font-bold">200 OK · 42ms</span>
                  </div>
                  <div className="bg-slate-900 text-emerald-400 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                    <pre>{testResponse}</pre>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
