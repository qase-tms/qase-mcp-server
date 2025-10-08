# Automation Workflows

This guide demonstrates how to integrate the Qase MCP Server into automated workflows and CI/CD pipelines.

## Overview

The Qase MCP Server can be used to automate common testing workflows:

- Creating test runs for CI/CD builds
- Recording test results from automated test suites
- Analyzing test trends and creating reports
- Managing defects from test failures
- Maintaining test documentation

## Workflow 1: CI/CD Test Execution

### Automated Test Run Creation

**Scenario:** Automatically create a test run when a CI/CD pipeline starts.

**Prompt:**
```
Create a test run in project DEMO for build #1234 on the staging environment. Include all test cases from the "Regression" suite.
```

**AI Actions:**
1. List cases from "Regression" suite using `list_cases`
2. Create run using `create_run` with:
   - Title: "Build #1234 - Staging Regression"
   - Description: "Automated regression test run"
   - Environment: Staging
   - Cases: All from Regression suite

### Recording Test Results

**Scenario:** Record results from your test framework (Jest, Pytest, etc.)

**Prompt:**
```
I just ran automated tests. Record these results for run ID 789 in project DEMO:
- Test "Login Flow" - PASSED (2.3 seconds)
- Test "Registration" - PASSED (1.8 seconds)
- Test "Password Reset" - FAILED (error: "Email service timeout")
- Test "Profile Update" - BLOCKED (environment issue)
```

**AI Actions:**
Uses `create_results_bulk` to record all results efficiently.

### Completing the Run

**Prompt:**
```
All tests are done for run ID 789 in DEMO. Mark it as complete.
```

**AI Actions:**
Uses `complete_run` to finalize the test run.

## Workflow 2: Failure Analysis and Defect Creation

### Automated Defect Creation

**Scenario:** Automatically create defects for failed tests.

**Prompt:**
```
Find all failed test results from run ID 789 in DEMO and create a defect for each unique failure
```

**AI Actions:**
1. Search failed results: `list_results` with status filter
2. For each unique failure:
   - Create defect using `create_defect`
   - Link to test case using `attach_external_issue`

### Smart Defect Management

**Prompt:**
```
Find all open defects in DEMO where the linked test case has passed in the last 3 runs. Suggest which defects should be verified or closed.
```

**AI Actions:**
1. Search open defects
2. Check test results for each linked case
3. Analyze pass/fail patterns
4. Suggest defects ready for closure

## Workflow 3: Nightly Regression Suite

### Full Workflow Example

**Step 1: Create Nightly Run**

**Prompt:**
```
Create a nightly regression run for project DEMO:
- Title: "Nightly Regression - {current_date}"
- Environment: "Staging"
- Include all test cases with tag "regression"
- Add description: "Automated nightly regression suite"
```

**Step 2: Record Results**

**Prompt:**
```
Record bulk results for nightly run {run_id}:
{results_from_test_framework}
```

**Step 3: Analyze and Report**

**Prompt:**
```
Analyze the nightly run {run_id} in DEMO:
- Count passed/failed/blocked tests
- Identify flaky tests (passed sometimes, failed other times)
- List new failures (tests that passed in previous runs)
- Create summary report
```

**Step 4: Create Action Items**

**Prompt:**
```
For nightly run {run_id} failures:
- Create defects for new failures
- Update existing defects with new occurrences
- Mark flaky tests with the isFlaky flag
```

## Workflow 4: Sprint Management

### Sprint Start

**Prompt:**
```
Set up Sprint 24 in project DEMO:
1. Create milestone "Sprint 24" with end date {date}
2. Create test plan "Sprint 24 Testing"
3. Link all test cases tagged "sprint-24" to the plan
```

### Daily Health Check

**Prompt:**
```
Daily sprint health check for DEMO:
- Show active test runs
- Count today's test results by status
- List blocker and critical defects
- Calculate test completion percentage
```

### Sprint Close

**Prompt:**
```
Close Sprint 24 in project DEMO:
- Complete all active test runs
- Generate summary: total tests, pass rate, defects created
- List any open blocker/critical defects
- Update milestone status
```

## Workflow 5: Test Maintenance

### Identify Stale Tests

**Prompt:**
```
Find test maintenance candidates in DEMO:
- Test cases not executed in last 90 days
- Test cases with no recent updates
- Deprecated test cases still marked as "Actual"
- Test cases with broken external links
```

### Automation Candidates

**Prompt:**
```
Find test cases in DEMO that should be automated:
- Priority: High or Critical
- Automation: Not automated
- Execution count: > 5 times in last 30 days
- Status: Actual
```

### Cleanup Old Data

**Prompt:**
```
Clean up project DEMO:
- List test runs older than 180 days
- Find deprecated test cases
- Identify resolved defects older than 90 days
- Suggest data to archive
```

## Workflow 6: Release Validation

### Pre-Release Checklist

**Prompt:**
```
Pre-release validation for DEMO Release 2.1:
1. Find all test cases linked to milestone "Release 2.1"
2. Check if all have results in the latest run
3. Identify any failed or blocked tests
4. List all open defects for this milestone
5. Calculate overall readiness score
```

### Release Report

**Prompt:**
```
Generate release report for DEMO Release 2.1:
- Total test cases executed
- Pass/fail/blocked breakdown
- Critical/blocker defects status
- Flaky test count
- Code coverage (if available in custom fields)
- Recommendation: Ready/Not Ready
```

