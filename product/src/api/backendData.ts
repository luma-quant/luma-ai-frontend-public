import apiClient from './apiClient';
import {
  parseAdvisorTipScenarioGenerateResponse,
  parseAdvisorTipScenarioGenerateRequest,
  parseAdvisorTipScenarioIdempotencyKey,
  parseAdvisorTipScenarioQuoteExpectation,
  parseAdvisorTipScenarioQuoteResponse,
  parseAdvisorTipScenarioSelection,
} from './advisorTipScenarioContract';

export type CreditString = string;
export type AdvisorTone = 'standard' | 'expert' | 'analytical' | 'exploratory';
export type EvaluationStatus =
  | 'waiting_for_upload'
  | 'pending_engine'
  | 'pending_users'
  | 'pending_retry'
  | 'completed';

export interface WinningNumbers {
  main: [number, number, number, number, number];
  stars: [number, number];
}

export interface EvaluationSummary {
  total_hits: Record<string, unknown>;
  minimum_hit_threshold?: '2+0';
  qualifying_combination_count?: number;
  state_transitions: Record<string, unknown>;
}

export interface EvaluationDrawListItem {
  draw_id: number;
  draw_date: string;
  winning_numbers: WinningNumbers;
  availability: {
    result: boolean;
    universe_manifest: boolean;
    exact_500k: boolean;
    evaluation: boolean;
    summary: boolean;
    analytics: boolean;
  };
  universe: { total_rows: number } | null;
  evaluation: {
    status: EvaluationStatus;
    modules: string[];
    summary: EvaluationSummary | null;
  };
}

export interface EvaluationDrawListResponse {
  items: EvaluationDrawListItem[];
  has_more: boolean;
  next_before_draw_id: number | null;
}

export type EngineUniverseDraw = EvaluationDrawListItem & {
  availability: EvaluationDrawListItem['availability'] & {
    summary: true;
  };
  evaluation: EvaluationDrawListItem['evaluation'] & {
    status: 'completed';
    summary: EvaluationSummary & {
      qualifying_combination_count: number;
    };
  };
};

export interface EvaluationSummaryResponse extends EvaluationSummary {
  draw_id: number;
}

export interface EvaluationModuleResponse {
  draw_id: number;
  module_name: string;
  metrics: Record<string, unknown>;
}

export interface TicketNumbers {
  main_numbers: [number, number, number, number, number];
  core_numbers: [number, number];
}

export interface SavedTicket extends TicketNumbers {
  id: string;
  draw_id: number;
  created_at: string;
}

export interface SaveTicketResponse {
  status: 'saved';
  idempotent: boolean;
  ticket: SavedTicket;
}

export interface UpdateTicketResponse {
  status: 'updated';
  ticket: SavedTicket;
}

export interface DeleteTicketResponse {
  status: 'deleted';
  ticket_id: string;
  draw_id: number;
}

export interface TicketEvaluationItem extends SavedTicket {
  source_type: 'manual' | 'purchased' | 'legacy';
  match_main: number | null;
  match_core: number | null;
  match_category: string | null;
  payout_status: string;
  evaluated_at: string | null;
}

export interface TicketEvaluationResponse {
  draw_id: number;
  status: 'waiting_for_result' | 'waiting_for_projection' | 'completed';
  winning_numbers: TicketNumbers | null;
  count: number;
  items: TicketEvaluationItem[];
}

export interface TicketScoreboardPlayer {
  rank: number;
  player_name: string;
  is_current_user: boolean;
  ticket_count: number;
  best_hit: string | null;
  best_hit_main: number | null;
  best_hit_core: number | null;
}

export interface EngineBestHit {
  match_category: string;
  match_main: number;
  match_core: number;
  hit_count: number;
}

export interface TicketScoreboardResponse {
  draw_id: number;
  status: 'waiting_for_result' | 'waiting_for_projection' | 'completed';
  player_count: number;
  total_tickets: number;
  returned_player_count: number;
  has_more: boolean;
  players: TicketScoreboardPlayer[];
  best_engine_hit: EngineBestHit | null;
  best_engine_hits?: EngineBestHit[];
}

export interface TicketScoreboardRequestOptions {
  includeAllPlayers?: boolean;
}

export const QUALIFYING_HIT_CATEGORIES = [
  '5+2', '5+1', '5+0',
  '4+2', '4+1', '4+0',
  '3+2', '3+1', '3+0',
  '2+2', '2+1', '2+0',
] as const;

export type HitCategory = typeof QUALIFYING_HIT_CATEGORIES[number];

export interface HitPyramidItem {
  category: HitCategory;
  count: number;
}

interface QualifyingHitCountSource {
  qualifying_combination_count?: unknown;
  total_hits?: unknown;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
  );
}

/**
 * Select the backend-complete draws that can be rendered in Engine Universe.
 *
 * A draw becomes visible only after the backend publishes the completed
 * evaluation, its summary availability, and the validated qualifying-count
 * scalar. There is deliberately no draw-id threshold: once a future draw
 * satisfies the contract, it naturally appears first.
 */
export function selectEngineUniverseDraws(
  items: readonly EvaluationDrawListItem[],
): EngineUniverseDraw[] {
  return items
    .filter((item): item is EngineUniverseDraw => (
      item.evaluation.status === 'completed'
      && item.availability.summary
      && item.evaluation.summary !== null
      && isNonNegativeSafeInteger(
        item.evaluation.summary.qualifying_combination_count,
      )
    ))
    .sort((left, right) => right.draw_id - left.draw_id);
}

/**
 * Resolve the number displayed on a draw card.
 *
 * New backends publish the already validated scalar. Older responses only
 * contain the full hit distribution, so sum the twelve supported qualifying
 * categories there. Missing categories mean zero; malformed counts make the
 * value unavailable instead of displaying a misleading partial total.
 */
