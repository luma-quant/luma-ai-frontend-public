import type {
  AdvisorTipCsvRow,
  AdvisorTipGeneratedScenario,
  AdvisorTipScenarioGenerateRequest,
  AdvisorTipScenarioGenerateResponse,
  AdvisorTipScenarioQuoteExpectation,
  AdvisorTipScenarioQuoteResponse,
  AdvisorTipScenarioSelection,
} from './backendData';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const CREDIT_RE = /^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/;
const TIMEZONE_SUFFIX_RE = /(?:[zZ]|[+-][0-9]{2}:[0-9]{2})$/;
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const CSV_COLUMNS = [
  'scenario_id',
  'draw_id',
  'main_1',
  'main_2',
  'main_3',
  'main_4',
  'main_5',
  'star_1',
  'star_2',
] as const;

type JsonRecord = Record<string, unknown>;

function fail(context: string): never {
  throw new Error(`The backend returned an invalid ${context}.`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, context: string): JsonRecord {
  return isRecord(value) ? value : fail(context);
}

function exactKeys(
  value: JsonRecord,
  expected: readonly string[],
  context: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length
    || actual.some((key, index) => key !== canonical[index])
  ) {
    fail(context);
  }
}

function stringValue(
  value: unknown,
  context: string,
  pattern?: RegExp,
): string {
  if (typeof value !== 'string' || !value || (pattern && !pattern.test(value))) {
    fail(context);
  }
  return value;
}

function uuid(value: unknown, context: string): string {
  return stringValue(value, context, UUID_RE).toLowerCase();
}

function sha256(value: unknown, context: string): string {
  return stringValue(value, context, SHA256_RE);
}

function integer(
  value: unknown,
  context: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    fail(context);
  }
  return value;
}

function booleanValue(value: unknown, context: string): boolean {
  return typeof value === 'boolean' ? value : fail(context);
}

function credit(value: unknown, context: string): string {
  return stringValue(value, context, CREDIT_RE);
}

function creditCents(value: string): bigint {
  const [whole, decimal] = value.split('.');
  return (BigInt(whole) * 100n) + BigInt(decimal);
}

function awareTimestamp(value: unknown, context: string): string {
  const timestamp = stringValue(value, context);
  if (!TIMEZONE_SUFFIX_RE.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    fail(context);
  }
  return timestamp;
}

function uuidList(
  value: unknown,
  context: string,
  minimum = 1,
  maximum = 5,
): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(context);
  }
  const items = value.map((item) => uuid(item, context));
  const sorted = [...items].sort();
  if (
    new Set(items).size !== items.length
    || items.some((item, index) => item !== sorted[index])
  ) {
    fail(context);
  }
  return items;
}

function sameSelection(
  actual: AdvisorTipScenarioSelection,
  expected: AdvisorTipScenarioSelection,
): boolean {
  return (
    actual.draw_id === expected.draw_id
    && actual.scenario_count === expected.scenario_count
    && actual.source_report_ids.length === expected.source_report_ids.length
    && actual.source_report_ids.every(
      (reportId, index) => reportId === expected.source_report_ids[index]?.toLowerCase(),
    )
  );
}

function parseSelectionFields(
  value: JsonRecord,
  context: string,
  minimumScenarioCount = 20,
  maximumScenarioCount = 120,
): AdvisorTipScenarioSelection {
  return {
    source_report_ids: uuidList(value.source_report_ids, `${context} report list`),
    draw_id: integer(value.draw_id, `${context} draw`, 1, POSTGRES_INTEGER_MAX),
    scenario_count: integer(
      value.scenario_count,
      `${context} count`,
      minimumScenarioCount,
      maximumScenarioCount,
    ),
  };
}

function parseGenerateRequest(
  value: unknown,
  minimumScenarioCount = 20,
  maximumScenarioCount = 120,
): AdvisorTipScenarioGenerateRequest {
  const data = record(value, 'scenario generation request');
  exactKeys(
    data,
    ['source_report_ids', 'draw_id', 'scenario_count', 'quote_id'],
    'scenario generation request',
  );
  return {
    ...parseSelectionFields(
      data,
      'scenario generation request',
      minimumScenarioCount,
      maximumScenarioCount,
    ),
    quote_id: uuid(data.quote_id, 'scenario generation quote id'),
  };
}

export function parseAdvisorTipScenarioSelection(
  value: unknown,
): AdvisorTipScenarioSelection {
  const data = record(value, 'scenario quote request');
  exactKeys(
    data,
    ['source_report_ids', 'draw_id', 'scenario_count'],
    'scenario quote request',
  );
  return parseSelectionFields(data, 'scenario quote request');
}

