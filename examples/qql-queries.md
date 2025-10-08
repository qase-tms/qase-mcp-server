# QQL (Qase Query Language) Examples

This guide demonstrates advanced search capabilities using QQL through the Qase MCP Server.

## What is QQL?

QQL (Qase Query Language) is a powerful query language for searching across Qase entities. It allows you to:

- Search across multiple projects simultaneously
- Filter by any field using operators
- Combine multiple conditions
- Sort and limit results
- Search test cases, runs, results, defects, and more

**Note:** QQL search requires a Business or Enterprise Qase subscription.

## Getting Help with QQL

### View QQL Syntax

**Prompt:**
```
Show me the QQL syntax documentation
```

**Expected Response:**
The AI will use the `qql_help` tool to display comprehensive QQL syntax, operators, and examples.

## Basic QQL Queries

### Search Test Cases by Status

**Prompt:**
```
Find all actual test cases in project DEMO
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" and status = "Actual"
```

### Search by Priority

**Prompt:**
```
Find all high priority test cases in DEMO
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" and priority = "High"
```

### Search by Automation Status

**Prompt:**
```
Find all non-automated test cases in DEMO
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" and automation = "is-not-automated"
```

## Date-Based Queries

### Recent Failures

**Prompt:**
```
Show me all failed test results from the last 7 days in project DEMO
```

**Expected QQL Query:**
```
entity = "result" and project = "DEMO" and status = "failed" and created >= now("-7d")
```

### Tests Created This Month

**Prompt:**
```
Find test cases created in January 2025 in DEMO
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" and created >= "2025-01-01" and created < "2025-02-01"
```

### Old Defects

**Prompt:**
```
Find defects older than 30 days that are still open in DEMO
```

**Expected QQL Query:**
```
entity = "defect" and project = "DEMO" and status = "open" and created < now("-30d")
```

## Multi-Project Queries

### Search Across Multiple Projects

**Prompt:**
```
Find all critical test cases in projects DEMO and MOBILE
```

**Expected QQL Query:**
```
entity = "case" and project in ["DEMO", "MOBILE"] and priority = "Critical"
```

### Cross-Project Defects

**Prompt:**
```
Find all blocker defects across all my projects
```

**Expected QQL Query:**
```
entity = "defect" and severity = "blocker"
```

## Advanced Filters

### Flaky Tests

**Prompt:**
```
Find all flaky test cases in DEMO that are not automated
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" and isFlaky = true and automation = "is-not-automated"
```

### Tests by Author

**Prompt:**
```
Find all test cases created by john@example.com in DEMO
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" and author.email = "john@example.com"
```

### Tests in Specific Suite

**Prompt:**
```
Find all test cases in the "Authentication" suite in DEMO
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" and suite.title = "Authentication"
```

## Test Run Queries

### Active Test Runs

**Prompt:**
```
Find all active (not completed) test runs in DEMO
```

**Expected QQL Query:**
```
entity = "run" and project = "DEMO" and status != "complete"
```

### Runs by Environment

**Prompt:**
```
Find all test runs executed in the Production environment
```

**Expected QQL Query:**
```
entity = "run" and environment.title = "Production"
```

### Recent Runs

**Prompt:**
```
Find test runs started in the last 24 hours
```

**Expected QQL Query:**
```
entity = "run" and created >= now("-24h")
```

## Result Analysis

### Failed Results with Details

**Prompt:**
```
Find all failed results from the last week with stacktraces
```

**Expected QQL Query:**
```
entity = "result" and status = "failed" and created >= now("-7d") and stacktrace != null
```

### Results by Status

**Prompt:**
```
Find all blocked test results in DEMO
```

**Expected QQL Query:**
```
entity = "result" and project = "DEMO" and status = "blocked"
```

### Execution Time Analysis

**Prompt:**
```
Find test results that took longer than 60 seconds
```

**Expected QQL Query:**
```
entity = "result" and time > 60000
```

## Defect Queries

### High Severity Open Defects

**Prompt:**
```
Find all open defects with major or blocker severity in DEMO
```

**Expected QQL Query:**
```
entity = "defect" and project = "DEMO" and status = "open" and severity in ["major", "blocker"]
```

### Resolved Defects

**Prompt:**
```
Find defects resolved in the last month
```

**Expected QQL Query:**
```
entity = "defect" and status = "resolved" and resolved >= now("-30d")
```

### Defects by Milestone

**Prompt:**
```
Find all defects linked to milestone "Release 2.1"
```

**Expected QQL Query:**
```
entity = "defect" and milestone.title = "Release 2.1"
```

## Custom Field Queries

### Filter by Custom Field

**Prompt:**
```
Find test cases in DEMO where custom field "Test Type" is "E2E"
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" and cf["Test Type"] = "E2E"
```