export function getQualifyingCombinationCount(
  source: QualifyingHitCountSource | null | undefined,
): number | null {
  if (!source || typeof source !== 'object') return null;

  if (source.qualifying_combination_count !== undefined) {
    return isNonNegativeSafeInteger(source.qualifying_combination_count)
      ? source.qualifying_combination_count
      : null;
  }

  const totalHits = source.total_hits;
  if (
    typeof totalHits !== 'object'
    || totalHits === null
    || Array.isArray(totalHits)
  ) {
    return null;
  }

  let total = 0;
  for (const category of QUALIFYING_HIT_CATEGORIES) {
    const value = (totalHits as Record<string, unknown>)[category];
    if (value === undefined) continue;
    if (!isNonNegativeSafeInteger(value)) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

/**
 * Return the canonical twelve-category pyramid in a deterministic order.
 * Missing or malformed provider entries are represented as zero.
 */
export function normalizeHitPyramid(
  items: readonly HitPyramidItem[] | null | undefined,
): HitPyramidItem[] {
  const counts = new Map<HitCategory, number>();
  for (const item of items ?? []) {
    if (
      QUALIFYING_HIT_CATEGORIES.includes(item.category)
      && isNonNegativeSafeInteger(item.count)
    ) {
      counts.set(item.category, item.count);
    }
  }
  return QUALIFYING_HIT_CATEGORIES.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }));
}

/**
 * Resolve the published hit distribution used by the draw detail view.
 *
 * The BigQuery analytics projection is preferred when it is available. A
 * completed evaluation already contains the same canonical twelve counts in
 * its summary, though, so the UI must not display "sync pending" while those
 * published counts are present (for example immediately after draw close).
 */
export function resolveHitPyramid(
  analyticsItems: readonly HitPyramidItem[] | null | undefined,
  summaryTotalHits: Record<string, unknown> | null | undefined,
): HitPyramidItem[] {
  if (analyticsItems && analyticsItems.length > 0) {
    return normalizeHitPyramid(analyticsItems);
  }

  const summaryItems: HitPyramidItem[] = [];
  for (const category of QUALIFYING_HIT_CATEGORIES) {
    const count = summaryTotalHits?.[category];
    if (isNonNegativeSafeInteger(count)) {
      summaryItems.push({ category, count });
    }
  }
  return normalizeHitPyramid(summaryItems);
}

export interface UniverseCombination {
  universe_index: number;
  wave: number;
  bucket: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'R' | 'P';
  main_numbers: [number, number, number, number, number];
  core_numbers: [number, number];
  main_hits: number;
  core_hits: number;
  hit_category: string;
}

export interface UniverseAnalyticsResponse {
  draw_id: number;
  provider: 'bigquery';
  aggregation_source: 'bigquery_hit_gate';
  combinations_source: 'bigquery_hit_gate';
  minimum_hit_threshold: '2+0';
  qualifying_combination_count: number;
  hit_pyramid: HitPyramidItem[];
  top_combinations: UniverseCombination[];
}

export interface SprintStatePublic {
  sprint: string;
  closed_draw: number;
  forecast_draw: number;
  actual_mains_closed_draw: string;
  actual_stars_closed_draw: string;
  enmf_state: string;
  ready_for_gemini_data_contract: boolean;
  details: Record<string, unknown>;
  received_at: string;
}

export interface SprintInfoResponse {
  state: SprintStatePublic;
  final_review: {
    available: boolean;
    member_count: number;
    summary: Record<string, unknown>;
    artifacts: Array<Record<string, unknown>>;
    received_at: string;
  } | null;
}

export type EnginePipelineStatus =
  | 'INGESTION'
  | 'NORMALIZATION'
  | 'FEATURE_ENGINEERING'
  | 'SIGNAL_ANALYSIS'
  | 'VALIDATION'
  | 'READY_FOR_CUTOFF';

export interface EngineStatusResponse {
  draw_id: number;
  timezone: 'Europe/Vienna';
  last_draw_at: string;
  cutoff_at: string;
  remaining_seconds: number;
  block_index_since_last_draw: number;
  block_label: string;
  block_started_at: string;
  block_ends_at: string;
  pipeline_status: EnginePipelineStatus;
  cycle_status: 'OPEN' | 'CLOSED' | null;
  pipeline_steps: Array<{
    step_order: number;
    step_name: EnginePipelineStatus;
    status: 'PENDING' | 'COMPLETED';
    completed_at: string | null;
    completion_source: string | null;
  }>;
  released_draw_id?: number | null;
  pending_draw_id?: number | null;
  lifecycle_status?: 'ACTIVE_FORECAST' | 'WAITING_FOR_SPRINTSTATE';
  pending_cutoff_at?: string | null;
  pending_pipeline_status?: EnginePipelineStatus | null;
  pending_pipeline_steps?: Array<{
    step_order: number;
    step_name: EnginePipelineStatus;
    status: 'ELAPSED' | 'ACTIVE' | 'UPCOMING';
    window_started_at: string;
    window_ends_at: string;
    projection_source: 'SERVER_TIME';
  }>;
}

export interface RecentIntelligenceEntry {
  id: string;
  title: string;
  body: string;
  image_key: 'luma-release';
  release_date: string;
  message: string;
  created_at: string;
}

export interface RecentIntelligenceResponse {
  items: RecentIntelligenceEntry[];
}

export interface AdvisorOptionDefinition {
  id: string;
  label: string;
  description: string;
  credit_surcharge: CreditString;
  available: boolean;
  unavailable_reason: string | null;
}

export type AdvisorAnalysisScope = 'forecast' | 'historical';

export interface AdvisorConfigResponse {
  contract_version: 'luma.advisor.v8.1';
  pricing_version: 'advisor-pricing-v4';
  enabled: boolean;
  active_forecast_draw: number | null;
  last_release_draw: number | null;
  pending_forecast_draw: number | null;
  lifecycle_status: 'ACTIVE' | 'WAITING_FOR_NEXT_RELEASE' | 'UNAVAILABLE';
  unavailable_reason: string | null;
  historical_analysis_available: boolean;
  latest_history_draw: number | null;
  historical_anchor_draw: number | null;
  forecast_analysis_available: boolean;
  earliest_history_draw: number;
  earliest_signal_history_draw: number;
  latest_closed_draw: number | null;
  luma_pro: {
    id: 'luma_pro';
    label: string;
    description: string;
    price_multiplier: '2.00';
    available: boolean;
    unavailable_reason: string | null;
  };
  deep_evidence: {
    id: 'deep_evidence';
    label: string;
    description: string;
    price_multiplier: '3.00';
    available: boolean;
    unavailable_reason: string | null;
  };
  tones: AdvisorOptionDefinition[];
  signal_layers: AdvisorOptionDefinition[];
  quality_controls: AdvisorOptionDefinition[];
  csv_upload: AdvisorOptionDefinition;
  pdf_report: AdvisorOptionDefinition;
  csv_limits: Record<string, number>;
  standard_preset: Record<string, unknown>;
}