export function parseAdvisorTipScenarioGenerateRequest(
  value: unknown,
): AdvisorTipScenarioGenerateRequest {
  return parseGenerateRequest(value);
}

export function parseAdvisorTipScenarioIdempotencyKey(value: unknown): string {
  return uuid(value, 'scenario generation idempotency key');
}

export function parseAdvisorTipScenarioQuoteExpectation(
  value: unknown,
  expectedRequest: AdvisorTipScenarioGenerateRequest,
): AdvisorTipScenarioQuoteExpectation {
  const data = record(value, 'scenario generation quote expectation');
  exactKeys(data, [
    'quote_id',
    'pricing_version',
    'unit_price_credits',
    'total_credits',
    'evidence_sha256',
    'sampling_sha256',
  ], 'scenario generation quote expectation');
  const quoteId = uuid(data.quote_id, 'scenario generation expected quote id');
  const unitPrice = credit(
    data.unit_price_credits,
    'scenario generation expected unit price',
  );
  const total = credit(
    data.total_credits,
    'scenario generation expected total',
  );
  const pricingVersion = data.pricing_version;
  if (
    quoteId !== expectedRequest.quote_id.toLowerCase()
    || (pricingVersion !== 'advisor-tip-scenarios-v1'
      && pricingVersion !== 'advisor-tip-scenarios-v2')
    || creditCents(unitPrice) <= 0n
    || creditCents(total) !== creditCents(unitPrice) * BigInt(expectedRequest.scenario_count)
  ) {
    fail('scenario generation quote expectation');
  }
  return {
    quote_id: quoteId,
    pricing_version: pricingVersion,
    unit_price_credits: unitPrice,
    total_credits: total,
    evidence_sha256: sha256(
      data.evidence_sha256,
      'scenario generation expected evidence digest',
    ),
    sampling_sha256: sha256(
      data.sampling_sha256,
      'scenario generation expected sampling digest',
    ),
  };
}

function assertExpectedSelection(
  actual: AdvisorTipScenarioSelection,
  expected: AdvisorTipScenarioSelection,
  context: string,
): void {
  const canonicalExpected: AdvisorTipScenarioSelection = {
    source_report_ids: expected.source_report_ids.map((value) => value.toLowerCase()),
    draw_id: expected.draw_id,
    scenario_count: expected.scenario_count,
  };
  if (!sameSelection(actual, canonicalExpected)) fail(context);
}

export function parseAdvisorTipScenarioQuoteResponse(
  value: unknown,
  expectedRequest: AdvisorTipScenarioSelection,
): AdvisorTipScenarioQuoteResponse {
  const canonicalExpectedRequest = parseAdvisorTipScenarioSelection(expectedRequest);
  const data = record(value, 'scenario quote');
  exactKeys(data, [
    'quote_id',
    'pricing_version',
    'source_report_ids',
    'draw_id',
    'scenario_count',
    'unit_price_credits',
    'total_credits',
    'current_balance',
    'projected_balance',
    'missing_credits',
    'can_generate',
    'evidence_sha256',
    'sampling_sha256',
    'expires_at',
    'limits',
  ], 'scenario quote');

  const selection = parseSelectionFields(data, 'scenario quote');
  assertExpectedSelection(
    selection,
    canonicalExpectedRequest,
    'scenario quote selection',
  );
  const unitPrice = credit(data.unit_price_credits, 'scenario quote unit price');
  const total = credit(data.total_credits, 'scenario quote total');
  const current = credit(data.current_balance, 'scenario quote balance');
  const projected = credit(data.projected_balance, 'scenario quote projected balance');
  const missing = credit(data.missing_credits, 'scenario quote missing credits');
  const canGenerate = booleanValue(data.can_generate, 'scenario quote availability');
  const unitCents = creditCents(unitPrice);
  const totalCents = creditCents(total);
  const currentCents = creditCents(current);
  const projectedCents = creditCents(projected);
  const missingCents = creditCents(missing);
  if (
    unitCents <= 0n
    || totalCents !== unitCents * BigInt(selection.scenario_count)
    || projectedCents !== (currentCents > totalCents ? currentCents - totalCents : 0n)
    || missingCents !== (totalCents > currentCents ? totalCents - currentCents : 0n)
    || canGenerate !== (missingCents === 0n)
  ) {
    fail('scenario quote credit calculation');
  }

  const limits = record(data.limits, 'scenario quote limits');
  exactKeys(
    limits,
    ['max_source_reports', 'min_scenarios', 'max_scenarios'],
    'scenario quote limits',
  );
  if (
    limits.max_source_reports !== 5
    || limits.min_scenarios !== 20
    || limits.max_scenarios !== 120
  ) {
    fail('scenario quote limits');
  }
  if (data.pricing_version !== 'advisor-tip-scenarios-v2') {
    fail('scenario quote pricing version');
  }

  return {
    ...selection,
    quote_id: uuid(data.quote_id, 'scenario quote id'),
    pricing_version: 'advisor-tip-scenarios-v2',
    unit_price_credits: unitPrice,
    total_credits: total,
    current_balance: current,
    projected_balance: projected,
    missing_credits: missing,
    can_generate: canGenerate,
    evidence_sha256: sha256(data.evidence_sha256, 'scenario quote evidence digest'),
    sampling_sha256: sha256(data.sampling_sha256, 'scenario quote sampling digest'),
    expires_at: awareTimestamp(data.expires_at, 'scenario quote expiry'),
    limits: { max_source_reports: 5, min_scenarios: 20, max_scenarios: 120 },
  };
}

