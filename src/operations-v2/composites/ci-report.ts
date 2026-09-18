import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema } from '../../utils/validation.js';
import { CiReportOutput } from '../../utils/output-schemas.js';
import { richResult, summaryBlock, dataBlock, markdownTable } from '../../utils/rich-response.js';

const CONTEXT = 'CI report';

/** What the bulk results endpoint accepts in one request. */
const RESULTS_PER_CALL = 200;

/**
 * A ceiling on one tool call: ten requests, not an open-ended loop. Past this
 * the call risks outliving the client's timeout, and a timeout is the one
 * failure that tells the model nothing about how far the recording got.
 */
const MAX_RESULTS = 2000;

const CaseResultSchema = z.object({
  case_id: z.number().int().positive(),
  status: z.enum(['passed', 'failed', 'blocked', 'skipped', 'invalid']),
  comment: z.string().optional(),
  time_ms: z.number().int().min(0).optional(),
  stacktrace: z.string().optional(),
  defect: z.boolean().optional(),
  attachments: z
    .array(z.string())
    .optional()
    .describe('Attachment hashes from qase_attachment_upload'),
});

const Schema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Run title (e.g., "CI Build #1234")'),
  environment_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('ID of the environment the build ran against'),
  results: z
    .array(CaseResultSchema)
    .min(1)
    .max(
      MAX_RESULTS,
      `One CI report covers at most ${MAX_RESULTS} results — report a larger suite as several ` +
        'runs, or create the run with qase_run_upsert and record the results in batches.',
    )
    .describe(`Test results to record, 1 to ${MAX_RESULTS} per call`),
  complete: z
    .boolean()
    .optional()
    .default(true)
    .describe('Complete the run after recording results (default: true)'),
  is_autotest: z
    .boolean()
    .optional()
    .default(true)
    .describe('Mark as automated run (default: true)'),
});

async function handler(rawArgs: unknown) {
  // Tool handlers get raw MCP arguments — the registry only turns the schema
  // into JSON Schema for the protocol, so nothing has validated them and no
  // default has been applied yet. Parsing here is what makes `complete` and
  // `is_autotest` actually default to true, and what stops an oversized
  // report before a run is created for it.
  const parsed = Schema.safeParse(rawArgs);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
      .join('; ');
    throw createToolError(`Invalid arguments — ${details}`, CONTEXT);
  }

  const client = getApiClient();
  const { code, title, environment_id, results, complete, is_autotest } = parsed.data;

  // Step 1: Create run
  const runPayload: any = {
    title,
    is_autotest,
    cases: results.map((r) => r.case_id),
  };
  if (environment_id) runPayload.environment_id = environment_id;

  const runRes = await toResultAsync(client.runs.createRun(code, runPayload));
  const run = runRes.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, `${CONTEXT}: run creation failed`);
    },
  );

  const runId = (run as any).id;

  // Step 2: record the results, in batches of what the endpoint accepts. The
  // batch is split here rather than refused because a finished suite of more
  // than RESULTS_PER_CALL tests is the ordinary case, and refusing it would
  // send the agent back to the three-call sequence this tool replaces.
  const batches: (typeof results)[] = [];
  for (let i = 0; i < results.length; i += RESULTS_PER_CALL) {
    batches.push(results.slice(i, i + RESULTS_PER_CALL));
  }

  let recorded = 0;
  for (const batch of batches) {
    const bulkRes = await toResultAsync(
      client.results.createResultBulk(code, runId, { results: batch as any }),
    );
    bulkRes.match(
      () => {
        recorded += batch.length;
      },
      (e) => {
        // The run already holds everything recorded so far and there is no way
        // to unwind it, so say what landed and where. Repeating this call would
        // build a second run rather than finishing this one.
        throw createToolError(
          `${e} — recorded ${recorded} of ${results.length} results before this batch failed. ` +
            `Run ${runId} exists and holds those ${recorded}. Record the remaining ` +
            `${results.length - recorded} with qase_result_record into run ${runId}, ` +
            `${RESULTS_PER_CALL} at a time; calling qase_ci_report again would create a ` +
            'second run instead of completing this one.',
          `${CONTEXT}: result recording failed`,
        );
      },
    );
  }

  // Step 3: Complete run (optional)
  let runStatus = 'active';
  if (complete) {
    const completeRes = await toResultAsync(client.runs.completeRun(code, runId));
    completeRes.match(
      () => {
        runStatus = 'complete';
      },
      () => {
        runStatus = 'complete_failed'; // non-critical — run exists, results recorded
      },
    );
  }

  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const blocked = results.filter((r) => r.status === 'blocked').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  const statusIcon = failed > 0 ? '🔴' : '🟢';
  const lines = [
    `## ${statusIcon} CI Report: ${title}`,
    '',
    `- **Run ID:** ${runId}`,
    `- **Project:** ${code}`,
    `- **Status:** ${runStatus}`,
    `- **Total:** ${results.length}` +
      (batches.length > 1 ? ` (recorded in ${batches.length} requests)` : ''),
    '',
    markdownTable(
      ['Passed', 'Failed', 'Blocked', 'Skipped'],
      [[String(passed), String(failed), String(blocked), String(skipped)]],
      ['r', 'r', 'r', 'r'],
    ),
  ];

  if (failed > 0) {
    lines.push('', '**Failed cases:**');
    for (const r of results.filter((r) => r.status === 'failed')) {
      const comment = r.comment ? ` — ${r.comment}` : '';
      lines.push(`- Case #${r.case_id}${comment}`);
    }
  }

  const structured = { run_id: runId, run_status: runStatus, results_recorded: recorded };

  return richResult([summaryBlock(lines.join('\n')), dataBlock(structured)], structured);
}

toolRegistry.register({
  name: 'qase_ci_report',
  title: 'Report CI results',
  description:
    'Report a whole CI run in one call: creates the run, records every result, and completes it. ' +
    'This is the tool for a pipeline that has just finished — it replaces qase_run_upsert, then ' +
    'qase_result_record, then qase_run_complete, and leaves no half-open run behind if the agent ' +
    'stops early. Each result needs a numeric `case_id` plus a status, and may carry duration, ' +
    'comment, stacktrace and attachment hashes. Use qase_result_record instead when the run ' +
    'already exists and results arrive in stages; use qase_run_upsert when you need the run left ' +
    `open. A batch larger than ${RESULTS_PER_CALL} is split across requests for you, up to ` +
    `${MAX_RESULTS} results in one report. Cost: one tool call covering three API operations, ` +
    `plus one extra request per ${RESULTS_PER_CALL} results. A run with two results measured ` +
    'about 0.7s, against roughly 1.5s for the same work as three separate calls, and it grows ' +
    'with the number of results rather than with the number of round trips.',
  schema: Schema,
  handler,
  annotations: CreateAnnotation,
  outputSchema: CiReportOutput,
});