export interface AdvisorAvailabilityResponse {
  analysis_scope: AdvisorAnalysisScope;
  forecast_draw: number;
  history_end_draw: number;
  base_contract_available: boolean;
  historical_facts_available: boolean;
  historical_facts_reason: string | null;
  recent_shadow_available: boolean;
  earliest_history_draw: number;
  earliest_signal_history_draw: number;
  layers: Array<{
    layer_id: string;
    available: boolean;
    source: string | null;
    reason: string | null;
    earliest_history_draw: number | null;
    latest_history_draw: number | null;
  }>;
  warnings: string[];
}

export interface AdvisorUploadPreviewResponse {
  upload_id: string;
  status: 'UPLOADED' | 'VALIDATING' | 'READY' | 'REJECTED' | 'CONSUMED' | 'DELETED';
  original_filename: string;
  sha256: string;
  file_size_bytes: number;
  row_count_detected: number;
  row_count_accepted: number;
  row_count_rejected: number;
  column_count: number;
  delimiter: string | null;
  encoding: string | null;
  header_detected: boolean;
  headers: string[];
  inferred_schema: Record<string, unknown>;
  profile: Record<string, unknown>;
  warnings: string[];
  formula_cells_detected: number;
  sensitive_columns_detected: number;
  size_limit_bytes: number;
  row_limit: number;
  size_limit_reached: boolean;
  row_limit_reached: boolean;
  processing_mode: 'AGGREGATED';
  sampling_applied: boolean;
  rejection_code: string | null;
  created_at: string;
  expires_at: string;
}

export type AdvisorRunStatus =
  | 'QUEUED'
  | 'QUERYING'
  | 'GENERATING'
  | 'QA_REVIEW'
  | 'COMPLETED'
  | 'FAILED';

export type AdvisorRecoveryMode = 'SAFE_EVIDENCE_FALLBACK';

export interface AdvisorRunCreateRequest {
  quote_id?: string | null;
  upload_id?: string | null;
  analysis_scope: AdvisorAnalysisScope;
  forecast_draw: number;
  history_start_draw: number | null;
  history_end_draw: number;
  tone: AdvisorTone;
  luma_pro: boolean;
  deep_evidence?: boolean;
  signal_layers: string[];
  quality_controls: {
    qa_audit: boolean;
    toxic_pair_exclusion: boolean;
    recent_shadow_sync: boolean;
  };
  custom_prompt: string | null;
}

export interface AdvisorQuoteResponse {
  quote_id: string;
  expires_at: string;
  pricing_version: 'advisor-pricing-v4';
  upload_id: string | null;
  analysis_scope: AdvisorAnalysisScope;
  forecast_draw: number;
  history_start_draw: number | null;
  history_end_draw: number;
  history_draw_count: number;
  history_mode: 'snapshot' | 'range';
  luma_pro: boolean;
  deep_evidence: boolean;
  estimated_credits: CreditString;
  current_balance: CreditString;
  reserved_balance: CreditString;
  available_balance: CreditString;
  projected_balance: CreditString;
  missing_credits: CreditString;
  can_run: boolean;
  base_analysis_credits: CreditString;
  csv_upload_credits: CreditString;
  additional_modules_credits: CreditString;
  total_credits: CreditString;
  breakdown: Array<{
    code: string;
    label: string;
    credits: CreditString;
  }>;
}

export type AdvisorReaderNumberGroupId =
  | 'PRESSURE_OUTSIDE_LEADING_CONFLICT'
  | 'EMERGING_CHANGE'
  | 'NEUTRAL_BASELINE_USER_SELECTED'
  | 'CONFLICTED_PRESSURE';

export interface AdvisorReaderForecastBoundary {
  analysis_scope: AdvisorAnalysisScope;
  forecast_draw: number;
  data_cutoff_draw: number;
  history_start_draw: number | null;
  history_end_draw: number;
  history_draw_count: number;
  forecast_outcome_used: false;
}

export interface AdvisorReaderModelState {
  primary_family: string | null;
  secondary_family: string | null;
  confidence: number | null;
  uncertainty: number | null;
}

export interface AdvisorReaderNumberGroup {
  group_id: AdvisorReaderNumberGroupId;
  title: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  numbers: number[];
  explanation: string;
}

export interface AdvisorReaderPressureSignal {
  rank: number;
  number: number;
  conflict_status:
    | 'LEADING_TOXIC_RISK_OVERLAP'
    | 'OUTSIDE_LEADING_TOXIC_RISK_OVERLAP';
  risk_rank_status?:
    | 'HIGHER_CONTINUOUS_RISK_SCORE_WATCHLIST'
    | 'OUTSIDE_DISPLAYED_RISK_SCORE_WATCHLIST'
    | null;
  d9_release_score: number | null;
  d9_physics_score?: number | null;
  d9_overfit_risk: number | null;
  d9_toxicity_score: number | null;
  toxic_high_negative_flag?: boolean | null;
  labels?: string[];
}

export interface AdvisorReaderRiskSemantics {
  classification: 'CONTINUOUS_MODEL_RISK_RANKING';
  binary_toxicity_claim_allowed: false;
  safe_number_claim_allowed: false;
  displayed_watchlist_size: number;
  description: string;
}

export interface AdvisorReaderGhostCluster {
  contract_version: 'luma.advisor.ghost-cluster-reader.v1';
  numbers: number[];
  explanation: string;
}

export interface AdvisorReaderHistoricalMovementItem {
  number: number;
  late_minus_early_rate: number;
}

export type AdvisorReaderHistoricalMovement =
  | {
      status: 'AVAILABLE';
      requested_start_draw: number;
      requested_end_draw: number;
      draw_count: number;
      rising_main_numbers: AdvisorReaderHistoricalMovementItem[];
      falling_main_numbers: AdvisorReaderHistoricalMovementItem[];
    }
  | {
      status: 'UNAVAILABLE';
      reason: string;
    };