function numberTuple(
  value: unknown,
  context: string,
  length: 2 | 5,
  maximum: number,
): number[] {
  if (!Array.isArray(value) || value.length !== length) fail(context);
  const numbers = value.map((item) => integer(item, context, 1, maximum));
  if (
    new Set(numbers).size !== length
    || numbers.some((item, index) => index > 0 && item <= numbers[index - 1])
  ) {
    fail(context);
  }
  return numbers;
}

function parseScenario(
  value: unknown,
  expectedDraw: number,
  expectedPosition: number,
  expectTicketId: boolean,
): AdvisorTipGeneratedScenario {
  const data = record(value, 'generated scenario');
  exactKeys(
    data,
    ['id', 'ticket_id', 'position', 'draw_id', 'main_numbers', 'star_numbers', 'numbers_key'],
    'generated scenario',
  );
  const id = uuid(data.id, 'generated scenario id');
  const ticketId = data.ticket_id === null
    ? null
    : uuid(data.ticket_id, 'generated ticket id');
  const position = integer(data.position, 'generated scenario position', 1, 120);
  const drawId = integer(data.draw_id, 'generated scenario draw', 1, POSTGRES_INTEGER_MAX);
  const main = numberTuple(data.main_numbers, 'generated main numbers', 5, 50);
  const stars = numberTuple(data.star_numbers, 'generated star numbers', 2, 12);
  const numbersKey = stringValue(
    data.numbers_key,
    'generated numbers key',
    /^[0-9]{2}(?:-[0-9]{2}){6}$/,
  );
  const expectedKey = [...main, ...stars]
    .map((number) => String(number).padStart(2, '0'))
    .join('-');
  if (
    position !== expectedPosition
    || drawId !== expectedDraw
    || numbersKey !== expectedKey
    || (expectTicketId ? ticketId === null : ticketId !== null)
  ) {
    fail('generated scenario consistency');
  }
  return {
    id,
    ticket_id: ticketId,
    position,
    draw_id: drawId,
    main_numbers: main as AdvisorTipGeneratedScenario['main_numbers'],
    star_numbers: stars as AdvisorTipGeneratedScenario['star_numbers'],
    numbers_key: numbersKey,
  };
}

function parseCsvRow(
  value: unknown,
  scenario: AdvisorTipGeneratedScenario,
): AdvisorTipCsvRow {
  const data = record(value, 'scenario CSV row');
  exactKeys(data, CSV_COLUMNS, 'scenario CSV row');
  const row: AdvisorTipCsvRow = {
    scenario_id: uuid(data.scenario_id, 'scenario CSV id'),
    draw_id: integer(data.draw_id, 'scenario CSV draw', 1, POSTGRES_INTEGER_MAX),
    main_1: integer(data.main_1, 'scenario CSV main number', 1, 50),
    main_2: integer(data.main_2, 'scenario CSV main number', 1, 50),
    main_3: integer(data.main_3, 'scenario CSV main number', 1, 50),
    main_4: integer(data.main_4, 'scenario CSV main number', 1, 50),
    main_5: integer(data.main_5, 'scenario CSV main number', 1, 50),
    star_1: integer(data.star_1, 'scenario CSV star number', 1, 12),
    star_2: integer(data.star_2, 'scenario CSV star number', 1, 12),
  };
  const expectedValues = [
    scenario.id,
    scenario.draw_id,
    ...scenario.main_numbers,
    ...scenario.star_numbers,
  ];
  if (
    Object.values(row).some((item, index) => item !== expectedValues[index])
  ) {
    fail('scenario CSV consistency');
  }
  return row;
}

