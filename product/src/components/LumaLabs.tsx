import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Send,
} from 'lucide-react';

import {
  LUMA_LABS_CATEGORIES,
  submitLumaLabsFeedback,
  validateLumaLabsSubmission,
} from '../api/lumaLabs';

type FieldName = 'category' | 'title' | 'details';

const EMPTY_DRAFT = {
  category: '',
  title: '',
  details: '',
};

export const LumaLabs = () => {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    category: false,
    title: false,
    details: false,
  });
  const [submissionState, setSubmissionState] = useState<
    'idle' | 'submitting' | 'submitted' | 'error'
  >('idle');
  const [referenceId, setReferenceId] = useState<string | null>(null);

  const errors = useMemo(
    () => validateLumaLabsSubmission(draft),
    [draft],
  );

  const updateField = (field: FieldName, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (submissionState !== 'idle') {
      setSubmissionState('idle');
      setReferenceId(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ category: true, title: true, details: true });
    if (Object.keys(errors).length > 0) {
      setSubmissionState('error');
      return;
    }

    setSubmissionState('submitting');
    setReferenceId(null);
    try {
      const response = await submitLumaLabsFeedback(draft);
      setReferenceId(response.id);
      setSubmissionState('submitted');
      setDraft(EMPTY_DRAFT);
      setTouched({ category: false, title: false, details: false });
    } catch {
      setSubmissionState('error');
    }
  };

  const isSubmitting = submissionState === 'submitting';

  return (
    <section
      className="mx-auto w-full max-w-3xl"
      aria-labelledby="luma-labs-title"
    >
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
          <Lightbulb className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h2
            id="luma-labs-title"
            className="text-3xl font-medium text-white font-display"
          >
            LUMA Labs
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Share a focused idea or report an issue with the LUMA team.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-2xl border border-white/10 bg-black/20 p-5 shadow-2xl shadow-black/20 sm:p-8"
      >
        <div className="space-y-6">
          <div>
            <label
              htmlFor="luma-labs-category"
              className="mb-2 block font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400"
            >
              Category
            </label>
            <select
              id="luma-labs-category"
              value={draft.category}
              required
              aria-required="true"
              onChange={(event) => updateField('category', event.target.value)}
              onBlur={() => setTouched((current) => ({
                ...current,
                category: true,
              }))}
              disabled={isSubmitting}
              aria-invalid={touched.category && Boolean(errors.category)}
              aria-describedby={
                touched.category && errors.category
                  ? 'luma-labs-category-error'
                  : undefined
              }
              className="w-full rounded-xl border border-white/10 bg-[#080c14] px-4 py-3 text-sm text-white outline-none transition-colors hover:border-white/20 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>Select a category</option>
              {LUMA_LABS_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            {touched.category && errors.category && (
              <p
                id="luma-labs-category-error"
                className="mt-2 text-xs text-red-300"
              >
                {errors.category}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <label
                htmlFor="luma-labs-title-input"
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400"
              >
                Title
              </label>
              <span className="font-mono text-[10px] text-slate-600">
                {draft.title.length}/160
              </span>
            </div>
            <input
              id="luma-labs-title-input"
              type="text"
              value={draft.title}
              required
              aria-required="true"
              maxLength={160}
              autoComplete="off"
              placeholder="Give your feedback a clear title"
              onChange={(event) => updateField('title', event.target.value)}
              onBlur={() => setTouched((current) => ({
                ...current,
                title: true,
              }))}
              disabled={isSubmitting}
              aria-invalid={touched.title && Boolean(errors.title)}
              aria-describedby={
                touched.title && errors.title
                  ? 'luma-labs-title-error'
                  : undefined
              }
              className="w-full rounded-xl border border-white/10 bg-[#080c14] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-600 hover:border-white/20 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {touched.title && errors.title && (
              <p
                id="luma-labs-title-error"
                className="mt-2 text-xs text-red-300"
              >
                {errors.title}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <label
                htmlFor="luma-labs-details"
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400"
              >
                Description
              </label>
              <span className="font-mono text-[10px] text-slate-600">
                {draft.details.length}/5,000
              </span>
            </div>
            <textarea
              id="luma-labs-details"
              value={draft.details}
              required
              aria-required="true"
              maxLength={5000}
              rows={8}
              placeholder="Describe the idea, issue, or improvement in detail"
              onChange={(event) => updateField('details', event.target.value)}
              onBlur={() => setTouched((current) => ({
                ...current,
                details: true,
              }))}
              disabled={isSubmitting}
              aria-invalid={touched.details && Boolean(errors.details)}
              aria-describedby={
                touched.details && errors.details
                  ? 'luma-labs-details-error'
                  : undefined
              }
              className="min-h-40 w-full resize-y rounded-xl border border-white/10 bg-[#080c14] px-4 py-3 text-sm leading-6 text-white outline-none transition-colors placeholder:text-slate-600 hover:border-white/20 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {touched.details && errors.details && (
              <p
                id="luma-labs-details-error"
                className="mt-2 text-xs text-red-300"
              >
                {errors.details}
              </p>
            )}
          </div>
        </div>

        <div className="mt-8">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-cyber-gradient flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080c14] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                Submit Feedback
              </>
            )}
          </button>
        </div>

        <div className="mt-5 min-h-6" aria-live="polite">
          {submissionState === 'submitted' && (
            <p className="flex items-start gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Feedback submitted.
                {referenceId ? ` Reference: ${referenceId}` : ''}
              </span>
            </p>
          )}
          {submissionState === 'error' && (
            <p className="flex items-start gap-2 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {Object.keys(errors).length > 0
                  ? 'Please review the highlighted fields.'
                  : 'Feedback could not be submitted. Please try again.'}
              </span>
            </p>
          )}
        </div>
      </form>
    </section>
  );
};