export interface AdvisorReaderCoverageModule {
  module: string;
  status: string;
}

export type AdvisorReaderSignalLayer =
  | 'VOLATILITY_FOCUS'
  | 'TRIADS_ENGINE'
  | 'MEAN_REVERSION'
  | 'DECAY_IDENTIFICATION'
  | 'GHOST_VECTOR'
  | 'MOTION_FIELD'
  | 'STRUCTURAL_TENSION'
  | 'INTERACTIONS';

export interface AdvisorReaderDataCoverage {
  status: 'AVAILABLE' | 'UNAVAILABLE';
  modules: AdvisorReaderCoverageModule[];
  selected_signal_layers: AdvisorReaderSignalLayer[];
  unavailable_selected_signal_layers: AdvisorReaderSignalLayer[];
  customer_csv: {
    selected: boolean;
    status: string;
    raw_rows_shared_with_model: false;
  };
}

export interface AdvisorReaderExposureAllocation {
  group_id: AdvisorReaderNumberGroupId;
  orientation_percent: number | null;
  maximum_percent: number | null;
}

export interface AdvisorReaderSignalExposureGuide {
  contract_version: 'luma.advisor.signal-exposure-guide.v1';
  classification: 'NON_PROBABILISTIC_PORTFOLIO_HEURISTIC';
  derived_from_model_probabilities: false;
  automatic_ticket_generation: false;
  scope: string;
  allocations: AdvisorReaderExposureAllocation[];
}

export interface AdvisorReaderEvidenceShareEntry {
  rank: number;
  number: number;
  d9_release_score: number;
  relative_evidence_share_percent: number;
}

export interface AdvisorReaderRelativeEvidenceBalance {
  contract_version: 'luma.advisor.relative-evidence-balance.v1';
  basis: 'NORMALIZED_D9_RELEASE_SCORE';
  derived_from_winning_probabilities: false;
  automatic_ticket_generation: false;
  user_selection_only: true;
  explanation: string;
  entries: AdvisorReaderEvidenceShareEntry[];
}

export interface AdvisorReaderFrequencyRank {
  rank: number;
  number: number;
  count: number;
}

export interface AdvisorReaderDistributionEntry {
  value: string;
  count: number;
}

export interface AdvisorReaderDistinctCoverage {
  main_numbers_observed: number | null;
  main_number_domain_size: 50 | null;
  star_numbers_observed: number | null;
  star_number_domain_size: 12 | null;
}

export interface AdvisorReaderMetricRange {
  minimum: number | null;
  mean: number | null;
  maximum: number | null;
}

export interface AdvisorReaderNumericSummary extends AdvisorReaderMetricRange {
  metric: string;
  label: string;
}

export interface AdvisorReaderCustomerCsvAnalysis {
  contract_version: 'luma.advisor.customer-csv-analysis.v1';
  status: 'AVAILABLE' | 'PARTIAL';
  source: 'LOTTERY_TICKET_SUMMARY' | 'LUMA_FINAL120_PROFILE';
  analysis_scope: 'STRUCTURAL_COMPOSITION_ONLY';
  accepted_row_count: number | null;
  valid_ticket_count: number | null;
  invalid_ticket_count: number | null;
  unique_ticket_count: number | null;
  duplicate_ticket_count: number | null;
  top20_member_count: number | null;
  realized_performance_included: boolean;
  performance_claims_allowed: false;
  interpretation: string;
  ranked_main_number_frequencies: AdvisorReaderFrequencyRank[];
  ranked_star_number_frequencies: AdvisorReaderFrequencyRank[];
  distinct_coverage?: AdvisorReaderDistinctCoverage | null;
  selection_arm_distribution?: AdvisorReaderDistributionEntry[];
  score_band_distribution?: AdvisorReaderDistributionEntry[];
  mode_distribution?: AdvisorReaderDistributionEntry[];
  odd_main_count_distribution?: AdvisorReaderDistributionEntry[];
  consecutive_pair_count_distribution?: AdvisorReaderDistributionEntry[];
  main_sum_summary?: AdvisorReaderMetricRange | null;
  numeric_summaries?: AdvisorReaderNumericSummary[];
}

export interface AdvisorReaderSummary {
  contract_version: 'luma.advisor.reader-summary.v1';
  forecast_boundary: AdvisorReaderForecastBoundary;
  model_state: AdvisorReaderModelState;
  number_groups: AdvisorReaderNumberGroup[];
  ranked_pressure_signals: AdvisorReaderPressureSignal[];
  risk_semantics?: AdvisorReaderRiskSemantics | null;
  historical_movement: AdvisorReaderHistoricalMovement;
  data_coverage: AdvisorReaderDataCoverage;
  signal_exposure_guide?: AdvisorReaderSignalExposureGuide | null;
  relative_evidence_balance?: AdvisorReaderRelativeEvidenceBalance | null;
  customer_csv_analysis: AdvisorReaderCustomerCsvAnalysis | null;
  ghost_cluster?: AdvisorReaderGhostCluster | null;
}

export interface AdvisorRunResponse {
  id: string;
  quote_id: string;
  upload_id: string | null;
  contract_version: 'luma.advisor.v8.1';
  pricing_version:
    | 'advisor-pricing-v1'
    | 'advisor-pricing-v2'
    | 'advisor-pricing-v3'
    | 'advisor-pricing-v4';
  analysis_scope: AdvisorAnalysisScope;
  forecast_draw: number;
  history_start_draw: number | null;
  history_end_draw: number;
  history_draw_count: number;
  history_mode: 'snapshot' | 'range';
  tone: AdvisorTone;
  luma_pro: boolean;
  deep_evidence: boolean;
  signal_layers: string[];
  quality_controls: {
    qa_audit: boolean;
    toxic_pair_exclusion: boolean;
    recent_shadow_sync: boolean;
  };
  quoted_credits: CreditString;
  pricing_breakdown: Array<Record<string, unknown>>;
  status: AdvisorRunStatus;
  progress_percent: number;
  status_code: string | null;
  report_markdown: string | null;
  recovery_mode?: AdvisorRecoveryMode | null;
  reader_summary: AdvisorReaderSummary | null;
  qa_result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  report_artifact_uri: string | null;
  pdf_status: 'disabled' | 'pending' | 'ready';
  pdf_download_url: string | null;
  semantic_memory_status: 'pending' | 'stored' | null;
  idempotent: boolean;
}

