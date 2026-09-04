/**
 * Server instructions
 *
 * Sent once, in the response to `initialize`, and read before any tool is
 * chosen. This is the cheapest place to answer "which tool for this job" —
 * cheaper than the agent discovering it by making the wrong call first.
 */
export const SERVER_INSTRUCTIONS = `Qase is a test management platform: test cases, suites, runs, results, defects, plans, milestones, environments, and reviews, organized by project code. This server reads and writes all of it, and reports CI results directly.

Start any new project with qase_project_context: one call returns the suite tree, milestones, environments, custom fields, and users, instead of six separate list calls. For a single known record, use qase_get. For anything filtered, cross-project, or aggregated ("failed results this week", "open blockers"), use qql_search, backed by qql_help for syntax and field references per entity.

Reach for the batch call before the loop. One qql_search returns ten cases about four times faster than ten qase_get calls, and one qase_case_bulk_create writes ten cases about four times faster than ten qase_case_upsert calls. Every tool's description ends with what the call costs; read it before fetching or writing records one at a time.

Writing follows one pattern throughout: qase_case_upsert, qase_run_upsert, qase_plan_upsert, qase_suite_upsert, qase_defect_upsert all create when \`id\` is omitted and update when it's given. A case describes what to test; a result (qase_result_record) describes what happened when it ran, into an existing run. For CI, qase_ci_report collapses create-run, record-results, and complete-run into one call. qase_regression_run builds a run from a suite, plan, or explicit case list in one step. Attachments upload separately via qase_attachment_upload and are referenced by hash.

Projects and workspace-wide custom fields are managed here too: qase_project_create and qase_project_delete, qase_custom_field_upsert and qase_custom_field_delete. A project has no update endpoint, and a custom field's entity and type are fixed once it is created.

Only core tools are visible by default. Deletes, shared steps and parameters, attachments, external issue links, case reviews, defect triage, and project and custom-field management exist but start hidden: call qase_discover_tools with what you are trying to do to find and activate them, rather than assuming a capability does not exist.

Enum fields (priority, severity, status, type, automation) accept a label or the project's numeric ID, either works.`;