function parseCsv(
  value: unknown,
  generationId: string,
  drawId: number,
  scenarios: AdvisorTipGeneratedScenario[],
): AdvisorTipScenarioGenerateResponse['csv'] {
  const data = record(value, 'scenario CSV');
  exactKeys(data, ['filename', 'content_type', 'columns', 'rows', 'content'], 'scenario CSV');
  const expectedFilename = `luma-advisor-scenarios-D${drawId}-${generationId}.csv`;
  if (data.filename !== expectedFilename || data.content_type !== 'text/csv; charset=utf-8') {
    fail('scenario CSV metadata');
  }
  if (
    !Array.isArray(data.columns)
    || data.columns.length !== CSV_COLUMNS.length
    || data.columns.some((item, index) => item !== CSV_COLUMNS[index])
    || !Array.isArray(data.rows)
    || data.rows.length !== scenarios.length
  ) {
    fail('scenario CSV structure');
  }
  const rows = data.rows.map((row, index) => parseCsvRow(row, scenarios[index]));
  const content = stringValue(data.content, 'scenario CSV content');
  if (content.length > 16_384) fail('scenario CSV content');
  const normalizedLines = content.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const expectedLines = [
    CSV_COLUMNS.join(','),
    ...rows.map((row) => Object.values(row).join(',')),
  ];
  if (
    normalizedLines.length !== expectedLines.length
    || normalizedLines.some((line, index) => line !== expectedLines[index])
  ) {
    fail('scenario CSV content');
  }
  return {
    filename: expectedFilename,
    content_type: 'text/csv; charset=utf-8',
    columns: [...CSV_COLUMNS],
    rows,
    content,
  };
}

