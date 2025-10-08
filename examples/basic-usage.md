# Basic Usage Examples

This guide demonstrates common workflows using the Qase MCP Server.

## Prerequisites

- Qase MCP Server installed and configured
- `QASE_API_TOKEN` environment variable set
- An AI assistant (Claude, Cursor, etc.) connected to the MCP server

## Example 1: Working with Projects

### List All Projects

**Prompt:**
```
List all my Qase projects
```

**Expected Response:**
The AI will use the `list_projects` tool and return a formatted list of your projects with their codes, names, and counts of test cases, runs, and defects.

### Get Project Details

**Prompt:**
```
Show me details for project DEMO
```

**Expected Response:**
The AI will use the `get_project` tool to retrieve detailed information about the DEMO project.

### Create a New Project

**Prompt:**
```
Create a new project with code "MOBILE" and title "Mobile Testing"
```

**Expected Response:**
The AI will use the `create_project` tool to create the project.

## Example 2: Managing Test Cases

### List Test Cases

**Prompt:**
```
Show me all test cases in project DEMO
```

**Expected Response:**
The AI will use the `list_cases` tool with pagination to list test cases.

### Create a Simple Test Case

**Prompt:**
```
Create a test case in project DEMO:
- Title: "User can log in with valid credentials"
- Priority: High
- Severity: Major
- Description: "Verify that a user can successfully log in using valid username and password"
```

**Expected Response:**
The AI will use the `create_case` tool to create the test case.

### Create a Test Case with Steps

**Prompt:**
```
Create a test case in project DEMO titled "Login Flow" with these steps:
1. Navigate to login page
2. Enter username "test@example.com"
3. Enter password
4. Click login button
5. Verify user is redirected to dashboard
```

**Expected Response:**
The AI will create a test case with detailed step-by-step instructions.

### Update a Test Case

**Prompt:**
```
Update test case with ID 123 in project DEMO to set status as "Deprecated"
```

**Expected Response:**
The AI will use the `update_case` tool to modify the test case.

## Example 3: Organizing with Suites

### Create a Suite Hierarchy

**Prompt:**
```
In project DEMO, create a suite called "Authentication" and then create a child suite called "Login Tests" inside it
```

**Expected Response:**
The AI will:
1. Create the parent suite "Authentication" using `create_suite`
2. Create the child suite "Login Tests" with the parent ID

### List Suites

**Prompt:**
```
Show me all test suites in project DEMO
```

**Expected Response:**
The AI will use the `list_suites` tool to display the hierarchical suite structure.

## Example 4: Running Tests

### Create a Test Run

**Prompt:**
```
Create a test run in project DEMO called "Sprint 24 Regression" and include all test cases from suite "Authentication"
```

**Expected Response:**
The AI will:
1. List cases from the Authentication suite
2. Create a test run using `create_run` with those cases

### Record Test Results

**Prompt:**
```
In project DEMO, record a passed result for test case 123 in run "Sprint 24 Regression"
```

**Expected Response:**
The AI will use the `create_result` tool to record the test execution.

### Record a Failed Result with Details

**Prompt:**
```
Record a failed result for test case 456 in run ID 789 in project DEMO with this error:
- Comment: "Login button not responding"
- Stacktrace: "TypeError: Cannot read property 'click' of null at login.test.js:45"
```

**Expected Response:**
The AI will create a detailed failure result with the provided information.

### Complete a Test Run

**Prompt:**
```
Mark test run ID 789 in project DEMO as complete
```

**Expected Response:**
The AI will use the `complete_run` tool to finalize the test run.

## Example 5: Managing Defects

### Create a Defect

**Prompt:**
```
Create a defect in project DEMO:
- Title: "Login button unresponsive on mobile"
- Severity: Major
- Actual Result: "Button does not respond to tap events"
- Expected Result: "Button should trigger login when tapped"
```

**Expected Response:**
The AI will use the `create_defect` tool to create the defect.

### Update Defect Status