export interface AdvisorReportListItem {
  id: string;
  analysis_scope: AdvisorAnalysisScope;
  forecast_draw: number;
  history_end_draw: number;
  tone: AdvisorTone;
  luma_pro: boolean;
  deep_evidence: boolean;
  signal_layers: string[];
  quoted_credits: CreditString;
  pdf_status: 'disabled' | 'pending' | 'ready';
  pdf_download_url: string | null;
  created_at: string;
  completed_at: string;
}

export interface AdvisorReportListResponse {
  items: AdvisorReportListItem[];
  next_before: string | null;
  next_before_id: string | null;
}

export interface AdvisorTipScenarioSelection {
  source_report_ids: string[];
  draw_id: number;
  scenario_count: number;
}

export interface AdvisorTipScenarioGenerateRequest
  extends AdvisorTipScenarioSelection {
  quote_id: string;
}

export interface AdvisorTipScenarioQuoteResponse
  extends AdvisorTipScenarioSelection {
  quote_id: string;
  pricing_version: 'advisor-tip-scenarios-v2';
  unit_price_credits: CreditString;
  total_credits: CreditString;
  current_balance: CreditString;
  projected_balance: CreditString;
  missing_credits: CreditString;
  can_generate: boolean;
  evidence_sha256: string;
  sampling_sha256: string;
  expires_at: string;
  limits: {
    max_source_reports: 5;
    min_scenarios: 20;
    max_scenarios: 120;
  };
}

export interface AdvisorTipScenarioQuoteExpectation {
  quote_id: string;
  pricing_version: 'advisor-tip-scenarios-v1' | 'advisor-tip-scenarios-v2';
  unit_price_credits: CreditString;
  total_credits: CreditString;
  evidence_sha256: string;
  sampling_sha256: string;
}

export interface AdvisorTipGeneratedScenario {
  id: string;
  ticket_id: string | null;
  position: number;
  draw_id: number;
  main_numbers: [number, number, number, number, number];
  star_numbers: [number, number];
  numbers_key: string;
}

export interface AdvisorTipCsvRow {
  scenario_id: string;
  draw_id: number;
  main_1: number;
  main_2: number;
  main_3: number;
  main_4: number;
  main_5: number;
  star_1: number;
  star_2: number;
}

interface AdvisorTipScenarioGenerateResponseBase
  extends AdvisorTipScenarioSelection {
  status: 'generated' | 'pending_delivery';
  generation_id: string;
  quote_id: string;
  idempotent: boolean;
  pricing_version: 'advisor-tip-scenarios-v1' | 'advisor-tip-scenarios-v2';
  unit_price_credits: CreditString;
  credits_charged: CreditString;
  balance_after: CreditString;
  automatic_betting: false;
  saved_to_tickets: boolean;
  ticket_ids: string[];
  scenarios: AdvisorTipGeneratedScenario[];
  csv: {
    filename: string;
    content_type: 'text/csv; charset=utf-8';
    columns: [
      'scenario_id',
      'draw_id',
      'main_1',
      'main_2',
      'main_3',
      'main_4',
      'main_5',
      'star_1',
      'star_2',
    ];
    rows: AdvisorTipCsvRow[];
    content: string;
  };
  provenance: {
    contract_version: 'luma.advisor-tip-provenance.v1' | 'luma.advisor-tip-provenance.v2';
    algorithm_version: 'advisor-evidence-sampler-v1' | 'advisor-evidence-sampler-v2';
    evidence_projection: 'VALIDATED_READER_SUMMARY';
    main_selection_basis: 'VALIDATED_REPORT_EVIDENCE_WEIGHTS';
    star_selection_basis: 'EVIDENCE_SEEDED_NEUTRAL_DOMAIN_WITH_REPORT_WEIGHTS';
    winning_probability_claimed: false;
    evidence_sha256: string;
    sampling_sha256: string;
    source_reports: Array<{
      report_id: string;
      artifact_id: string;
      artifact_sha256: string;
    }>;
    raw_report_text_used: false;
    raw_user_prompt_used: false;
    assistant_mode?: 'gpt-5.6-sol' | 'deterministic_fallback';
    assistant_input_sha256?: string;
    assistant_output_sha256?: string | null;
    external_provider_called: boolean;
  };
}

export interface AdvisorTipScenarioDeliveredResponse
  extends AdvisorTipScenarioGenerateResponseBase {
  status: 'generated';
  saved_to_tickets: true;
}

export interface AdvisorTipScenarioPendingDeliveryResponse
  extends AdvisorTipScenarioGenerateResponseBase {
  status: 'pending_delivery';
  pricing_version: 'advisor-tip-scenarios-v2';
  saved_to_tickets: false;
  ticket_ids: [];
}

export interface AdvisorTipScenarioLegacyResponse
  extends AdvisorTipScenarioGenerateResponseBase {
  status: 'generated';
  pricing_version: 'advisor-tip-scenarios-v1';
  saved_to_tickets: false;
  ticket_ids: [];
}

export type AdvisorTipScenarioGenerateResponse =
  | AdvisorTipScenarioDeliveredResponse
  | AdvisorTipScenarioPendingDeliveryResponse
  | AdvisorTipScenarioLegacyResponse;

export interface CreditBalanceResponse {
  balance: CreditString;
}

export interface CreditHistoryEntry {
  id: string;
  delta: CreditString;
  direction: 'CREDIT' | 'DEBIT';
  reason: string;
  label: string;
  ref: string | null;
  note: string | null;
  related_resource_type: string | null;
  related_resource_id: string | null;
  balance_after: CreditString;
  created_at: string;
}

export interface CreditHistoryResponse {
  balance: CreditString;
  total_credited: CreditString;
  total_spent: CreditString;
  entries: CreditHistoryEntry[];
  has_more: boolean;
  next_before_created_at: string | null;
  next_before_id: string | null;
}

export interface PurchasedTip {
  id: string;
  purchase_id: string;
  draw_id: number;
  universe_tip_index: number;
  numbers_snapshot: WinningNumbers;
  purchased_at: string;
}