function parseProvenance(
  value: unknown,
  sourceReportIds: string[],
): AdvisorTipScenarioGenerateResponse['provenance'] {
  const data = record(value, 'scenario provenance');
  const isV2 = data.contract_version === 'luma.advisor-tip-provenance.v2';
  const commonKeys = [
        'contract_version',
        'algorithm_version',
        'evidence_projection',
        'main_selection_basis',
        'star_selection_basis',
        'winning_probability_claimed',
        'evidence_sha256',
        'sampling_sha256',
        'source_reports',
        'raw_report_text_used',
        'raw_user_prompt_used',
        'external_provider_called',
  ] as const;
  const assistantKeys = [
        'assistant_mode',
        'assistant_input_sha256',
        'assistant_output_sha256',
  ] as const;
  const hasAssistantFields = assistantKeys.every((key) => key in data);
  exactKeys(
    data,
    hasAssistantFields ? [...commonKeys, ...assistantKeys] : commonKeys,
    'scenario provenance',
  );
  if (isV2 && !hasAssistantFields) fail('scenario provenance');
  const externalProviderCalled = booleanValue(
    data.external_provider_called,
    'scenario provenance provider flag',
  );
  if (
    (isV2
      ? data.algorithm_version !== 'advisor-evidence-sampler-v2'
      : data.contract_version !== 'luma.advisor-tip-provenance.v1'
        || data.algorithm_version !== 'advisor-evidence-sampler-v1')
    || data.evidence_projection !== 'VALIDATED_READER_SUMMARY'
    || data.main_selection_basis !== 'VALIDATED_REPORT_EVIDENCE_WEIGHTS'
    || data.star_selection_basis !== 'EVIDENCE_SEEDED_NEUTRAL_DOMAIN_WITH_REPORT_WEIGHTS'
    || data.winning_probability_claimed !== false
    || data.raw_report_text_used !== false
    || data.raw_user_prompt_used !== false
    || !Array.isArray(data.source_reports)
    || data.source_reports.length !== sourceReportIds.length
  ) {
    fail('scenario provenance');
  }
  const sourceReports = data.source_reports.map((item, index) => {
    const source = record(item, 'scenario provenance source');
    exactKeys(source, ['report_id', 'artifact_id', 'artifact_sha256'], 'scenario provenance source');
    const reportId = uuid(source.report_id, 'scenario provenance report id');
    if (reportId !== sourceReportIds[index]) fail('scenario provenance report order');
    return {
      report_id: reportId,
      artifact_id: uuid(source.artifact_id, 'scenario provenance artifact id'),
      artifact_sha256: sha256(source.artifact_sha256, 'scenario provenance artifact digest'),
    };
  });
  const assistantMode = hasAssistantFields
    ? stringValue(
        data.assistant_mode,
        'scenario provenance assistant mode',
        /^(?:gpt-5\.6-sol|deterministic_fallback)$/,
      ) as 'gpt-5.6-sol' | 'deterministic_fallback'
    : undefined;
  const assistantInputSha256 = hasAssistantFields
    ? sha256(data.assistant_input_sha256, 'scenario provenance assistant input digest')
    : undefined;
  const assistantOutputSha256 = hasAssistantFields
    ? data.assistant_output_sha256 === null
      ? null
      : sha256(data.assistant_output_sha256, 'scenario provenance assistant output digest')
    : undefined;
  if (
    hasAssistantFields
    && (
      (assistantMode === 'gpt-5.6-sol'
        && (!externalProviderCalled || assistantOutputSha256 === null))
      || (assistantMode === 'deterministic_fallback'
        && (externalProviderCalled || assistantOutputSha256 !== null))
    )
  ) {
    fail('scenario provenance assistant consistency');
  }
  const samplingSha256 = sha256(
    data.sampling_sha256,
    'scenario provenance sampling digest',
  );
  if (
    !isV2
    && hasAssistantFields
    && (
      assistantMode !== 'deterministic_fallback'
      || assistantInputSha256 !== samplingSha256
      || assistantOutputSha256 !== null
      || externalProviderCalled
    )
  ) {
    fail('scenario provenance legacy assistant consistency');
  }
  return {
    contract_version: isV2
      ? 'luma.advisor-tip-provenance.v2'
      : 'luma.advisor-tip-provenance.v1',
    algorithm_version: isV2
      ? 'advisor-evidence-sampler-v2'
      : 'advisor-evidence-sampler-v1',
    evidence_projection: 'VALIDATED_READER_SUMMARY',
    main_selection_basis: 'VALIDATED_REPORT_EVIDENCE_WEIGHTS',
    star_selection_basis: 'EVIDENCE_SEEDED_NEUTRAL_DOMAIN_WITH_REPORT_WEIGHTS',
    winning_probability_claimed: false,
    evidence_sha256: sha256(data.evidence_sha256, 'scenario provenance evidence digest'),
    sampling_sha256: samplingSha256,
    source_reports: sourceReports,
    raw_report_text_used: false,
    raw_user_prompt_used: false,
    ...(hasAssistantFields ? {
      assistant_mode: assistantMode,
      assistant_input_sha256: assistantInputSha256,
      assistant_output_sha256: assistantOutputSha256,
    } : {}),
    external_provider_called: externalProviderCalled,
  };
}

