/**
 * Test Case Review Operations
 *
 * Reviews are the pull-request workflow for test cases: an author proposes a new
 * case or a change to an existing one, reviewers approve or request changes, and
 * merging applies the proposal.
 *
 * Scope note: the public API covers only the authoring side — create, read,
 * update the proposal, assign reviewers, delete. Approving, requesting changes,
 * merging, and declining have no API endpoints (they exist in the UI and emit
 * webhooks), so no tool here can perform them. Every description says so; a tool
 * that implied otherwise would report work it cannot do.
 */

import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import {
  toolRegistry,
  CreateAnnotation,
  UpdateAnnotation,
  DeleteAnnotation,
  ReadAnnotation,
} from '../../utils/registry.js';
import { toResultAsync, createToolError, ToolExecutionError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';
import { normalizeCaseEnums } from '../../utils/case-enums.js';
import { CaseFieldsSchema, resolveSharedStepRefs } from './case-fields.js';
import { richResult, summaryBlock, dataBlock, markdownTable } from '../../utils/rich-response.js';
import {
  ReviewCreateOutput,
  ReviewUpdateOutput,
  ReviewListOutput,
  ReviewBulkCreateOutput,
} from '../../utils/output-schemas.js';

/** Wording shared by every review tool, so the API's limits are never implied away. */
const NO_WORKFLOW_ACTIONS =
  'The API has no endpoints for approving, requesting changes, merging, or declining — ' +
  'those actions are only available in the Qase UI, so this tool cannot perform them. ' +
  'Use qase_review_list or qase_get to read the current status.';

const REVIEW_MUST_BE_ENABLED = 'Requires "Test case review" to be enabled in the project settings.';

/**
 * Case fields a review may propose. The names match qase_case_upsert, so a
 * proposal is written the same way as an ordinary case — including enum labels
 * ("high") and shared step references.
 */
const ProposedCaseSchema = CaseFieldsSchema.partial();

/** Reviewer identifiers: author UUIDs, or emails resolved to them. */
const ReviewersSchema = z
  .array(z.string())
  .optional()
  .describe(
    'Reviewers, as author UUIDs (see qase_get { entity: "author" }) or email addresses, ' +
      'which are resolved to UUIDs. Note these are AUTHOR uuids, not user IDs. The review ' +
      'author cannot review their own review: since the review is created by whoever owns the ' +
      'API token, listing that person here fails with "cannot be a reviewer of their own ' +
      'review". Leave the list empty to assign reviewers later in the UI.',
  );

/**
 * ReviewCaseData has no `automation` field — it carries is_manual /
 * is_to_be_automated instead. (applyAutomationMapping, used for cases, emits the
 * camelCase isManual/isToBeAutomated that the case endpoint takes, so it cannot
 * be reused here: the value would be dropped.)
 */
function mapAutomation(proposed: Record<string, unknown>): Record<string, unknown> {
  const automation = proposed.automation;
  if (typeof automation !== 'number') {
    // Nothing to map; drop a non-numeric leftover so it cannot reach the API.
    const { automation: _drop, ...rest } = proposed;
    return automation === undefined ? proposed : rest;
  }

  const { automation: _drop, ...rest } = proposed;
  switch (automation) {
    case 2: // Automated
      return { ...rest, is_manual: false, is_to_be_automated: false };
    case 1: // To be automated
      return { ...rest, is_manual: true, is_to_be_automated: true };
    default: // Manual
      return { ...rest, is_manual: true, is_to_be_automated: false };
  }
}

/** Build the `proposed_case` payload from tool arguments. */
async function buildProposedCase(
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const normalized = mapAutomation(await normalizeCaseEnums(fields));

  if (normalized.steps !== undefined) {
    normalized.steps = resolveSharedStepRefs(normalized.steps);
  }

  return normalized;
}

/**
 * Turn emails into author UUIDs, leaving values that are already UUIDs alone.
 * Without this the caller has to look up authors first, and mixing up user IDs
 * with author UUIDs fails in a way that is hard to read.
 */
async function resolveReviewers(reviewers: string[] | undefined): Promise<string[] | undefined> {
  if (!reviewers || reviewers.length === 0) return reviewers;

  const emails = reviewers.filter((r) => r.includes('@'));
  if (emails.length === 0) return reviewers;

  const client = getApiClient();
  const resolved = new Map<string, string>();

  for (const email of emails) {
    const res = await toResultAsync(client.authors.getAuthors(email, undefined, 100, 0));
    const uuid = res.match(
      (r: any) => {
        const match = (r.data.result?.entities ?? []).find(
          (a: any) => a.email?.toLowerCase() === email.toLowerCase(),
        );
        return match?.uuid as string | undefined;
      },
      () => undefined,
    );

    if (!uuid) {
      throw new ToolExecutionError(
        `No author found for "${email}".`,
        'Check the address, or pass the author UUID directly — list them with ' +
          'qase_get { entity: "author", id: ... } or the /author endpoint via qase_api.',
      );
    }
    resolved.set(email, uuid);
  }

  return reviewers.map((r) => resolved.get(r) ?? r);
}

/**
 * Every review endpoint fails outright when the feature is off for the project,
 * and the API's wording does not point at the setting. Attach that hint to the
 * failures where it plausibly applies.
 *
 * `error` arrives already formatted by toResultAsync/formatApiError — a string
 * prefixed per status ("Invalid request: ...", "Access forbidden: ...") — so the
 * check is on that text, not on a response object.
 */
function reviewError(error: string, operation: string): never {
  const message = createToolError(error, operation).message;

  // The author of a review cannot review it, and the review is authored by
  // whoever owns the API token — so this is hit by simply passing your own
  // address. Say what to do instead of leaving the raw validation error.
  if (/cannot be a reviewer of their own review/i.test(error)) {
    throw new ToolExecutionError(
      message,
      'A review cannot be reviewed by its author, and the review is created by the owner of ' +
        'the API token — so that person cannot appear in `reviewers`. Pass somebody else, or ' +
        'omit `reviewers` and assign them in the UI.',
    );
  }

  // Match the feature-disabled case narrowly: a plain 400/403 with nothing more
  // specific to say. Testing for "review" anywhere in the text would attach this
  // hint to unrelated validation errors that merely mention reviews.
  const looksLikeFeatureOff =
    (error.startsWith('Invalid request:') || error.startsWith('Access forbidden:')) &&
    !/reviewer|title|proposed_case|not found/i.test(error);

  if (looksLikeFeatureOff || /review.{0,20}(disabled|not enabled|turned off)/i.test(error)) {
    throw new ToolExecutionError(
      message,
      `${REVIEW_MUST_BE_ENABLED} Check Project settings → Test case review if this persists.`,
    );
  }

  throw createToolError(error, operation);
}

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateSchema = z.object({
  code: ProjectCodeSchema,
  case_id: IdSchema.optional().describe(
    'Test case to propose changes to. With it, an "edit" review is created and only the ' +
      'fields being changed need to be sent. Without it, a "create" review is opened for a ' +
      'brand-new case draft and `title` is required.',
  ),
  reviewers: ReviewersSchema,
  ...ProposedCaseSchema.shape,
});

const UpdateSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.describe('Review ID'),
  reviewers: ReviewersSchema.describe(
    'Replaces the current reviewer list; an empty array removes everyone. Omit to leave it ' +
      'unchanged. Author UUIDs or emails. Changing ONLY reviewers keeps existing approvals.',
  ),
  ...ProposedCaseSchema.shape,
});