**Prompt:**
```
Update defect ID 42 in project DEMO to status "In Progress"
```

**Expected Response:**
The AI will use the `update_defect_status` tool to change the status.

### Resolve a Defect

**Prompt:**
```
Resolve defect ID 42 in project DEMO with resolution "Fixed in release 2.1.0"
```

**Expected Response:**
The AI will use the `resolve_defect` tool to mark it as resolved.

## Example 6: Using Custom Fields

### List Custom Fields

**Prompt:**
```
Show me all custom fields defined in project DEMO
```

**Expected Response:**
The AI will use the `list_custom_fields` tool to display available custom fields.

### Create a Test Case with Custom Fields

**Prompt:**
```
Create a test case in project DEMO with:
- Title: "Payment Processing"
- Custom field "Test Type" = "E2E"
- Custom field "Component" = "Checkout"
```

**Expected Response:**
The AI will create a test case with the specified custom field values.

## Example 7: Working with Milestones

### Create a Milestone

**Prompt:**
```
Create a milestone in project DEMO for "Release 2.1" with due date January 31, 2025
```

**Expected Response:**
The AI will use the `create_milestone` tool with the specified details.

### Link Test Cases to Milestone

**Prompt:**
```
Update test case 123 in project DEMO to link it to milestone "Release 2.1"
```

**Expected Response:**
The AI will update the test case to associate it with the milestone.

## Example 8: Managing Environments

### Create Test Environments

**Prompt:**
```
Create three test environments in project DEMO: "Development", "Staging", and "Production"
```

**Expected Response:**
The AI will create all three environments using the `create_environment` tool.

### Run Tests in Specific Environment

**Prompt:**
```
Create a test run in project DEMO for the "Staging" environment
```

**Expected Response:**
The AI will create a run linked to the Staging environment.

## Example 9: Bulk Operations

### Create Multiple Test Cases

**Prompt:**
```
Create these test cases in project DEMO:
1. "User can register new account"
2. "User can reset password"
3. "User can update profile"
```

**Expected Response:**
The AI will use the `bulk_create_cases` tool to create all cases efficiently.

### Create Multiple Results

**Prompt:**
```
In project DEMO run ID 789, record passed results for test cases 1, 2, 3, 4, and 5
```

**Expected Response:**
The AI will use the `create_results_bulk` tool to record all results in one operation.

## Example 10: Attachments

### Upload an Attachment

**Prompt:**
```
I have a screenshot at /path/to/screenshot.png. Upload it to project DEMO
```

**Expected Response:**
The AI will:
1. Read the file
2. Encode it as base64
3. Use the `upload_attachment` tool to upload it
4. Return the attachment hash

### Attach File to Test Case

**Prompt:**
```
Attach the screenshot (hash: abc123) to test case 456 in project DEMO
```

**Expected Response:**
The AI will update the test case to include the attachment.

## Tips for Best Results

1. **Be Specific**: Include project codes, IDs, and exact names
2. **Provide Context**: Mention what you're trying to achieve
3. **Use Natural Language**: The AI understands conversational requests
4. **Combine Operations**: Request multiple related actions in one prompt
5. **Check Results**: Ask the AI to verify the operation completed successfully

## Common Patterns

### Pattern: Create Test Case and Add to Run

```
Create a test case in DEMO for "API health check", then add it to run "Smoke Tests"
```

### Pattern: Find and Update

```
Find test case titled "Login Test" in DEMO and update its priority to Critical
```

### Pattern: Create Hierarchy

```
Create a suite "API Tests" in DEMO, then create test cases inside it for GET, POST, PUT, and DELETE operations
```

### Pattern: Analyze Results

```
Show me all failed test results from run "Sprint 24" in DEMO and create defects for each failure
```

## Next Steps

- Explore [QQL Queries](qql-queries.md) for advanced search capabilities
- Learn about [Automation Workflows](automation.md) for CI/CD integration
- Review the [main README](../README.md) for complete tool documentation