export function parseAdvisorTipScenarioGenerateResponse(
  value: unknown,
  expectedRequest: AdvisorTipScenarioGenerateRequest,
  expectedQuote: AdvisorTipScenarioQuoteExpectation,
): AdvisorTipScenarioGenerateResponse {
  const expectedQuoteData = record(
    expectedQuote,
    'scenario generation quote expectation',
  );
  const expectsLegacyV1 = expectedQuoteData.pricing_version === 'advisor-tip-scenarios-v1';
  const canonicalExpectedRequest = parseGenerateRequest(
    expectedRequest,
    expectsLegacyV1 ? 1 : 20,
    expectsLegacyV1 ? 20 : 120,
  );
  const canonicalExpectedQuote = parseAdvisorTipScenarioQuoteExpectation(
    expectedQuote,
    canonicalExpectedRequest,
  );
  const data = record(value, 'scenario generation response');
  exactKeys(data, [
    'status',
    'generation_id',
    'quote_id',
    'idempotent',
    'source_report_ids',
    'draw_id',
    'scenario_count',
    'pricing_version',
    'unit_price_credits',
    'credits_charged',
    'balance_after',
    'automatic_betting',
    'saved_to_tickets',
    'ticket_ids',
    'scenarios',
    'csv',
    'provenance',
  ], 'scenario generation response');
  const pricingVersion = data.pricing_version;
  const isV2 = pricingVersion === 'advisor-tip-scenarios-v2';
  const selection = parseSelectionFields(
    data,
    'scenario generation response',
    pricingVersion === 'advisor-tip-scenarios-v1' ? 1 : 20,
    pricingVersion === 'advisor-tip-scenarios-v1' ? 20 : 120,
  );
  assertExpectedSelection(
    selection,
    canonicalExpectedRequest,
    'scenario generation selection',
  );
  const generationId = uuid(data.generation_id, 'scenario generation id');
  const quoteId = uuid(data.quote_id, 'scenario generation quote id');
  const status = data.status;
  const savedToTickets = data.saved_to_tickets;
  const isPendingDelivery = status === 'pending_delivery';
  if (
    (status !== 'generated' && !isPendingDelivery)
    || (pricingVersion !== 'advisor-tip-scenarios-v1' && !isV2)
    || pricingVersion !== canonicalExpectedQuote.pricing_version
    || quoteId !== canonicalExpectedRequest.quote_id
    || data.automatic_betting !== false
    || typeof savedToTickets !== 'boolean'
    || !Array.isArray(data.scenarios)
    || data.scenarios.length !== selection.scenario_count
    || (isPendingDelivery && (!isV2 || savedToTickets))
    || (isV2 && status === 'generated' && !savedToTickets)
    || (!isV2 && (status !== 'generated' || savedToTickets))
  ) {
    fail('scenario generation contract');
  }
  const scenarios = data.scenarios.map((item, index) => (
    parseScenario(item, selection.draw_id, index + 1, savedToTickets)
  ));
  if (!Array.isArray(data.ticket_ids)) {
    fail('generated ticket mapping');
  }
  const ticketIds = data.ticket_ids.map((item) => uuid(item, 'generated ticket id'));
  if (
    new Set(scenarios.map(({ id }) => id)).size !== scenarios.length
    || new Set(scenarios.map(({ numbers_key }) => numbers_key)).size !== scenarios.length
    || (savedToTickets
      ? ticketIds.length !== scenarios.length
        || new Set(ticketIds).size !== ticketIds.length
        || scenarios.some((scenario, index) => scenario.ticket_id !== ticketIds[index])
      : ticketIds.length !== 0
        || scenarios.some((scenario) => scenario.ticket_id !== null))
  ) {
    fail('scenario generation uniqueness');
  }
  const unitPrice = credit(data.unit_price_credits, 'scenario generation unit price');
  const charged = credit(data.credits_charged, 'scenario generation charge');
  const balanceAfter = credit(data.balance_after, 'scenario generation balance');
  if (
    creditCents(unitPrice) <= 0n
    || creditCents(charged) !== creditCents(unitPrice) * BigInt(selection.scenario_count)
  ) {
    fail('scenario generation credit calculation');
  }
  const csv = parseCsv(data.csv, generationId, selection.draw_id, scenarios);
  const provenance = parseProvenance(data.provenance, selection.source_report_ids);
  if (
    quoteId !== canonicalExpectedQuote.quote_id
    || unitPrice !== canonicalExpectedQuote.unit_price_credits
    || charged !== canonicalExpectedQuote.total_credits
    || provenance.evidence_sha256 !== canonicalExpectedQuote.evidence_sha256
    || provenance.sampling_sha256 !== canonicalExpectedQuote.sampling_sha256
    || (isV2
      ? provenance.contract_version !== 'luma.advisor-tip-provenance.v2'
        || provenance.algorithm_version !== 'advisor-evidence-sampler-v2'
      : provenance.contract_version !== 'luma.advisor-tip-provenance.v1'
        || provenance.algorithm_version !== 'advisor-evidence-sampler-v1')
  ) {
    fail('scenario generation quote binding');
  }
  const common = {
    ...selection,
    generation_id: generationId,
    quote_id: quoteId,
    idempotent: booleanValue(data.idempotent, 'scenario generation replay flag'),
    unit_price_credits: unitPrice,
    credits_charged: charged,
    balance_after: balanceAfter,
    automatic_betting: false as const,
    scenarios,
    csv,
    provenance,
  };
  if (isPendingDelivery) {
    return {
      ...common,
      status: 'pending_delivery',
      pricing_version: 'advisor-tip-scenarios-v2',
      saved_to_tickets: false,
      ticket_ids: [],
    };
  }
  if (!isV2) {
    return {
      ...common,
      status: 'generated',
      pricing_version: 'advisor-tip-scenarios-v1',
      saved_to_tickets: false,
      ticket_ids: [],
    };
  }
  return {
    ...common,
    status: 'generated',
    pricing_version: 'advisor-tip-scenarios-v2',
    saved_to_tickets: true,
    ticket_ids: ticketIds,
  };
}