const ListSchema = z.object({
  code: ProjectCodeSchema,
  status: z.enum(['open', 'merged', 'declined']).optional(),
  type: z
    .enum(['create', 'edit'])
    .optional()
    .describe('"create" proposes a new case, "edit" proposes changes to an existing one'),
  case_id: IdSchema.optional().describe('Only reviews of this test case'),
  author_uuid: z.string().optional().describe('Only reviews opened by this author UUID'),
  reviewer_uuid: z.string().optional().describe('Only reviews this author UUID is a reviewer on'),
  search: z.string().optional().describe('Substring match on the review title'),
  limit: z.number().int().positive().max(100).optional().describe('Default 25, max 100'),
  offset: z.number().int().nonnegative().optional(),
});

const GetIdSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.describe('Review ID'),
});

const BulkCreateSchema = z.object({
  code: ProjectCodeSchema,
  reviews: z
    .array(
      z.object({
        case_id: IdSchema.optional().describe('Omit for a new-case draft ("create" review)'),
        reviewers: ReviewersSchema,
        ...ProposedCaseSchema.shape,
      }),
    )
    .min(1)
    .describe(
      'Reviews to open. Validated as a whole: if any item is invalid, NOTHING is created. ' +
        'Once valid, each item is processed individually and reported separately.',
    ),
});

// ============================================================================
// HANDLERS
// ============================================================================

