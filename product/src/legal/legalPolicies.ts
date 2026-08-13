export const LEGAL_POLICY_VERSION = '2026-08-04.v4';
export const LEGAL_EFFECTIVE_DATE = '4 August 2026';
export const LEGAL_LAST_UPDATED_DATE = '4 August 2026';

export const LEGAL_OPERATOR = {
  name: 'Luma Quant e.U.',
  proprietorName: 'Johann Weitzer',
  legalForm: 'e.U. (registered sole proprietorship)',
  tradeDescription: 'LUMA Quant',
  jurisdiction: 'Austria',
  address: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
  legalEmail: 'info@lumaquant.tech',
  supportEmail: 'support@lumaquant.tech',
  securityEmail: 'security@lumaquant.tech',
  operatorEmail: 'info@lumaquant.tech',
  linkedinUrl: '',
  xUrl: 'https://x.com/lumaquant_tech',
  gisaNumber: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
  vatId: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
  gln: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
  commercialRegisterCourt: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
  commercialRegisterNumber: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
  competentTradeAuthority: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
  chamberMembership: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
  publicTelephone: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
  mediaDisclosure: 'LEGAL_REVIEW_NOT_YET_COMPLETED',
} as const;

export const LEGAL_OPERATOR_DISCLOSURE_NOTICE =
  'COMPLETED_OWNER_CONFIRMED: Luma Quant e.U., LUMA Quant, Johann Weitzer, ' +
  'and Austria are owner-confirmed; independent registry verification was not ' +
  'performed. Address, registration, tax, authority, chamber and mandatory ' +
  'disclosure fields remain LEGAL_REVIEW_NOT_YET_COMPLETED.';

export type LegalDocumentId =
  | 'imprint'
  | 'terms'
  | 'privacy'
  | 'cookies'
  | 'paid-services'
  | 'acceptable-use'
  | 'copyright';