### Multiple Custom Field Conditions

**Prompt:**
```
Find test cases where Component is "API" and Layer is "Backend"
```

**Expected QQL Query:**
```
entity = "case" and cf["Component"] = "API" and cf["Layer"] = "Backend"
```

## Complex Queries

### Untested Cases in Active Runs

**Prompt:**
```
Find test cases in DEMO that are included in active runs but have no results yet
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" and run.status = "active" and resultCount = 0
```

### High Priority Non-Automated Tests

**Prompt:**
```
Find high or critical priority test cases that aren't automated and were created more than 90 days ago
```

**Expected QQL Query:**
```
entity = "case" and priority in ["high", "critical"] and automation = "is-not-automated" and created < now("-90d")
```

### Failed Tests Needing Defects

**Prompt:**
```
Find failed test results from the last 7 days that don't have linked defects
```

**Expected QQL Query:**
```
entity = "result" and status = "failed" and created >= now("-7d") and defects.count = 0
```

## Sorting and Limiting

### Most Recent First

**Prompt:**
```
Find the 10 most recently created test cases in DEMO
```

**Expected QQL Query:**
```
entity = "case" and project = "DEMO" order by created desc limit 10
```

### Oldest Defects First

**Prompt:**
```
Find the oldest open defects, show first 20
```

**Expected QQL Query:**
```
entity = "defect" and status = "open" order by created asc limit 20
```

## Useful Pre-Built Queries

### Daily Standup Query

**Prompt:**
```
Show me test activity from yesterday - runs, results, and defects
```

**Expected Queries:**
The AI might run multiple queries:
```
# Runs started yesterday
entity = "run" and created >= now("-24h") and created < now("0h")

# Results from yesterday
entity = "result" and created >= now("-24h")

# New defects
entity = "defect" and created >= now("-24h")
```

### Sprint Health Check

**Prompt:**
```
Check sprint health: show active runs, failed tests, and open blockers
```

**Expected Queries:**
```
# Active runs
entity = "run" and status = "active"

# Failed tests from active runs
entity = "result" and run.status = "active" and status = "failed"

# Blocker defects
entity = "defect" and status = "open" and severity = "blocker"
```

### Test Coverage Analysis

**Prompt:**
```
Analyze test coverage: show automated vs manual tests, and flaky test count
```

**Expected Queries:**
```
# Automated tests
entity = "case" and automation = "automated"

# Manual tests
entity = "case" and automation = "is-not-automated"

# Flaky tests
entity = "case" and isFlaky = true
```

## QQL Operators Reference

### Comparison Operators

- `=` - Equals
- `!=` - Not equals
- `>` - Greater than
- `>=` - Greater than or equal
- `<` - Less than
- `<=` - Less than or equal
- `in` - Value in array
- `~` - Contains (string)

### Logical Operators

- `and` - Both conditions must be true
- `or` - Either condition must be true
- `not` - Negates condition

### Date Functions

- `now()` - Current date/time
- `now("-7d")` - 7 days ago
- `now("-24h")` - 24 hours ago
- `now("-30d")` - 30 days ago

## Tips for Effective QQL Queries

1. **Start Simple**: Begin with basic entity and project filters, then add conditions
2. **Use Quotes**: Always quote string values and field names with spaces
3. **Test Incrementally**: Test each condition separately before combining
4. **Check Field Names**: Use `qql_help` to see available fields for each entity
5. **Date Arithmetic**: Use `now()` function for relative date queries
6. **Combine Wisely**: Use `and` for restrictive queries, `or` for broader searches

## Common Patterns

### Pattern: Find and Fix

```
Find test cases that failed in the last run → Create defects for each failure → Link defects to cases
```

### Pattern: Regression Analysis

```
Find all failed results from last 30 days → Group by test case → Identify flaky tests
```

### Pattern: Sprint Cleanup

```
Find old defects → Update status → Create milestone for remaining work
```

### Pattern: Test Maintenance

```
Find old non-automated tests → Prioritize for automation → Update custom field "Automation Candidate"
```

## Troubleshooting QQL

### Common Issues

**Error: "QQL search requires Business or Enterprise subscription"**
- Solution: Upgrade your Qase plan or use standard list/filter tools

**Error: "Unknown field: fieldname"**
- Solution: Check field name spelling and use `qql_help` for valid fields

**Error: "Syntax error near..."**
- Solution: Check operator syntax, quotes, and parentheses

**No Results Returned**
- Solution: Relax filters one by one to find which condition is too restrictive

## Next Steps

- Review [Basic Usage Examples](basic-usage.md) for fundamental operations
- Explore [Automation Workflows](automation.md) for CI/CD integration
- Check the [QQL Documentation](https://help.qase.io) for the latest features
