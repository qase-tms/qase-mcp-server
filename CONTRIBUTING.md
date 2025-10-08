# Contributing to Qase MCP Server

First off, thank you for considering contributing to the Qase MCP Server! It's people like you that make this tool better for everyone.

## Code of Conduct

This project and everyone participating in it is governed by our commitment to providing a welcoming and inclusive environment. We expect all contributors to:

- Be respectful and considerate
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Environment details** (OS, Node.js version, MCP client)
- **Error messages** or logs if applicable
- **Code samples** or test cases if relevant

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear title and description**
- **Use case** - explain why this would be useful
- **Possible implementation** if you have ideas
- **Examples** of how it would be used

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following our coding standards
3. **Add tests** for any new functionality
4. **Update documentation** if needed
5. **Ensure all tests pass** and coverage remains above 70%
6. **Run the linter** and fix any issues
7. **Submit your pull request**

## Development Setup

### Prerequisites

- Node.js 18 or higher
- NPM 9 or higher
- Git
- Qase account with API token

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/qase-mcp-server.git
cd qase-mcp-server

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your QASE_API_TOKEN

# Build the project
npm run build

# Run tests
npm test
```

### Development Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, documented code
   - Follow existing patterns and conventions
   - Add unit tests for new functionality

3. **Test your changes**
   ```bash
   # Run tests
   npm test

   # Check coverage
   npm run test:coverage

   # Run linter
   npm run lint

   # Build to verify no errors
   npm run build
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `test:` - Test changes
   - `refactor:` - Code refactoring
   - `chore:` - Maintenance tasks

5. **Push and create a pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Coding Standards

### TypeScript Style

- Use TypeScript strict mode
- Avoid `any` type unless absolutely necessary (document with comment)
- Use descriptive variable and function names
- Keep functions small and focused
- Document complex logic with comments

### File Organization

```
src/
  operations/     # Entity operation modules
    entity.ts     # One file per entity
  utils/          # Utility functions
  client/         # API client configuration
  types/          # Type definitions
  index.ts        # Main entry point
```

### Adding New Tools

When adding a new tool:

1. **Create or update operation module** in `src/operations/`
2. **Define Zod schemas** for input validation
3. **Implement handler function** with error handling
4. **Register tool** with the tool registry
5. **Add unit tests** in `*.test.ts` file
6. **Update README.md** with tool documentation

Example:
```typescript
// src/operations/my-entity.ts
import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';

// Define schema
const MyOperationSchema = z.object({
  code: ProjectCodeSchema,
  name: z.string().min(1).max(255),
});

// Implement handler
async function myOperation(args: z.infer<typeof MyOperationSchema>) {
  const client = getApiClient();
  const { code, name } = args;

  const result = await toResultAsync(
    client.myEntity.myMethod(code, name)
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    }
  );
}

// Register tool
toolRegistry.register({
  name: 'my_operation',
  description: 'Brief description of what this does',
  schema: MyOperationSchema,
  handler: myOperation,
});
```

### Testing Requirements

- All new features must have unit tests
- Maintain code coverage above 70%
- Test both success and error cases
- Use mocks to avoid real API calls

Example test:
```typescript
describe('My Operation', () => {
  it('should perform operation successfully', async () => {
    const mockClient = {
      myEntity: {
        myMethod: jest.fn().mockResolvedValue({
          data: { result: { success: true } }
        }),
      },
    };

    // Test implementation
    expect(result).toEqual({ success: true });
  });

  it('should handle errors gracefully', async () => {
    // Test error case
  });
});
```

### Documentation

- Update README.md for new tools
- Add JSDoc comments to functions
- Include usage examples for complex features
- Update CHANGELOG.md for notable changes

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test.test.ts
```

### Writing Tests

- Place test files next to the code they test: `module.test.ts`
- Use descriptive test names
- Test edge cases and error conditions
- Mock external dependencies

## Debugging

### Using MCP Inspector

```bash
npm run inspector
```

The inspector provides an interactive UI for:
- Testing tools manually
- Inspecting tool schemas
- Viewing tool responses
- Debugging authentication

### Logging

Add debug logging:
```typescript
console.error('[Debug] Your debug message'); // Logs to stderr
```

## Project Structure

```
qase-mcp-server/
├── src/                    # Source code
│   ├── operations/         # Tool implementations
│   ├── utils/             # Utilities
│   ├── client/            # API client
│   ├── types/             # Type definitions
│   └── index.ts           # Entry point
├── build/                 # Compiled output
├── coverage/              # Test coverage reports
├── execution/             # Development plan docs
├── tests/                 # Test files (alongside source)
├── .env.example          # Example environment file
├── package.json          # NPM configuration
├── tsconfig.json         # TypeScript configuration
├── jest.config.js        # Jest configuration
├── eslint.config.js      # ESLint configuration
└── README.md             # Documentation
```

## Release Process

Releases are handled by project maintainers:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v1.x.x`
4. Push tag: `git push origin v1.x.x`
5. Publish to NPM: `npm publish`

## Questions?

- Check the [README](README.md) for usage documentation
- Search [existing issues](https://github.com/qase-tms/qase-mcp-server/issues)
- Create a new issue if needed
- Contact: support@qase.io

## Recognition

Contributors will be recognized in:
- CHANGELOG.md for significant contributions
- GitHub contributors page
- Project documentation

Thank you for contributing to Qase MCP Server! 🎉
