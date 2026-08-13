import { useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  Mail,
  Printer,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import {
  LEGAL_DOCUMENT_SHA256,
  LEGAL_DOCUMENTS,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED_DATE,
  LEGAL_OPERATOR,
  LEGAL_OPERATOR_DISCLOSURE_NOTICE,
  LEGAL_POLICY_VERSION,
  buildLegalDocumentDownloadText,
  getLegalDocument,
  type LegalDocument,
  type LegalDocumentId,
} from '../legal/legalPolicies';

interface LegalCenterProps {
  documentId?: LegalDocumentId | null;
  embedded?: boolean;
}

function PolicyCard({ policy }: { policy: LegalDocument }) {
  return (
    <a
      href={policy.path}
      className="group flex min-h-44 flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition-all hover:-translate-y-0.5 hover:border-accent-cyan/35 hover:bg-accent-cyan/[0.045] focus:outline-none focus:ring-2 focus:ring-accent-cyan"
    >
      <div>
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl border border-accent-cyan/20 bg-accent-cyan/5 text-accent-cyan">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-white">{policy.shortTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{policy.summary}</p>
      </div>
      <span className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent-cyan">
        Read policy
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </span>
    </a>
  );
}

function LegalOverview({ embedded }: { embedded: boolean }) {
  return (
    <div className={embedded ? 'max-w-5xl' : 'mx-auto max-w-6xl'}>
      <div className="mb-8 max-w-3xl">
        <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent-cyan">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Version {LEGAL_POLICY_VERSION}
        </div>
        <h1 className="font-display text-3xl font-medium text-white sm:text-4xl">
          Legal &amp; Privacy
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
          Provider information and clear terms for the LUMA Quant service,
          privacy, browser storage, paid Credits, responsible use, and
          copyright requests.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {LEGAL_DOCUMENTS.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} />
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-accent-cyan" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-white">Contact</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Legal and privacy questions:{' '}
              <a className="text-accent-cyan hover:underline" href={`mailto:${LEGAL_OPERATOR.legalEmail}`}>
                {LEGAL_OPERATOR.legalEmail}
              </a>
              . Technical and billing support:{' '}
              <a className="text-accent-cyan hover:underline" href={`mailto:${LEGAL_OPERATOR.supportEmail}`}>
                {LEGAL_OPERATOR.supportEmail}
              </a>
              . Operator contact:{' '}
              <a className="text-accent-cyan hover:underline" href={`mailto:${LEGAL_OPERATOR.operatorEmail}`}>
                {LEGAL_OPERATOR.operatorEmail}
              </a>
              .
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {LEGAL_OPERATOR.name} · {LEGAL_OPERATOR.address}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              GISA {LEGAL_OPERATOR.gisaNumber} · VAT ID {LEGAL_OPERATOR.vatId} · GLN {LEGAL_OPERATOR.gln}
            </p>
            <p className="mt-3 max-w-3xl rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-100/75">
              {LEGAL_OPERATOR_DISCLOSURE_NOTICE}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function PolicyBody({ policy }: { policy: LegalDocument }) {
  const downloadPolicy = () => {
    const contents = buildLegalDocumentDownloadText(policy.id);
    const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = objectUrl;
    link.download = `luma-quant-${policy.id}-${LEGAL_POLICY_VERSION}.txt`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
  };

  return (
    <article className="min-w-0 print:text-black">
      <div className="border-b border-white/10 pb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-cyan">
          Version {LEGAL_POLICY_VERSION}
        </div>
        <h1 className="mt-4 font-display text-3xl font-medium leading-tight text-white print:text-black sm:text-4xl">
          {policy.title}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 print:text-slate-800 sm:text-base">
          {policy.summary}
        </p>
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-500">
          <div className="flex gap-2">
            <dt>Effective</dt>
            <dd className="text-slate-300">{LEGAL_EFFECTIVE_DATE}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Last updated</dt>
            <dd className="text-slate-300">{LEGAL_LAST_UPDATED_DATE}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-accent-cyan/30 hover:text-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Print / save as PDF
          </button>
          <button
            type="button"
            onClick={downloadPolicy}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-accent-cyan/30 hover:text-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download UTF-8 text
          </button>
        </div>
        <p className="mt-4 break-all font-mono text-[9px] leading-4 text-slate-600">
          SHA-256 {LEGAL_DOCUMENT_SHA256[policy.id]}
        </p>
      </div>

      <div className="divide-y divide-white/10">
        {policy.sections.map((section) => (
          <section key={section.title} className="py-8">
            <h2 className="text-xl font-semibold text-white print:text-black">{section.title}</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 print:text-slate-800">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="space-y-3 pl-5">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="list-disc pl-1 marker:text-accent-cyan">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
              {section.links && (
                <ul className="space-y-3">
                  {section.links.map((link) => {
                    const external = link.href.startsWith('https://');
                    return (
                      <li key={`${link.label}:${link.href}`}>
                        <a
                          href={link.href}
                          target={external ? '_blank' : undefined}
                          rel={external ? 'noreferrer noopener' : undefined}
                          className="inline-flex rounded text-accent-cyan hover:underline focus:outline-none focus:ring-2 focus:ring-accent-cyan"
                        >
                          {link.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-accent-cyan/20 bg-accent-cyan/5 p-5 text-sm leading-6 text-slate-300">
        <p>
          Questions about this policy? Email{' '}
          <a className="text-accent-cyan hover:underline" href={`mailto:${LEGAL_OPERATOR.legalEmail}`}>
            {LEGAL_OPERATOR.legalEmail}
          </a>
          .
        </p>
      </div>
    </article>
  );
}

export function LegalCenter({
  documentId = null,
  embedded = false,
}: LegalCenterProps) {
  const selectedPolicy = documentId ? getLegalDocument(documentId) : null;

  useEffect(() => {
    if (embedded) return undefined;
    const previousTitle = window.document.title;
    window.document.title = selectedPolicy
      ? `${selectedPolicy.shortTitle} | LUMA Quant`
      : 'Legal & Privacy | LUMA Quant';
    return () => {
      window.document.title = previousTitle;
    };
  }, [embedded, selectedPolicy]);

  if (embedded) {
    return <LegalOverview embedded />;
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#070B14] text-slate-100 antialiased print:static print:overflow-visible print:bg-white print:text-black">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,240,255,0.08),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.07),transparent_35%)] print:hidden"
      />

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#070B14]/90 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="/"
            className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-cyan"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent-cyan/25 bg-accent-cyan/5 text-accent-cyan">
              <Scale className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-white">LUMA Quant</span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                Legal Center
              </span>
            </span>
          </a>
          <a
            href="/"
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-accent-cyan/30 hover:text-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to LUMA
          </a>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 print:max-w-none print:p-0 sm:px-6 lg:px-8 lg:py-14">
        {selectedPolicy ? (
          <div className="grid gap-10 print:block lg:grid-cols-[230px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <nav aria-label="Legal documents" className="sticky top-28 space-y-1">
                <a
                  href="/legal"
                  className="mb-3 block rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
                >
                  All policies
                </a>
                {LEGAL_DOCUMENTS.map((policy) => (
                  <a
                    key={policy.id}
                    href={policy.path}
                    aria-current={policy.id === selectedPolicy.id ? 'page' : undefined}
                    className={`block rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      policy.id === selectedPolicy.id
                        ? 'border border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan'
                        : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {policy.shortTitle}
                  </a>
                ))}
              </nav>
            </aside>
            <div className="mx-auto w-full max-w-4xl">
              <div className="mb-6 lg:hidden">
                <a href="/legal" className="text-sm text-accent-cyan hover:underline">
                  ← All policies
                </a>
              </div>
              <PolicyBody policy={selectedPolicy} />
            </div>
          </div>
        ) : (
          <LegalOverview embedded={false} />
        )}
      </main>

      <footer className="relative z-10 border-t border-white/10 px-4 py-6 text-center text-xs text-slate-500 print:hidden">
        {LEGAL_OPERATOR.name} · {LEGAL_POLICY_VERSION}
      </footer>
    </div>
  );
}