export interface LegalSection {
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  links?: readonly {
    label: string;
    href: string;
  }[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  path: string;
  shortTitle: string;
  title: string;
  summary: string;
  sections: readonly LegalSection[];
}

const imprint: LegalDocument = {
  id: 'imprint',
  path: '/legal/imprint',
  shortTitle: 'Legal Notice',
  title: 'LUMA Quant Legal Notice (Imprint)',
  summary: 'Provider identification and direct contact information for the LUMA Quant service.',
  sections: [
    {
      title: '1. Service provider',
      paragraphs: [
        `${LEGAL_OPERATOR.name} operates the LUMA Quant website, web application, and related services.`,
      ],
      bullets: [
        `Proprietor and operator: ${LEGAL_OPERATOR.proprietorName}`,
        `Legal form: ${LEGAL_OPERATOR.legalForm}`,
        `Business address and registered place of business: ${LEGAL_OPERATOR.address}`,
        `Registered trade: ${LEGAL_OPERATOR.tradeDescription}`,
      ],
    },
    {
      title: '2. Registration and tax identifiers',
      paragraphs: [
        'LEGAL_REVIEW_NOT_YET_COMPLETED: registration and tax identifiers are not independently verified by this candidate.',
      ],
      bullets: [
        `Commercial-register court: ${LEGAL_OPERATOR.commercialRegisterCourt}`,
        `Commercial-register number: ${LEGAL_OPERATOR.commercialRegisterNumber}`,
        `GISA number: ${LEGAL_OPERATOR.gisaNumber}`,
        `VAT identification number: ${LEGAL_OPERATOR.vatId}`,
        `Global Location Number (GLN), published by the operator: ${LEGAL_OPERATOR.gln}`,
      ],
      links: [
        {
          label: 'Official GISA public search',
          href: 'https://www.gisa.gv.at/abfrage',
        },
        {
          label: 'Official EU VAT validation (VIES)',
          href: 'https://ec.europa.eu/taxation_customs/vies/#/vat-validation',
        },
      ],
    },
    {
      title: '3. Direct contact',
      paragraphs: [
        'Please use the contact address that best matches your request. Do not send passwords, complete payment credentials, or unnecessary personal data by email.',
      ],
      links: [
        {
          label: `General enquiries: ${LEGAL_OPERATOR.legalEmail}`,
          href: `mailto:${LEGAL_OPERATOR.legalEmail}`,
        },
        {
          label: `Technical and billing support: ${LEGAL_OPERATOR.supportEmail}`,
          href: `mailto:${LEGAL_OPERATOR.supportEmail}`,
        },
        {
          label: `Operator contact: ${LEGAL_OPERATOR.operatorEmail}`,
          href: `mailto:${LEGAL_OPERATOR.operatorEmail}`,
        },
      ],
    },
    {
      title: '4. Official online profiles',
      paragraphs: [
        'The owner has confirmed the following public profile:',
      ],
      links: [
        {
          label: 'X / Twitter: @lumaquant_tech',
          href: LEGAL_OPERATOR.xUrl,
        },
      ],
    },
    {
      title: '5. Details pending final documentation',
      paragraphs: [
        LEGAL_OPERATOR_DISCLOSURE_NOTICE,
        'These placeholders require completed legal review before the Legal Notice is treated as production-complete.',
      ],
      bullets: [
        `Competent trade authority: ${LEGAL_OPERATOR.competentTradeAuthority}`,
        `Chamber membership: ${LEGAL_OPERATOR.chamberMembership}`,
        `Public telephone: ${LEGAL_OPERATOR.publicTelephone}`,
        `Media disclosure: ${LEGAL_OPERATOR.mediaDisclosure}`,
      ],
    },
    {
      title: '6. Service and content information',
      paragraphs: [
        'LUMA Quant provides statistical analysis tools and reports. Lottery draws remain random, and model outputs do not guarantee a future result or alter official lottery odds. The Terms of Service, Privacy Policy, and Paid Services Terms provide the complete contractual and data-protection information for the platform.',
        `Questions about this Legal Notice may be sent to ${LEGAL_OPERATOR.legalEmail}.`,
      ],
    },
  ],
};

const terms: LegalDocument = {
  id: 'terms',
  path: '/legal/terms',
  shortTitle: 'Terms of Service',
  title: 'LUMA Quant Terms of Service',
  summary: 'The rules that apply when you access or use the LUMA Quant platform.',
  sections: [
    {
      title: '1. Scope and operator',
      paragraphs: [
        `These Terms govern access to the LUMA Quant web application, APIs made available through the application, statistical analysis tools, reports, and related support services (the "Service"). The Service is operated by ${LEGAL_OPERATOR.name}.`,
        'By creating an account or using the Service, you agree to these Terms and the policies linked in the Legal Center. Paid features are also subject to the Terms of Paid Services shown before or alongside purchase.',
      ],
    },
    {
      title: '2. Eligibility and accounts',
      paragraphs: [
        'The Service is intended for adults. You must be at least 18 years old and legally able to enter into a contract in your country of residence.',
        'You must provide accurate account information, keep access credentials and devices secure, and promptly tell us if you suspect unauthorized access. Accounts and workspace access codes are personal and may not be sold, transferred, or shared to bypass access controls.',
        'LUMA Quant issues its own access and refresh tokens after successful authentication. Optional Google or Apple sign-in verifies identity with the selected provider before our backend issues those tokens. Email one-time codes may be used as an alternative.',
      ],
    },
    {
      title: '3. Service purpose and statistical limitations',
      paragraphs: [
        'LUMA Quant analyzes historical and model-derived lottery data and can generate reports, signal summaries, and ticket-related analytics. Lottery draws remain random. Historical patterns, scores, rankings, model confidence, and generated number pools do not guarantee a future result or improve the official odds of a particular draw.',
        'The Service and its outputs are informational analytical tools, not financial, investment, legal, or gambling advice. You remain responsible for checking outputs and deciding whether and how to use them. Only participate where lawful, set personal spending limits, and never spend more than you can afford to lose.',
        'Model output can be incomplete, uncertain, or incorrect. Reports should distinguish evidence, model interpretation, limitations, and unavailable data. A forecast is not a statement of fact about a future draw.',
      ],
    },
    {
      title: '4. Your prompts, uploads, and reports',
      paragraphs: [
        'You retain any rights you hold in prompts and uploaded files. You must have the right to submit them and must not upload personal, confidential, unlawful, or third-party material that you are not permitted to process.',
        'You grant us only the limited permission needed to receive, validate, temporarily store, redact, aggregate, process, and return your material to provide the requested Service, maintain security, resolve support cases, and keep the billing and audit records described in the Privacy Policy. It does not permit unrelated reuse of your content.',
        'Subject to third-party rights and these Terms, you may use your generated reports for lawful personal or internal purposes. You may not present a report as a guaranteed prediction or official lottery advice, remove material risk disclosures, or use our marks in a way that implies endorsement.',
      ],
    },
    {
      title: '5. Our intellectual property',
      paragraphs: [
        'The Service, software, interface, designs, documentation, data organization, model orchestration, and LUMA Quant names and marks are owned by us or our licensors. We grant you a personal, limited, non-exclusive, non-transferable, revocable right to use the Service through the interfaces we provide while your account remains in good standing.',
        'You may send feedback. We may use non-confidential feedback to improve the Service, but that does not transfer ownership of unrelated content or personal data to us.',
      ],
    },
    {
      title: '6. Acceptable use',
      paragraphs: [
        'You must follow the Acceptable Use Policy. In particular, do not attack or probe the Service, bypass security or rate limits, scrape restricted interfaces, manipulate credits or payment records, submit malicious files, impersonate another person, or use outputs for fraud, harassment, or unlawful activity.',
      ],
    },
    {
      title: '7. Availability and changes',
      paragraphs: [
        'We work to provide a reliable Service, but cloud infrastructure, model providers, payment providers, and data sources can be delayed or unavailable. We do not promise uninterrupted availability or that every requested feature, provider, forecast, or data layer will always be available.',
        'We may make proportionate changes for security, legal compliance, technical operation, or product improvement. If a change materially affects an active paid entitlement, we will provide reasonable notice where practical and honor mandatory consumer rights.',
      ],
    },
    {
      title: '8. Suspension, termination, and account closure',
      paragraphs: [
        'We may restrict or suspend access where reasonably necessary to investigate security incidents, payment fraud, unlawful use, material breach, or risk to other users or the Service. Where appropriate, we will give notice and an opportunity to resolve the issue. Serious or repeated abuse may result in termination.',
        'You may stop using the Service at any time and may request account deletion through support while a self-service deletion route is unavailable. Some billing, security, and legal records must be retained as described in the Privacy Policy. Credit treatment on closure is governed by the Terms of Paid Services and applicable law; credits are not automatically forfeited merely because access is reviewed.',
      ],
    },
    {
      title: '9. Warranties and liability',
      paragraphs: [
        'The Service is provided with reasonable care but without a promise that statistical outputs will predict a draw or meet every individual purpose. Nothing in these Terms excludes or limits rights or remedies that cannot lawfully be excluded, including mandatory consumer protections.',
        'To the extent permitted by law, neither party is responsible for indirect or unforeseeable loss. Any responsibility we have for a failure to perform remains subject to the circumstances, causation, mitigation, and applicable law. These Terms do not exclude liability for intentional misconduct, gross negligence, personal injury, or any other liability that cannot be limited by law.',
      ],
    },
    {
      title: '10. Law, changes to these Terms, and contact',
      paragraphs: [
        'Austrian law applies, without depriving consumers of mandatory protections available under the law of their habitual residence. Jurisdiction and dispute procedures are determined by applicable law.',
        `We may update these Terms prospectively. The version and effective date shown above identify the applicable text. Material changes will be communicated through the Service or by another reasonable method. Questions may be sent to ${LEGAL_OPERATOR.legalEmail}; technical or billing support is available at ${LEGAL_OPERATOR.supportEmail}.`,
      ],
    },
  ],
};

const privacy: LegalDocument = {
  id: 'privacy',
  path: '/legal/privacy',
  shortTitle: 'Privacy Policy',
  title: 'LUMA Quant Privacy Policy',
  summary: 'How personal data is collected, used, shared, retained, and protected.',
  sections: [
    {
      title: '1. Controller and scope',
      paragraphs: [
        `${LEGAL_OPERATOR.name}, a ${LEGAL_OPERATOR.legalForm.toLowerCase()} with its business address at ${LEGAL_OPERATOR.address}, is the controller for personal data processed through the LUMA Quant Service. Privacy contact: ${LEGAL_OPERATOR.legalEmail}.`,
        'This Policy covers the web application, account access, Advisor analyses and reports, credit purchases, feedback, support, and related operational APIs. It does not replace the separate privacy notices of Google, Apple, Stripe, Crisp, OpenAI, or Google Gemini when you choose or use those services.',
      ],
    },
    {
      title: '2. Data we process',
      paragraphs: [
        'We limit collection to data reasonably needed to provide, secure, and account for the Service.',
      ],
      bullets: [
        'Account and identity data: email address, internal user ID, display name, account status, invite or promotion redemption status, and the identity provider selected by you. We store our own Bearer access and refresh tokens in browser local storage.',
        'Service data: prompts, selected analysis settings, requested draw ranges, reports, citations, model and prompt-profile records, run status, credit reservations and ledger entries, feedback submissions, and support correspondence.',
        'Uploaded CSV data: file metadata, validation results, temporary raw content, and the redacted or aggregated statistics required for the requested analysis.',
        'Payment data: pack or pass selected, amount, currency, Stripe checkout and order identifiers, payment status, and ledger outcome. Card or bank credentials are collected by Stripe on its hosted checkout and are not stored by LUMA Quant.',
        'Technical and security data: IP address, request time, user agent or browser information, API route, response status, error and security events, and cloud service logs.',
      ],
    },
    {
      title: '3. Why we process data and our legal bases',
      paragraphs: [
        'We process account, prompt, analysis, upload, report, and transaction data as necessary to create and perform your account and Service contract under Article 6(1)(b) GDPR.',
        'We process security, abuse-prevention, reliability, support, and limited operational logs for our legitimate interests in protecting users, preventing fraud, maintaining the Service, and diagnosing faults under Article 6(1)(f) GDPR. We balance those interests against your rights.',
        'We keep invoices and financial records where required by tax, accounting, consumer, anti-fraud, or other law under Article 6(1)(c) GDPR. Where consent is the appropriate basis for an optional activity, we will ask separately and you may withdraw it prospectively.',
      ],
    },
    {
      title: '4. Cloud and service providers',
      paragraphs: [
        'We do not sell personal data and do not use third-party advertising or marketing analytics. We share only what is needed with service providers acting for the purposes described here.',
      ],
      bullets: [
        'Google Cloud: Firebase Hosting serves static frontend files; Cloud Run serves the backend; Cloud SQL stores operational account and ledger records; BigQuery stores and queries analytical datasets; Cloud Storage may temporarily hold validated uploads and release artifacts.',
        'Google and Apple: optional identity providers. The Google Identity Services library is requested only after you select "Continue with Google"; the Apple sign-in library is requested only after you select "Continue with Apple". After provider verification, the LUMA Quant backend issues its own Bearer JWTs.',
        'Stripe: hosted checkout, payment processing, payment-method presentation, fraud prevention, and webhook confirmation. Stripe is contacted only after you choose an offer, complete the required purchase acknowledgements, and select "Continue to Stripe". Checkout then opens on Stripe’s domain.',
        'Google Gemini and OpenAI: Advisor generation and quality review. They receive the prompt and the minimum approved evidence context needed for the requested run. Raw CSV rows are not used as model context; only redacted and aggregated upload information is provided.',
        'Crisp: support chat. Its script is requested only when an authenticated user explicitly opens Support from the application navigation. At that moment, we transfer the authenticated account email address and, where available, display name to Crisp so the support team can identify and reply to the correct account. We do not transfer LUMA Quant access tokens, refresh tokens, internal user IDs, Credits, prompts, uploads, or report contents through this identity bridge.',
      ],
    },
    {
      title: '5. CSV uploads and Advisor processing',
      paragraphs: [
        'Uploaded CSV files are validated for permitted format, size, encoding, and structure. Do not include names, contact details, account credentials, special-category data, or other personal information in an analysis file.',
        'Raw uploaded CSV content may be stored in protected Cloud Storage for no more than 30 days for validation, retry, support, and security purposes, and can be deleted earlier when no longer needed. Only redacted, bounded, and aggregated statistics are included in model context. We may retain file metadata, safe aggregates, report evidence, and audit references for the life of the related report or account where needed for reproducibility and billing.',
        'Prompts and report context are processed to generate the requested result and perform quality review. We do not claim broader reuse rights over your prompts, uploads, or reports.',
      ],
    },
    {
      title: '6. Retention',
      paragraphs: [
        'Account profile data, prompts, reports, run records, model versions, citations, and related safe aggregates are kept while the account and report history remain active. Following a verified deletion request, records that are not needed for an unresolved support, payment, security, or legal matter are deleted or anonymized; records isolated for such a matter are removed when that purpose and any mandatory retention period end. Provider backups expire through their controlled backup lifecycle.',
        'Raw CSV uploads are retained for no more than 30 days and may be deleted earlier. Browser tokens remain until logout, expiry, revocation, or browser deletion. Interface preferences remain until you reset them or clear site data. Checkout recovery data remains locally until the order is reconciled or cleared.',
        'Invoices, payment evidence, Credit Ledger entries, and other accounting records are generally retained for seven years after the end of the relevant calendar year under Austrian record-keeping rules, and longer only where a pending proceeding or another legal duty requires it. Routine security and operational logs are kept until the configured cloud-log rotation removes them; a relevant extract may be isolated for the duration of an active security investigation or legal claim. Because the production log-retention setting has not yet been published as a fixed number of days, this Policy does not state an invented period.',
      ],
    },
    {
      title: '7. International transfers and security',
      paragraphs: [
        'We use Google Cloud resources configured for the Service and seek EU-region processing where available. Some providers or their support operations may process data outside the European Economic Area. Where required, transfers rely on an adequacy decision, Standard Contractual Clauses, or another lawful safeguard.',
        'We use access controls, TLS, scoped service identities, input validation, rate limits, audit records, and separation between raw uploads and model context. No internet service can guarantee absolute security. Please notify us promptly if you believe your account or data has been compromised.',
      ],
    },
    {
      title: '8. Your GDPR rights',
      paragraphs: [
        `Subject to the conditions in applicable law, you may request access, correction, deletion, restriction, portability, or object to processing based on legitimate interests. You may withdraw consent where processing relies on consent. Send requests to ${LEGAL_OPERATOR.legalEmail}. We may need proportionate information to verify your identity.`,
        'LUMA Quant does not use your data to make solely automated decisions that produce legal or similarly significant effects. Advisor scores and reports are user-requested statistical outputs, not eligibility, credit, employment, or insurance decisions.',
        'You may lodge a complaint with the Austrian Data Protection Authority or the competent authority in your country of residence. We encourage you to contact us first so we can investigate.',
      ],
    },
    {
      title: '9. Children, updates, and contact',
      paragraphs: [
        'The Service is not intended for anyone under 18. If we learn that a minor supplied personal data, we will take appropriate steps to restrict the account and delete data where required.',
        `This Policy may be updated prospectively as the Service or law changes. The current version is ${LEGAL_POLICY_VERSION}. Privacy questions: ${LEGAL_OPERATOR.legalEmail}. Technical and billing support: ${LEGAL_OPERATOR.supportEmail}.`,
      ],
    },
  ],
};

const cookies: LegalDocument = {
  id: 'cookies',
  path: '/legal/cookies',
  shortTitle: 'Cookie & Storage Policy',
  title: 'LUMA Quant Cookie & Browser Storage Policy',
  summary: 'The essential browser storage and optional third-party services used by LUMA Quant.',
  sections: [
    {
      title: '1. Scope',
      paragraphs: [
        'This Policy explains cookies, local storage, and similar browser technologies used by the LUMA Quant web application. The frontend does not use Google Analytics, advertising pixels, retargeting, or marketing cookies.',
        'The application authenticates API requests with LUMA Quant Bearer access and refresh tokens stored in local storage. Local storage is data held by your browser; it is not sent automatically with every request like a cookie.',
      ],
    },
    {
      title: '2. Essential local storage',
      paragraphs: [
        'The following storage supports services you request. Blocking it can prevent sign-in, secure payment recovery, or continuity of an Advisor run.',
      ],
      bullets: [
        'Authentication: LUMA Quant access and refresh tokens, plus cleanup of obsolete token keys. Tokens persist across reloads until logout, expiry, revocation, or browser deletion.',
        'Advisor continuity: the prompt, selected horizon and tone, selected signal layers and quality controls, current run identifier, and an idempotent retry snapshot. These values let a run survive navigation or a temporary network failure.',
        'Checkout reconciliation: a pending Stripe order and request identifier, used to confirm the result after returning from hosted checkout and to prevent duplicate credit allocation.',
        'Interface preferences: for example, whether the sidebar is collapsed. These remain until changed or site data is cleared.',
      ],
    },
    {
      title: '3. Provider cookies and storage',
      paragraphs: [
        'Third-party providers may use their own cookies or storage under their policies when their service is loaded or opened.',
      ],
      bullets: [
        'Google sign-in: the Google Identity Services library is not requested merely by opening LUMA Quant. It is requested only after you select "Continue with Google". You may use email sign-in instead.',
        'Apple sign-in: the Apple sign-in library is requested only after you select "Continue with Apple". You may use email sign-in instead.',
        'Stripe: hosted checkout opens on Stripe’s domain only after you choose an offer, complete the required purchase acknowledgements, and select "Continue to Stripe". Stripe controls cookies or storage needed to display payment methods, secure checkout, remember Link choices, and prevent fraud.',
        'Crisp: the support-chat script is requested only when an authenticated user explicitly opens Support from the application navigation. When Support is opened, the authenticated account email address and, where available, display name are provided to Crisp to identify the conversation. Crisp may then use cookies or storage to maintain that support conversation. LUMA Quant access tokens, refresh tokens, and internal account identifiers are not sent to Crisp.',
      ],
    },
    {
      title: '4. No advertising or third-party analytics',
      paragraphs: [
        'We do not deploy Google Analytics, advertising pixels, cross-site behavioral tracking, or marketing cookies in the LUMA Quant application. We use limited backend and hosting logs for security, fault diagnosis, capacity, and service delivery as described in the Privacy Policy.',
      ],
    },
    {
      title: '5. Your controls',
      paragraphs: [
        'You can delete LUMA Quant local storage and provider cookies in your browser settings. Clearing tokens signs you out; clearing payment recovery data before reconciliation can delay the browser’s display of a completed purchase, although the backend and Stripe records remain authoritative.',
        'You can avoid optional Google or Apple identity processing by using email sign-in, avoid Crisp by not opening Support, and leave Stripe checkout without paying. Browser-level blocking may make the corresponding feature unavailable.',
      ],
    },
    {
      title: '6. Updates and contact',
      paragraphs: [
        `We update this Policy when browser storage or third-party services materially change. Version: ${LEGAL_POLICY_VERSION}. Questions may be sent to ${LEGAL_OPERATOR.legalEmail}.`,
      ],
    },
  ],
};

const paidServices: LegalDocument = {
  id: 'paid-services',
  path: '/legal/paid-services',
  shortTitle: 'Paid Services & Credits',
  title: 'LUMA Quant Paid Services & Credits Terms',
  summary: 'How one-time Credit packs, the calendar-month pass, billing, and refunds work.',
  sections: [
    {
      title: '1. Scope and nature of Credits',
      paragraphs: [
        'These terms supplement the Terms of Service when you purchase or use Credits or a Monthly Pass. Credits are internal accounting units used to request eligible computational services within LUMA Quant. They are not money, cryptocurrency, a bank deposit, an investment product, or a cash-equivalent stored-value instrument.',
        'Credits are personal to the account to which they are allocated. They cannot be withdrawn as cash, transferred, sold, pledged, or used outside the Service.',
      ],
    },
    {
      title: '2. Products and validity',
      paragraphs: [
        'Credit packs are one-time purchases. Current pack size, price, currency, and included Credits are shown in the Credit Store and confirmed on Stripe’s checkout page before payment. Pack Credits do not have a fixed expiry in this version.',
        'The Monthly Pass is a one-time calendar-month product, not a recurring subscription. It can currently be purchased once per calendar month, grants the number of Credits shown before purchase, and is valid only until the end of that calendar month. It does not renew automatically and no future payment is taken without a new purchase action.',
        'Promotional or welcome Credits may have separate eligibility, one-redemption, and validity rules displayed with the promotion. They are recorded in the Credit Ledger.',
      ],
    },
    {
      title: '3. Checkout and payment',
      paragraphs: [
        'Purchases use Stripe hosted checkout. LUMA Quant sends the selected product and a unique order identifier to its backend, then redirects you to Stripe. Stripe decides which payment methods are available based on country, currency, device, account, risk, and Stripe configuration. LUMA Quant does not receive or store your full payment-card or bank credentials.',
        'Before the redirect, the purchase review requires two separate, initially unchecked acknowledgements: agreement to these Paid Services Terms, and an express request for immediate delivery with acknowledgement of the effect that performance may have on a statutory withdrawal right. The backend records the accepted policy version, document hash, and timestamp with the payment order.',
        'A purchase is complete only after the backend verifies Stripe’s signed event or payment status and records the corresponding Credit Ledger transaction. A browser success page alone is not proof of allocation. Duplicate webhook delivery must not create duplicate Credits.',
      ],
    },
    {
      title: '4. Credit quotes, reservation, consumption, and restoration',
      paragraphs: [
        'Before a paid Advisor run, the Service displays an estimated or locked Credit cost derived from the selected configuration. Credits may be reserved while the run is active and consumed when the paid service is successfully delivered.',
        'If a technical failure prevents delivery, reserved Credits should be released or restored through an auditable ledger entry. If the balance does not recover automatically, contact support with the run or order identifier. A new configuration or completed run may require a new quote and charge.',
      ],
    },
    {
      title: '5. Cancellations, withdrawal, and refunds',
      paragraphs: [
        'Nothing in these terms removes mandatory consumer rights. Depending on your location and the timing of performance, you may have a statutory withdrawal or cancellation right. If you expressly request immediate supply of digital content or service, applicable law may reduce that right once performance begins or the service is fully supplied, but only where the legal requirements are met.',
        `Where a statutory withdrawal right applies and has not ended, you may exercise it by sending a clear statement to ${LEGAL_OPERATOR.legalEmail}. You may use this wording: "I hereby withdraw from the contract for [offer], ordered on [date], for account [account email], Stripe or LUMA order ID [order ID]. Name: [name]. Date: [date]." The wording is optional; an unambiguous statement is sufficient. Do not include full card or bank details. We will confirm receipt on a durable medium.`,
        'Refund requests are assessed under applicable law and the facts of the transaction, including duplicate charges, unauthorized payments, failed allocation, material non-delivery, and Credits already consumed. We do not apply a blanket no-refund rule. Stripe refunds or disputes may require a corresponding ledger correction so that the same value is not retained twice.',
        `For billing assistance, contact ${LEGAL_OPERATOR.supportEmail} with the Stripe receipt, order identifier, and account email. Do not send full card or bank credentials.`,
      ],
    },
    {
      title: '6. Pricing and product changes',
      paragraphs: [
        'We may change prices, Credit costs, or future product contents prospectively. The checkout page and server quote shown for a transaction control that transaction. A later price change does not retroactively alter a completed purchase or an already locked run cost.',
        'We may correct obvious display or configuration errors before a purchase is completed. If payment was taken on materially incorrect terms, we will provide the remedy required by applicable law.',
      ],
    },
    {
      title: '7. Account restrictions and disputes',
      paragraphs: [
        'We may pause paid functions while investigating suspected fraud, chargebacks, ledger manipulation, or unauthorized account access. Any suspension and Credit adjustment must be proportionate, recorded, and subject to applicable consumer law. Credits are not automatically forfeited for an alleged violation.',
        `Questions about these terms: ${LEGAL_OPERATOR.legalEmail}. Payment and ledger support: ${LEGAL_OPERATOR.supportEmail}.`,
      ],
    },
  ],
};

const acceptableUse: LegalDocument = {
  id: 'acceptable-use',
  path: '/legal/acceptable-use',
  shortTitle: 'Acceptable Use',
  title: 'LUMA Quant Acceptable Use Policy',
  summary: 'Practical rules that protect users, data, payments, and service reliability.',
  sections: [
    {
      title: '1. Purpose',
      paragraphs: [
        'Use LUMA Quant lawfully, respectfully, and through the interfaces and limits we provide. This Policy applies to prompts, CSV uploads, reports, feedback, support conversations, account access, payment activity, and API requests made through the application.',
      ],
    },
    {
      title: '2. Security and technical abuse',
      paragraphs: ['You must not:'],
      bullets: [
        'gain or attempt unauthorized access to accounts, data, administrative functions, credentials, secrets, source systems, or another user’s reports;',
        'probe, scan, exploit, disrupt, overload, or introduce malware into the Service or its providers;',
        'bypass authentication, invite controls, quotas, rate limits, forecast-release controls, payment checks, Credit reservations, or safety rules;',
        'automate scraping or high-volume requests outside an expressly authorized interface or written agreement;',
        'manipulate Stripe orders, webhook outcomes, the Credit Ledger, idempotency keys, or report records; or',
        'submit intentionally malformed or excessive payloads designed to create disproportionate cloud or model cost.',
      ],
    },
    {
      title: '3. Unlawful, harmful, and abusive content',
      paragraphs: ['Do not use the Service to create, submit, or distribute material that:'],
      bullets: [
        'is unlawful, fraudulent, threatening, harassing, hateful, exploitative, or intentionally invades another person’s privacy;',
        'contains malware, stolen credentials, confidential data obtained without authorization, or instructions intended to compromise systems;',
        'infringes copyright, trademark, database, privacy, or other rights; or',
        'impersonates another person or misrepresents your authority, identity, or relationship with LUMA Quant.',
      ],
    },
    {
      title: '4. Responsible presentation of reports',
      paragraphs: [
        'Do not market or distribute LUMA Quant outputs as guaranteed lottery predictions, official lottery information, financial returns, or professional advice. Do not remove warnings in order to create a misleading impression of certainty.',
        'You may discuss lawful statistical analysis, but you remain responsible for context, local gambling and advertising laws, age restrictions, and any claim you make to another person.',
      ],
    },
    {
      title: '5. Access codes, accounts, and paid features',
      paragraphs: [
        'Do not sell or trade invite or promotion codes, share an account to evade product limits, resell Credits, or obtain paid services through unauthorized payment methods or system defects. If you discover a security or billing defect, stop using it and report it to support.',
      ],
    },
    {
      title: '6. Enforcement',
      paragraphs: [
        'We may rate-limit or block a harmful request automatically to protect the Service. Depending on severity and urgency, we may warn you, remove content, restrict a feature, suspend an account during investigation, or terminate access for serious or repeated violations. We aim to act proportionately and provide notice where doing so would not create additional risk or conflict with law.',
        'An alleged violation does not automatically forfeit a Credit balance. Billing corrections, refunds, and remaining Credits are handled under the Paid Services Terms and applicable law.',
      ],
    },
    {
      title: '7. Reporting concerns',
      paragraphs: [
        `Report suspected abuse or security issues to ${LEGAL_OPERATOR.securityEmail}. The mailbox status is owner-confirmed; no response-time SLA is claimed. Include only the information needed to investigate and do not send passwords, full payment credentials, or unnecessary personal data.`,
      ],
    },
  ],
};

const copyright: LegalDocument = {
  id: 'copyright',
  path: '/legal/copyright',
  shortTitle: 'Copyright',
  title: 'LUMA Quant Copyright Complaint Policy',
  summary: 'How to report material that may infringe copyright and how affected users can respond.',
  sections: [
    {
      title: '1. Respect for rights',
      paragraphs: [
        'LUMA Quant respects copyright and expects users to submit only material they are entitled to use. This is a practical notice-and-review procedure under applicable Austrian and European law.',
      ],
    },
    {
      title: '2. Sending a complaint',
      paragraphs: [
        `Send a complaint to ${LEGAL_OPERATOR.legalEmail} with the subject "Copyright Complaint". A useful notice should include:`,
      ],
      bullets: [
        'your name and reliable contact details, and your authority if acting for a rights holder;',
        'a clear identification of the copyrighted work or protected material;',
        'the specific report ID, URL, or other location of the material you want us to review;',
        'an explanation of why you believe the use is not authorized by the rights holder or law; and',
        'information sufficient for us to understand and assess the request.',
      ],
    },
    {
      title: '3. Review and proportionate action',
      paragraphs: [
        'We may ask for clarification, preserve relevant records, temporarily restrict access where necessary, contact the affected account holder, or remove material when there is a sufficient legal or contractual basis. We may decline notices that do not identify the work or material sufficiently, are abusive, or are manifestly unfounded.',
        'Submitting a knowingly false or misleading complaint can cause harm and may create legal responsibility. Do not include unnecessary personal data or confidential material.',
      ],
    },
    {
      title: '4. Response by an affected user',
      paragraphs: [
        `If we restrict your material and you believe the complaint is mistaken, you may respond to ${LEGAL_OPERATOR.legalEmail}. Identify the affected material, explain the rights or legal basis on which you rely, and provide reliable contact details.`,
        'Where appropriate, we may share the substance of the response with the complainant and reassess the restriction. Restoration depends on the available evidence, applicable law, contractual duties, and any court or authority order.',
      ],
    },
    {
      title: '5. Repeated or serious infringement',
      paragraphs: [
        'Repeated or serious infringement may lead to proportionate account restrictions under the Terms of Service. There is no automatic forfeiture of Credits. Payment and remaining-balance questions are handled under the Paid Services Terms and mandatory law.',
      ],
    },
    {
      title: '6. Postal contact',
      paragraphs: [
        `Formal correspondence may also be sent to ${LEGAL_OPERATOR.name}, ${LEGAL_OPERATOR.address}. Email is the fastest way to identify and preserve the relevant report or account record.`,
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  imprint,
  terms,
  privacy,
  cookies,
  paidServices,
  acceptableUse,
  copyright,
];

const legalDocumentsById = new Map(
  LEGAL_DOCUMENTS.map((document) => [document.id, document]),
);

export function getLegalDocument(
  documentId: LegalDocumentId,
): LegalDocument {
  const document = legalDocumentsById.get(documentId);
  if (!document) {
    throw new Error(`Unknown legal document: ${documentId}`);
  }
  return document;
}

const CANONICAL_LEGAL_DOCUMENT_FORMAT = 'luma-legal-document-text.v1';

/**
 * Return the exact, deterministic text whose SHA-256 identifies a policy.
 *
 * Keep this deliberately simple and browser-safe: fixed field ordering, LF
 * newlines, no locale formatting, and one trailing newline. A content change
 * requires a new public policy version and new server-side digest.
 */
export function serializeCanonicalLegalDocument(
  documentId: LegalDocumentId,
): string {
  const document = getLegalDocument(documentId);
  const lines = [
    'LUMA Quant legal policy',
    `Canonical format: ${CANONICAL_LEGAL_DOCUMENT_FORMAT}`,
    `Document ID: ${document.id}`,
    `Canonical path: ${document.path}`,
    `Version: ${LEGAL_POLICY_VERSION}`,
    `Effective: ${LEGAL_EFFECTIVE_DATE}`,
    `Last updated: ${LEGAL_LAST_UPDATED_DATE}`,
    `Operator: ${LEGAL_OPERATOR.name}`,
    `Proprietor and operator: ${LEGAL_OPERATOR.proprietorName}`,
    `Legal form: ${LEGAL_OPERATOR.legalForm}`,
    `Registered trade: ${LEGAL_OPERATOR.tradeDescription}`,
    `Jurisdiction: ${LEGAL_OPERATOR.jurisdiction}`,
    `Contact address: ${LEGAL_OPERATOR.address}`,
    `Legal and privacy contact: ${LEGAL_OPERATOR.legalEmail}`,
    `Support contact: ${LEGAL_OPERATOR.supportEmail}`,
    `Security contact: ${LEGAL_OPERATOR.securityEmail}`,
    `Operator contact: ${LEGAL_OPERATOR.operatorEmail}`,
    `GISA number: ${LEGAL_OPERATOR.gisaNumber}`,
    `VAT identification number: ${LEGAL_OPERATOR.vatId}`,
    `GLN: ${LEGAL_OPERATOR.gln}`,
    `Commercial-register court: ${LEGAL_OPERATOR.commercialRegisterCourt}`,
    `Commercial-register number: ${LEGAL_OPERATOR.commercialRegisterNumber}`,
    `Competent trade authority: ${LEGAL_OPERATOR.competentTradeAuthority}`,
    `Chamber membership: ${LEGAL_OPERATOR.chamberMembership}`,
    `Public telephone: ${LEGAL_OPERATOR.publicTelephone}`,
    `Media disclosure: ${LEGAL_OPERATOR.mediaDisclosure}`,
    `X / Twitter: ${LEGAL_OPERATOR.xUrl}`,
    '',
    document.title,
    document.summary,
  ];

  for (const section of document.sections) {
    lines.push('', section.title);
    for (const paragraph of section.paragraphs) {
      lines.push(paragraph);
    }
    for (const bullet of section.bullets ?? []) {
      lines.push(`- ${bullet}`);
    }
    for (const link of section.links ?? []) {
      lines.push(`- ${link.label}: ${link.href}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Digests of serializeCanonicalLegalDocument(). These are mirrored by the
 * backend and must change only together with LEGAL_POLICY_VERSION.
 */
export const LEGAL_DOCUMENT_SHA256: Readonly<Record<LegalDocumentId, string>> = {
  imprint: 'e4854829c0b6f30cf8ae66a2682ec10ac42a55920355de55b4b513cd219247b9',
  terms: 'fc953abfaf1b97c5abdd9509d5af22c4b7f1be79bca927f5285f752d1c478f67',
  privacy: '93b695e9816577d72f8681e227d120b9ecd22e15bdc2f52285e75c7974cf755b',
  cookies: 'f04702d27b8d1701c7175ec06c3926e4802bf427ba94529accf9259e99a82a68',
  'paid-services': 'a8510ac7bfce921bf790d6eded8b2903f6b497f01a6ac3d884948f9e2ffaab7d',
  'acceptable-use': 'dd00d703cf3368ec24c705a18dc0c923c7ee09a995f450b0e6d757e0aeb96ab9',
  copyright: '812383ce974b149044b917c821d80679d7ca41375d96c3fee8841b9b393b80dc',
};

export function buildLegalDocumentDownloadText(
  documentId: LegalDocumentId,
): string {
  const digest = LEGAL_DOCUMENT_SHA256[documentId];
  return [
    `Canonical SHA-256: ${digest}`,
    'The SHA-256 applies to the canonical policy text below.',
    '',
    serializeCanonicalLegalDocument(documentId),
  ].join('\n');
}