async function create(args: z.infer<typeof CreateSchema>) {
  const client = getApiClient();
  const { code, case_id, reviewers, ...fields } = args;

  if (case_id === undefined && !fields.title) {
    throw new ToolExecutionError(
      'A "create" review needs a title.',
      'Pass `title` (plus any other fields the project requires) for a new-case draft, or ' +
        'pass `case_id` to propose changes to an existing case instead.',
    );
  }

  const proposed_case = await buildProposedCase(fields);
  const payload = {
    proposed_case,
    ...(case_id !== undefined && { case_id }),
    ...(reviewers && { reviewers: await resolveReviewers(reviewers) }),
  };

  const result = await toResultAsync(client.reviews.createReview(code, payload as any));

  return result.match(
    (r) => {
      const id = (r.data.result as any)?.id;
      return {
        review_id: id,
        type: case_id === undefined ? 'create' : 'edit',
        case_id: case_id ?? null,
        status: 'open',
      };
    },
    (e) => reviewError(e, 'review creation'),
  );
}

async function update(args: z.infer<typeof UpdateSchema>) {
  const client = getApiClient();
  const { code, id, reviewers, ...fields } = args;

  const hasProposalChange = Object.keys(fields).length > 0;
  if (!hasProposalChange && !reviewers) {
    throw new ToolExecutionError(
      'Nothing to update.',
      'Pass case fields to change the proposal, or `reviewers` to reassign it.',
    );
  }

  const payload: Record<string, unknown> = {};
  if (hasProposalChange) payload.proposed_case = await buildProposedCase(fields);
  if (reviewers) payload.reviewers = await resolveReviewers(reviewers);

  const result = await toResultAsync(client.reviews.updateReview(code, id, payload as any));

  return result.match(
    () => ({
      review_id: id,
      updated: Object.keys(payload),
      // Surfaced because it is easy to reset approvals without meaning to.
      approvals_reset: hasProposalChange,
    }),
    (e) => reviewError(e, 'review update'),
  );
}

async function list(args: z.infer<typeof ListSchema>) {
  const client = getApiClient();
  const { code, status, type, case_id, author_uuid, reviewer_uuid, search, limit, offset } = args;

  const result = await toResultAsync(
    client.reviews.getReviews(
      code,
      status,
      type,
      case_id,
      author_uuid,
      reviewer_uuid,
      search,
      limit ?? 25,
      offset ?? 0,
    ),
  );

  return result.match(
    (r) => {
      const res = r.data.result as any;
      const entities: any[] = res?.entities ?? [];
      const total = res?.total ?? entities.length;

      const lines = [`Found **${total}** reviews (showing ${entities.length})`];

      if (entities.length > 0) {
        const rows = entities.map((rev: any) => [
          String(rev.id ?? '?'),
          (rev.title || '-').substring(0, 50),
          String(rev.type ?? '-'),
          String(rev.status ?? '-'),
          rev.case_id ? `#${rev.case_id}` : '-',
          String((rev.reviewers ?? []).length),
        ]);
        lines.push('', markdownTable(['ID', 'Title', 'Type', 'Status', 'Case', 'Reviewers'], rows));
      }

      if (entities.length < total) {
        lines.push('', `_Showing ${entities.length} of ${total} — page with limit/offset._`);
      }

      const structured = { total, returned: entities.length, entities };
      return richResult([summaryBlock(lines.join('\n')), dataBlock(structured)], structured);
    },
    (e) => reviewError(e, 'review list'),
  );
}

async function del(args: z.infer<typeof GetIdSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.reviews.deleteReview(args.code, args.id));

  return result.match(
    () => ({ success: true, review_id: args.id }),
    (e) => reviewError(e, 'review deletion'),
  );
}

