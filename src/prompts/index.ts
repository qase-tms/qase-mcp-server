/**
 * MCP Prompt Templates (Skills)
 *
 * Workflow recipes that MCP clients can invoke to guide agents through
 * multi-step testing workflows using Qase tools.
 *
 * Each prompt returns a sequence of messages that instruct the agent
 * how to accomplish a specific testing goal.
 */

interface PromptDef {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  build: (
    args: Record<string, string>,
  ) => Array<{ role: 'user'; content: { type: 'text'; text: string } }>;
}

const prompts: PromptDef[] = [
  {
    name: 'triage_failed_run',
    description:
      'Analyze a failed test run: show all failed results grouped by error pattern, ' +
      'suggest defects to create for unique failures.',
    arguments: [
      { name: 'project', description: 'Project code (e.g. DEMO)', required: true },
      { name: 'run_id', description: 'Test run ID to triage', required: true },
    ],
    build: (args) => [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Triage the failed test run #${args.run_id} in project ${args.project}.`,
            '',
            'Steps:',
            `1. Use qase_get to fetch run details: { entity: "run", code: "${args.project}", id: ${args.run_id} }`,
            `2. Use qase_api to get all results: GET /v1/result/${args.project} with filters[run]=${args.run_id}`,
            '3. Group the failed results by stacktrace similarity or error message pattern',
            '4. For each unique failure pattern:',
            '   - Show the error message and affected test cases',
            '   - Suggest creating a defect with qase_triage_defect',
            '5. Summarize: total passed/failed, unique failure patterns found, suggested defects',
          ].join('\n'),
        },
      },
    ],
  },

  {
    name: 'release_readiness',
    description:
      'Check release readiness for a milestone: test coverage, pass rate, open defects, blocking issues.',
    arguments: [
      { name: 'project', description: 'Project code (e.g. DEMO)', required: true },
      { name: 'milestone', description: 'Milestone name or ID', required: true },
    ],
    build: (args) => [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Check release readiness for milestone "${args.milestone}" in project ${args.project}.`,
            '',
            'Steps:',
            `1. Use qase_project_context to get project overview: { code: "${args.project}" }`,
            `2. Search for test runs linked to this milestone:`,
            `   qql_search: entity = "run" and project = "${args.project}" and milestone ~ "${args.milestone}"`,
            `3. Search for open defects:`,
            `   qql_search: entity = "defect" and project = "${args.project}" and status != "resolved"`,
            `4. For the latest run, get detailed results via qase_api`,
            '5. Produce a release readiness report:',
            '   - Milestone status and due date',
            '   - Test execution summary (total/passed/failed/untested)',
            '   - Pass rate percentage',
            '   - Open defects count by severity (blocker/critical/major)',
            '   - GO / NO-GO recommendation based on:',
            '     * No blocker/critical defects open',
            '     * Pass rate > 95%',
            '     * No untested high-priority cases',
          ].join('\n'),
        },
      },
    ],
  },

  {
    name: 'regression_workflow',
    description:
      'Create and manage a full regression test cycle: set up a run from a plan or suites, ' +
      'track progress, report results.',
    arguments: [
      { name: 'project', description: 'Project code (e.g. DEMO)', required: true },
      {
        name: 'title',
        description: 'Regression run title (e.g. "v2.1 Release Regression")',
        required: true,
      },
      {
        name: 'source',
        description: 'Source of test cases: plan ID, suite IDs (comma-separated), or "all"',
        required: true,
      },
    ],
    build: (args) => {
      const source = args.source || 'all';
      let sourceInstructions: string;

      if (source.match(/^\d+$/)) {
        sourceInstructions = `   Use plan_id: ${source}`;
      } else if (source.includes(',')) {
        const ids = source.split(',').map((s) => s.trim());
        sourceInstructions = `   Use suite_ids: [${ids.join(', ')}]`;
      } else {
        sourceInstructions = `   Use qql_search to find all actual cases, then pass their IDs`;
      }

      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Set up a regression test run "${args.title}" in project ${args.project}.`,
              '',
              'Steps:',
              `1. Use qase_project_context to understand the project: { code: "${args.project}" }`,
              `2. Create the regression run with qase_regression_run:`,
              `   - code: "${args.project}"`,
              `   - title: "${args.title}"`,
              sourceInstructions,
              '3. Report back:',
              '   - Run ID and URL',
              '   - Number of test cases included',
              '   - Which suites/plans were used as source',
              '4. Ask if I want to record any results or complete the run',
            ].join('\n'),
          },
        },
      ];
    },
  },

  {
    name: 'onboard_project',
    description:
      'Get a comprehensive overview of a Qase project for a new team member: ' +
      'structure, recent activity, key metrics.',
    arguments: [{ name: 'project', description: 'Project code (e.g. DEMO)', required: true }],
    build: (args) => [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Give me a comprehensive overview of project ${args.project} as if I'm a new team member.`,
            '',
            'Steps:',
            `1. Use qase_project_context: { code: "${args.project}" }`,
            `2. Search for recent test runs (last 10):`,
            `   qql_search: entity = "run" and project = "${args.project}"`,
            `3. Search for open defects:`,
            `   qql_search: entity = "defect" and project = "${args.project}"`,
            `4. Search for test cases to understand coverage:`,
            `   qql_search: entity = "case" and project = "${args.project}"`,
            '5. Present a structured overview:',
            '   - Project name, description, team size',
            '   - Test suite structure (top-level suites and their purpose)',
            '   - Test coverage: total cases, automation status if available',
            '   - Recent activity: last 5 runs with pass/fail stats',
            '   - Open defects by severity',
            '   - Environments and milestones in use',
            '   - Suggestions for where to start exploring',
          ].join('\n'),
        },
      },
    ],
  },

  {
    name: 'ci_integration',
    description:
      'Report CI/CD test results to Qase: create a run, record results, and get a summary.',
    arguments: [
      { name: 'project', description: 'Project code (e.g. DEMO)', required: true },
      {
        name: 'title',
        description: 'CI run title (e.g. "Build #1234 - main branch")',
        required: true,
      },
      {
        name: 'results_json',
        description: 'JSON array of results: [{"case_id": 1, "status": "passed"}, ...]',
        required: true,
      },
    ],
    build: (args) => [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Report CI test results to Qase project ${args.project}.`,
            '',
            'Steps:',
            `1. Use qase_ci_report to record results in one call:`,
            `   - code: "${args.project}"`,
            `   - title: "${args.title}"`,
            `   - results: ${args.results_json}`,
            `   - complete: true`,
            `   - is_autotest: true`,
            '2. Show the summary: run ID, pass/fail counts, any failures',
            '3. If there are failures, suggest next steps (triage, create defects)',
          ].join('\n'),
        },
      },
    ],
  },
];

/** Get all prompt definitions for ListPrompts */
export function listPrompts() {
  return prompts.map((p) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
  }));
}

/** Build prompt messages for GetPrompt */
export function getPrompt(name: string, args: Record<string, string> = {}) {
  const prompt = prompts.find((p) => p.name === name);
  if (!prompt) {
    throw new Error(
      `Unknown prompt: "${name}". Available: ${prompts.map((p) => p.name).join(', ')}`,
    );
  }

  // Validate required arguments
  for (const arg of prompt.arguments) {
    if (arg.required && !args[arg.name]) {
      throw new Error(`Missing required argument "${arg.name}" for prompt "${name}"`);
    }
  }

  return {
    description: prompt.description,
    messages: prompt.build(args),
  };
}