interface UserTipsPageResponse {
  draw_id: number;
  items: PurchasedTip[];
  has_more: boolean;
  next_after_id: string | null;
}

const DRAW_PAGE_SIZE = 200;
const REPORT_PAGE_SIZE = 100;
const CREDIT_PAGE_SIZE = 200;
const TIP_PAGE_SIZE = 100;
const MAX_PAGES = 10_000;

function requireFiniteCredit(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Backend returned an invalid ${field}.`);
  }
  return parsed;
}

function requireNextCursor(
  hasMore: boolean,
  cursor: string | number | null,
  endpoint: string,
): asserts cursor is string | number {
  if (hasMore && cursor === null) {
    throw new Error(`${endpoint} returned has_more without a cursor.`);
  }
  if (!hasMore && cursor !== null) {
    throw new Error(`${endpoint} returned a cursor on the final page.`);
  }
}

export async function fetchAllEvaluationDraws(
  signal?: AbortSignal,
): Promise<EvaluationDrawListItem[]> {
  const items: EvaluationDrawListItem[] = [];
  const drawIds = new Set<number>();
  const cursors = new Set<number>();
  let beforeDrawId: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await apiClient.get<EvaluationDrawListResponse>(
      '/api/v1/evaluations/draws',
      {
        signal,
        params: {
          limit: DRAW_PAGE_SIZE,
          ...(beforeDrawId === null ? {} : { before_draw_id: beforeDrawId }),
        },
      },
    );
    const data = response.data;
    if (!Array.isArray(data.items)) {
      throw new Error('Draw catalog returned an invalid items field.');
    }

    for (const item of data.items) {
      if (drawIds.has(item.draw_id)) {
        throw new Error(`Draw catalog repeated draw ${item.draw_id}.`);
      }
      drawIds.add(item.draw_id);
      items.push(item);
    }

    requireNextCursor(
      data.has_more,
      data.next_before_draw_id,
      '/api/v1/evaluations/draws',
    );
    if (!data.has_more) return items;

    const nextCursor = data.next_before_draw_id;
    if (
      cursors.has(nextCursor)
      || (beforeDrawId !== null && nextCursor >= beforeDrawId)
    ) {
      throw new Error('Draw catalog returned a non-progressing cursor.');
    }
    cursors.add(nextCursor);
    beforeDrawId = nextCursor;
  }

  throw new Error('Draw catalog exceeded the pagination safety limit.');
}

export async function fetchEvaluationSummary(
  drawId: number,
  signal?: AbortSignal,
): Promise<EvaluationSummaryResponse> {
  const response = await apiClient.get<EvaluationSummaryResponse>(
    `/api/v1/evaluations/draws/${drawId}/summary`,
    { signal },
  );
  return response.data;
}

export async function fetchEvaluationModule(
  drawId: number,
  moduleName: string,
  signal?: AbortSignal,
): Promise<EvaluationModuleResponse> {
  const response = await apiClient.get<EvaluationModuleResponse>(
    `/api/v1/evaluations/draws/${drawId}/modules/${encodeURIComponent(moduleName)}`,
    { signal },
  );
  return response.data;
}

export async function saveManualTicket(
  request: {
    request_id: string;
    draw_id: number;
    main_numbers: [number, number, number, number, number];
    core_numbers: [number, number];
  },
  signal?: AbortSignal,
): Promise<SaveTicketResponse> {
  const response = await apiClient.post<SaveTicketResponse>(
    '/api/v1/tickets/save',
    request,
    { signal },
  );
  return response.data;
}

export async function updateManualTicket(
  ticketId: string,
  request: {
    main_numbers: [number, number, number, number, number];
    core_numbers: [number, number];
  },
  signal?: AbortSignal,
): Promise<UpdateTicketResponse> {
  const response = await apiClient.patch<UpdateTicketResponse>(
    `/api/v1/tickets/${encodeURIComponent(ticketId)}`,
    request,
    { signal },
  );
  return response.data;
}

export async function deleteManualTicket(
  ticketId: string,
  signal?: AbortSignal,
): Promise<DeleteTicketResponse> {
  const response = await apiClient.delete<DeleteTicketResponse>(
    `/api/v1/tickets/${encodeURIComponent(ticketId)}`,
    { signal },
  );
  return response.data;
}

export async function fetchTicketEvaluation(
  drawId: number,
  signal?: AbortSignal,
): Promise<TicketEvaluationResponse> {
  const response = await apiClient.get<TicketEvaluationResponse>(
    '/api/v1/tickets/evaluate',
    { signal, params: { draw_id: drawId } },
  );
  return response.data;
}

export async function fetchTicketScoreboard(
  drawId: number,
  signal?: AbortSignal,
  options: TicketScoreboardRequestOptions = {},
): Promise<TicketScoreboardResponse> {
  const response = await apiClient.get<TicketScoreboardResponse>(
    '/api/v1/tickets/scoreboard',
    {
      signal,
      params: options.includeAllPlayers
        ? { draw_id: drawId, include_all_players: true }
        : { draw_id: drawId, limit: 10 },
    },
  );
  return response.data;
}

export async function fetchUniverseAnalytics(
  drawId: number,
  signal?: AbortSignal,
): Promise<UniverseAnalyticsResponse> {
  const response = await apiClient.get<UniverseAnalyticsResponse>(
    '/api/v1/analytics/universe',
    { signal, params: { draw_id: drawId } },
  );
  return response.data;
}

export async function fetchLatestSprint(
  signal?: AbortSignal,
): Promise<SprintInfoResponse> {
  const response = await apiClient.get<SprintInfoResponse>(
    '/api/v1/sprints/latest',
    { signal },
  );
  return response.data;
}

export async function fetchSprintInfo(
  forecastDraw: number,
  signal?: AbortSignal,
): Promise<SprintInfoResponse> {
  const response = await apiClient.get<SprintInfoResponse>(
    `/api/v1/sprints/${forecastDraw}/info`,
    { signal },
  );
  return response.data;
}

export async function fetchEngineStatus(
  signal?: AbortSignal,
): Promise<EngineStatusResponse> {
  const response = await apiClient.get<EngineStatusResponse>(
    '/api/v1/engine/status',
    { signal },
  );
  return response.data;
}

export async function fetchRecentIntelligence(
  signal?: AbortSignal,
): Promise<RecentIntelligenceResponse> {
  const response = await apiClient.get<RecentIntelligenceResponse>(
    '/api/v1/intelligence',
    { signal, params: { limit: 20 } },
  );
  return response.data;
}

export async function fetchAdvisorConfig(
  signal?: AbortSignal,
): Promise<AdvisorConfigResponse> {
  const response = await apiClient.get<AdvisorConfigResponse>(
    '/api/v1/advisor/config',
    { signal },
  );
  return response.data;
}

export async function fetchAdvisorAvailability(
  query: {
    analysis_scope: AdvisorAnalysisScope;
    forecast_draw: number | null;
    history_end_draw: number;
  },
  signal?: AbortSignal,
): Promise<AdvisorAvailabilityResponse> {
  const response = await apiClient.get<AdvisorAvailabilityResponse>(
    '/api/v1/advisor/availability',
    {
      signal,
      params: query,
    },
  );
  return response.data;
}

export async function uploadAdvisorCsv(
  file: File,
  signal?: AbortSignal,
): Promise<AdvisorUploadPreviewResponse> {
  const form = new FormData();
  form.append('csv_file', file, file.name);
  const response = await apiClient.post<AdvisorUploadPreviewResponse>(
    '/api/v1/uploads/csv',
    form,
    { signal },
  );
  return response.data;
}

export async function fetchAdvisorCsvPreview(
  uploadId: string,
  signal?: AbortSignal,
): Promise<AdvisorUploadPreviewResponse> {
  const response = await apiClient.get<AdvisorUploadPreviewResponse>(
    `/api/v1/uploads/${encodeURIComponent(uploadId)}/preview`,
    { signal },
  );
  return response.data;
}

export async function fetchAllAdvisorReports(
  signal?: AbortSignal,
): Promise<AdvisorReportListItem[]> {
  const items: AdvisorReportListItem[] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let before: string | null = null;
  let beforeId: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await apiClient.get<AdvisorReportListResponse>(
      '/api/v1/advisor/reports',
      {
        signal,
        params: before === null
          ? { limit: REPORT_PAGE_SIZE }
          : { limit: REPORT_PAGE_SIZE, before, before_id: beforeId },
      },
    );
    const data = response.data;
    if (!Array.isArray(data.items)) {
      throw new Error('Advisor reports returned an invalid items field.');
    }
    for (const item of data.items) {
      if (ids.has(item.id)) {
        throw new Error(`Advisor reports repeated report ${item.id}.`);
      }
      ids.add(item.id);
      items.push(item);
    }

    const hasMore = data.next_before !== null || data.next_before_id !== null;
    if ((data.next_before === null) !== (data.next_before_id === null)) {
      throw new Error('Advisor reports returned an incomplete cursor pair.');
    }
    if (!hasMore) return items;

    const cursorKey = `${data.next_before}|${data.next_before_id}`;
    if (cursors.has(cursorKey)) {
      throw new Error('Advisor reports returned a non-progressing cursor.');
    }
    cursors.add(cursorKey);
    before = data.next_before;
    beforeId = data.next_before_id;
  }

  throw new Error('Advisor reports exceeded the pagination safety limit.');
}

export async function fetchAdvisorQuote(
  request: AdvisorRunCreateRequest,
  signal?: AbortSignal,
): Promise<AdvisorQuoteResponse> {
  const response = await apiClient.post<AdvisorQuoteResponse>(
    '/api/v1/advisor/quote',
    request,
    { signal },
  );
  return response.data;
}

export async function fetchAdvisorTipScenarioQuote(
  request: AdvisorTipScenarioSelection,
  signal?: AbortSignal,
): Promise<AdvisorTipScenarioQuoteResponse> {
  const canonicalRequest = parseAdvisorTipScenarioSelection(request);
  const response = await apiClient.post<unknown>(
    '/api/v1/advisor/tip-scenarios/quote',
    canonicalRequest,
    { signal },
  );
  return parseAdvisorTipScenarioQuoteResponse(response.data, canonicalRequest);
}

export async function generateAdvisorTipScenarios(
  request: AdvisorTipScenarioGenerateRequest,
  idempotencyKey: string,
  expectedQuote: AdvisorTipScenarioQuoteExpectation,
  signal?: AbortSignal,
): Promise<AdvisorTipScenarioGenerateResponse> {
  const canonicalRequest = parseAdvisorTipScenarioGenerateRequest(request);
  const canonicalIdempotencyKey = parseAdvisorTipScenarioIdempotencyKey(
    idempotencyKey,
  );
  const canonicalExpectedQuote = parseAdvisorTipScenarioQuoteExpectation(
    {
      quote_id: expectedQuote.quote_id,
      pricing_version: expectedQuote.pricing_version,
      unit_price_credits: expectedQuote.unit_price_credits,
      total_credits: expectedQuote.total_credits,
      evidence_sha256: expectedQuote.evidence_sha256,
      sampling_sha256: expectedQuote.sampling_sha256,
    },
    canonicalRequest,
  );
  const response = await apiClient.post<unknown>(
    '/api/v1/advisor/tip-scenarios/generate',
    canonicalRequest,
    {
      signal,
      headers: { 'Idempotency-Key': canonicalIdempotencyKey },
    },
  );
  return parseAdvisorTipScenarioGenerateResponse(
    response.data,
    canonicalRequest,
    canonicalExpectedQuote,
  );
}

export async function reconcileAdvisorTipScenarioTickets(
  generationId: string,
  expectedRequest: AdvisorTipScenarioGenerateRequest,
  expectedQuote: AdvisorTipScenarioQuoteExpectation,
  signal?: AbortSignal,
): Promise<AdvisorTipScenarioGenerateResponse> {
  const canonicalGenerationId = parseAdvisorTipScenarioIdempotencyKey(
    generationId,
  );
  const canonicalRequest = parseAdvisorTipScenarioGenerateRequest(
    expectedRequest,
  );
  const canonicalExpectedQuote = parseAdvisorTipScenarioQuoteExpectation(
    {
      quote_id: expectedQuote.quote_id,
      pricing_version: expectedQuote.pricing_version,
      unit_price_credits: expectedQuote.unit_price_credits,
      total_credits: expectedQuote.total_credits,
      evidence_sha256: expectedQuote.evidence_sha256,
      sampling_sha256: expectedQuote.sampling_sha256,
    },
    canonicalRequest,
  );
  const response = await apiClient.post<unknown>(
    `/api/v1/advisor/tip-scenarios/generations/${encodeURIComponent(canonicalGenerationId)}/reconcile-tickets`,
    undefined,
    { signal },
  );
  return parseAdvisorTipScenarioGenerateResponse(
    response.data,
    canonicalRequest,
    canonicalExpectedQuote,
  );
}

export async function createAdvisorRun(
  request: AdvisorRunCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<AdvisorRunResponse> {
  const response = await apiClient.post<AdvisorRunResponse>(
    '/api/v1/advisor/runs',
    request,
    {
      signal,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  return response.data;
}

export async function fetchAdvisorRun(
  runId: string,
  signal?: AbortSignal,
): Promise<AdvisorRunResponse> {
  const response = await apiClient.get<AdvisorRunResponse>(
    `/api/v1/advisor/runs/${encodeURIComponent(runId)}`,
    { signal },
  );
  return response.data;
}

export async function fetchActiveAdvisorRun(
  signal?: AbortSignal,
): Promise<AdvisorRunResponse | null> {
  const response = await apiClient.get<AdvisorRunResponse | null>(
    '/api/v1/advisor/runs/active',
    { signal, validateStatus: (status) => status === 200 || status === 204 },
  );
  return response.status === 204 ? null : response.data;
}

export async function fetchAdvisorReport(
  reportId: string,
  signal?: AbortSignal,
): Promise<AdvisorRunResponse> {
  const response = await apiClient.get<AdvisorRunResponse>(
    `/api/v1/advisor/reports/${encodeURIComponent(reportId)}`,
    { signal },
  );
  return response.data;
}

export async function downloadAdvisorReportPdf(
  reportId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await apiClient.get<Blob>(
    `/api/v1/advisor/reports/${encodeURIComponent(reportId)}/pdf`,
    { signal, responseType: 'blob' },
  );
  const blob = response.data;
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('The backend returned an invalid PDF.');
  }
  return blob;
}

export function canRequestAdvisorReportPdf(
  report: Pick<AdvisorRunResponse, 'status' | 'pdf_status'>,
): boolean {
  return (
    report.status === 'COMPLETED'
    && report.pdf_status !== 'disabled'
  );
}

export async function fetchCreditBalance(
  signal?: AbortSignal,
): Promise<number> {
  const response = await apiClient.get<CreditBalanceResponse>(
    '/credits/balance',
    { signal },
  );
  return requireFiniteCredit(response.data.balance, 'credit balance');
}

export async function fetchAllCreditLedger(
  signal?: AbortSignal,
): Promise<CreditHistoryResponse> {
  const entries: CreditHistoryEntry[] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let beforeCreatedAt: string | null = null;
  let beforeId: string | null = null;
  let latestTotals: Omit<
    CreditHistoryResponse,
    'entries' | 'has_more' | 'next_before_created_at' | 'next_before_id'
  > | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await apiClient.get<CreditHistoryResponse>(
      '/credits/ledger',
      {
        signal,
        params: beforeCreatedAt === null
          ? { limit: CREDIT_PAGE_SIZE }
          : {
              limit: CREDIT_PAGE_SIZE,
              before_created_at: beforeCreatedAt,
              before_id: beforeId,
            },
      },
    );
    const data = response.data;
    if (!Array.isArray(data.entries)) {
      throw new Error('Credit ledger returned an invalid entries field.');
    }
    if (latestTotals === null) {
      latestTotals = {
        balance: data.balance,
        total_credited: data.total_credited,
        total_spent: data.total_spent,
      };
    }
    for (const entry of data.entries) {
      if (ids.has(entry.id)) {
        throw new Error(`Credit ledger repeated entry ${entry.id}.`);
      }
      ids.add(entry.id);
      entries.push(entry);
    }

    if (
      (data.next_before_created_at === null)
      !== (data.next_before_id === null)
    ) {
      throw new Error('Credit ledger returned an incomplete cursor pair.');
    }
    requireNextCursor(
      data.has_more,
      data.next_before_created_at,
      '/credits/ledger',
    );
    if (!data.has_more) {
      const totals = latestTotals ?? {
        balance: data.balance,
        total_credited: data.total_credited,
        total_spent: data.total_spent,
      };
      return {
        ...totals,
        entries,
        has_more: false,
        next_before_created_at: null,
        next_before_id: null,
      };
    }

    const cursorKey = `${data.next_before_created_at}|${data.next_before_id}`;
    if (cursors.has(cursorKey)) {
      throw new Error('Credit ledger returned a non-progressing cursor.');
    }
    cursors.add(cursorKey);
    beforeCreatedAt = data.next_before_created_at;
    beforeId = data.next_before_id;
  }

  throw new Error('Credit ledger exceeded the pagination safety limit.');
}

export async function fetchAllUserTips(
  drawId: number,
  signal?: AbortSignal,
): Promise<PurchasedTip[]> {
  const items: PurchasedTip[] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let afterId: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await apiClient.get<UserTipsPageResponse>(
      '/api/v1/users/me/tips',
      {
        signal,
        params: {
          draw_id: drawId,
          limit: TIP_PAGE_SIZE,
          ...(afterId === null ? {} : { after_id: afterId }),
        },
      },
    );
    const data = response.data;
    for (const item of data.items) {
      if (ids.has(item.id)) {
        throw new Error(`User tips repeated tip ${item.id}.`);
      }
      ids.add(item.id);
      items.push(item);
    }
    requireNextCursor(
      data.has_more,
      data.next_after_id,
      '/api/v1/users/me/tips',
    );
    if (!data.has_more) return items;
    const nextCursor = data.next_after_id;
    if (cursors.has(nextCursor)) {
      throw new Error('User tips returned a non-progressing cursor.');
    }
    cursors.add(nextCursor);
    afterId = nextCursor;
  }

  throw new Error('User tips exceeded the pagination safety limit.');
}