async function bulkCreate(args: z.infer<typeof BulkCreateSchema>) {
  const client = getApiClient();
  const { code, reviews } = args;

  const prepared = [];
  for (const { case_id, reviewers, ...fields } of reviews) {
    if (case_id === undefined && !fields.title) {
      throw new ToolExecutionError(
        'Every "create" review in the batch needs a title.',
        'Add `title` to each item without a `case_id`. Nothing was sent — the API validates ' +
          'the whole batch, so one invalid item would reject all of them anyway.',
      );
    }
    prepared.push({
      proposed_case: await buildProposedCase(fields),
      ...(case_id !== undefined && { case_id }),
      ...(reviewers && { reviewers: await resolveReviewers(reviewers) }),
    });
  }

  const result = await toResultAsync(
    client.reviews.bulkCreateReviews(code, { reviews: prepared } as any),
  );

  return result.match(
    (r) => {
      // The API nests the results as items[].review_id, while the single-create
      // tool returns review_id at the top level. Surface a flat list of IDs so a
      // caller does not have to know the difference to find what it just created.
      const raw = r.data.result as any;
      const items: any[] = raw?.items ?? [];
      const review_ids = items
        .map((item) => item?.review_id ?? item?.id)
        .filter((id): id is number => typeof id === 'number');

      const lines = [`Opened **${review_ids.length}** of ${reviews.length} reviews`];
      if (review_ids.length > 0) {
        lines.push(
          '',
          ...review_ids.map((id, i) => `- **#${id}** ${reviews[i]?.title ?? ''}`.trimEnd()),
        );
      }
      if (review_ids.length < reviews.length) {
        lines.push(
          '',
          `_${reviews.length - review_ids.length} item(s) returned no ID — see \`items\` for what the API reported._`,
        );
      }

      const structured = { created: review_ids.length, review_ids, items };
      return richResult([summaryBlock(lines.join('\n')), dataBlock(structured)], structured);
    },
    (e) => reviewError(e, 'bulk review creation'),
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'qase_review_create',
  description:
    'Open a test case review — the pull-request flow for test cases. Pass `case_id` to propose ' +
    'changes to an existing case (an "edit" review; send only the fields that change), or omit ' +
    'it to propose a brand-new case (a "create" review, where `title` is required). Case fields ' +
    'are named and normalised exactly as in qase_case_upsert, enum labels included. ' +
    `${REVIEW_MUST_BE_ENABLED} Opening several reviews at once? Use qase_review_bulk_create — ` +
    'one request instead of one per review. ' +
    `${NO_WORKFLOW_ACTIONS} Cost: one API call, about 0.5s.`,
  schema: CreateSchema,
  handler: create,
  annotations: CreateAnnotation,
  outputSchema: ReviewCreateOutput,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_review_update',
  description:
    'Update an open review: change the proposed case fields, reassign reviewers, or both. ' +
    'Addressed by review ID; case fields follow the same naming and enum handling as ' +
    'qase_case_upsert. IMPORTANT: changing the proposal RESETS every approval already given, ' +
    'so a review that was ready to merge goes back to square one; updating only `reviewers` ' +
    `keeps the approvals. ${NO_WORKFLOW_ACTIONS} Cost: one API call, about 0.5s.`,
  schema: UpdateSchema,
  handler: update,
  annotations: UpdateAnnotation,
  outputSchema: ReviewUpdateOutput,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_review_list',
  description:
    'List the reviews in a project, with their current state, so you can see what is waiting on a ' +
    'human. Filter by status to find what is still open. Use this rather than guessing whether a ' +
    'proposal went through: since approving and merging are UI-only, the state here is the only ' +
    'way to know what happened to a review you opened. For one review whose ID you already have, ' +
    'qase_get with entity "review" is cheaper. Cost: one API call, about 0.5s, growing with the ' +
    'number of reviews returned.',
  schema: ListSchema,
  handler: list,
  annotations: ReadAnnotation,
  outputSchema: ReviewListOutput,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_review_delete',
  description:
    'Delete a review by ID. This removes the proposal entirely — it does not decline it, and ' +
    'declining is UI-only, so deleting is not a way to reject a change while keeping the record ' +
    'of it. Merged reviews cannot be deleted. The proposed case content goes with the review; the ' +
    'case it referenced is untouched. This cannot be undone. Deletion asks the user for ' +
    'confirmation and does not proceed without it. Cost: one API call, about 0.4s.',
  schema: GetIdSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_review_bulk_create',
  description:
    'Open several test case reviews in one request — the batch form of qase_review_create, and ' +
    'the right tool when proposing more than one change. The batch is validated as a whole, so ' +
    'if any item is invalid nothing is created, and each item is then processed and reported ' +
    'individually. Items take the same fields as qase_review_create: `case_id` for an edit ' +
    `review, omitted for a create review. ${REVIEW_MUST_BE_ENABLED} ${NO_WORKFLOW_ACTIONS} ` +
    'Cost: one API call regardless of batch size, so ten reviews cost roughly what one ' +
    'qase_review_create costs, not ten times as much.',
  schema: BulkCreateSchema,
  handler: bulkCreate,
  annotations: CreateAnnotation,
  outputSchema: ReviewBulkCreateOutput,
  visibility: 'discoverable',
});