## Workflow 7: Quality Metrics

### Weekly Test Metrics

**Prompt:**
```
Generate weekly testing metrics for DEMO:
- Test execution trend (last 4 weeks)
- Average test duration
- Flaky test percentage
- Defect creation rate
- Test automation coverage
```

### Team Performance

**Prompt:**
```
Team metrics for last sprint in DEMO:
- Tests created by each author
- Tests executed per team member
- Defects resolved by assignee
- Average time to resolve defects
```

## Workflow 8: Parallel Test Execution

### Distribute Test Cases

**Prompt:**
```
I need to run tests in parallel across 4 environments. Divide test cases from suite "Full Regression" in DEMO into 4 equal groups and create a test run for each group.
```

**AI Actions:**
1. List all cases from "Full Regression"
2. Split into 4 groups
3. Create 4 test runs, one per group
4. Return run IDs for execution

### Aggregate Results

**Prompt:**
```
Aggregate results from parallel runs {run_ids} in DEMO:
- Combine all results
- Calculate overall pass rate
- Identify any failures
- Create consolidated report
```

## Workflow 9: Continuous Testing

### On Commit: Smoke Tests

**Trigger:** Every commit to main branch

**Prompt:**
```
Create and execute smoke test run for commit {commit_hash} in DEMO:
- Create run with commit hash in title
- Include only test cases tagged "smoke"
- Record results
- If any failures, create defect linked to commit
```

### On PR: Affected Tests

**Trigger:** Pull request created

**Prompt:**
```
For PR #{pr_number} affecting files {file_list}:
1. Find test cases tagged with affected components
2. Create test run for PR validation
3. Execute and record results
4. Comment on PR with test summary
```

### On Deploy: Regression Suite

**Trigger:** Deployment to staging/production

**Prompt:**
```
Post-deployment validation for {environment}:
1. Create regression run for deployment {deploy_id}
2. Execute all test cases tagged "{environment}-validation"
3. Record results
4. If failures > threshold, trigger rollback alert
```

## Workflow 10: Integration with Other Tools

### Jira Integration

**Prompt:**
```
Sync defects with Jira:
- Find all defects in DEMO created in last 7 days
- For each defect, attach external issue link to Jira ticket
- Update defect status based on Jira status
```

### Slack Notifications

**Prompt:**
```
Generate Slack message for daily test summary:
- Today's test runs and results
- New defects created
- Critical test failures
- Format as Slack markdown blocks
```

### GitHub Actions Example

**Prompt:**
```
Help me create a GitHub Actions workflow that:
1. Runs on PR creation
2. Creates Qase test run
3. Executes tests
4. Records results in Qase
5. Comments PR with results
```

## Best Practices

### 1. Use Descriptive Names

Include context in run names:
```
"Build #1234 - Staging Regression - PR #567"
```

### 2. Tag Everything

Use tags for filtering:
- `smoke`, `regression`, `integration`
- `critical`, `high-priority`
- `automated`, `manual`

### 3. Link to Source

Include links in descriptions:
- Build URL
- Commit hash
- PR number
- Jira ticket

### 4. Consistent Naming

Establish naming conventions:
```
Runs: "{Environment} - {Suite} - {Date/Build}"
Defects: "[{Severity}] {Brief Description}"
Milestones: "Sprint {Number}" or "Release {Version}"
```

### 5. Automate Cleanup

Regularly archive old data:
```
Complete runs older than 90 days
Delete draft test cases
Archive resolved defects
```

## Error Handling

### Handle API Failures

**Prompt:**
```
If creating a test run fails due to API error, what should I do?
```

**Response Strategy:**
- Retry with exponential backoff
- Log error details
- Create local backup of results
- Alert team if persistent

### Handle Missing Data

**Prompt:**
```
Some test cases are missing from the suite. How should I handle this?
```

**Response Strategy:**
- Verify suite name/ID
- Check project code
- List available suites
- Confirm case IDs exist

## Performance Tips

### Bulk Operations

Always use bulk endpoints when available:
```
create_results_bulk instead of multiple create_result calls
bulk_create_cases instead of individual creates
```

### Pagination

Handle large datasets:
```
Request: "List all test cases (handle pagination automatically)"
AI will iterate through pages to get complete results
```

### Rate Limiting

Be mindful of API limits:
```
Prompt: "Create 1000 test cases in batches of 50 with delays"
```

## Monitoring and Alerts

### Set Up Alerts

**Prompt:**
```
Monitor test health and alert me when:
- Flaky test count exceeds 10
- Pass rate drops below 90%
- Critical defects remain open > 48 hours
- Test execution time increases by 50%
```

### Dashboard Queries

**Prompt:**
```
Create dashboard queries for:
- Test execution trend (7 days)
- Defect burn-down chart
- Automation coverage over time
- Most failing test cases
```

## Next Steps

- Review [Basic Usage Examples](basic-usage.md) for fundamental operations
- Explore [QQL Queries](qql-queries.md) for advanced searches
- Check your CI/CD platform's documentation for webhook integration
- Set up monitoring and alerting for critical metrics

## Resources

- [Qase API Documentation](https://developers.qase.io)
- [GitHub Actions Example](https://github.com/qase-tms/qase-mcp-server/examples)
- [CI/CD Best Practices](https://help.qase.io)
