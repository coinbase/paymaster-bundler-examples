# Contributing to Paymaster & Bundler Examples

Thank you for your interest in contributing to the Coinbase Developer Platform Paymaster & Bundler Examples! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Adding New SDK Examples](#adding-new-sdk-examples)
- [Style Guidelines](#style-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to:
- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Coinbase Developer Platform account with API keys
- Git installed locally

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/paymaster-bundler-examples.git
   cd paymaster-bundler-examples
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

5. Add your Coinbase Developer Platform credentials to `.env`:
   ```
   CDP_API_KEY_NAME=your_key_name
   CDP_API_KEY_PRIVATE_KEY=your_private_key
   ```

## How to Contribute

### Reporting Issues

If you find a bug or have a suggestion:

1. Check if the issue already exists in the [Issues tab](../../issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - SDK and environment details

### Improving Documentation

Documentation improvements are always welcome! You can:
- Fix typos or clarify instructions
- Add missing steps or prerequisites
- Improve code comments
- Add troubleshooting tips

### Fixing Bugs

1. Create an issue describing the bug (or comment on existing one)
2. Fork the repository and create a branch:
   ```bash
   git checkout -b fix/description-of-fix
   ```
3. Make your changes with clear, focused commits
4. Test your changes thoroughly
5. Submit a pull request

## Adding New SDK Examples

We welcome examples for additional Account Abstraction SDKs! To add a new SDK example:

### Directory Structure

Create a new directory under `examples/`:

```
examples/
  your-sdk/
    src/
      index.ts          # Main implementation
    package.json        # Dependencies
    tsconfig.json       # TypeScript config
    README.md           # SDK-specific documentation
```

### Requirements

Your example must:

1. **Implement the Knight Warriors NFT mint** on Base Sepolia
2. **Use the Coinbase Developer Platform** for paymaster and bundler services
3. **Include proper error handling** for common failure modes
4. **Be fully documented** with inline comments
5. **Include a README.md** explaining:
   - How to install and run
   - Required environment variables
   - Key code concepts
   - Links to SDK documentation

### Code Standards

- Use TypeScript for type safety
- Follow existing code patterns in other examples
- Include comprehensive error handling
- Add console logging for transaction status
- Use environment variables for sensitive data

### Example Template

```typescript
// examples/your-sdk/src/index.ts
import { YourSDK } from 'your-sdk';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

// Initialize clients
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Your implementation here
async function mintNFT() {
  try {
    // Implementation
  } catch (error) {
    console.error('Mint failed:', error);
    throw error;
  }
}

mintNFT();
```

## Style Guidelines

### TypeScript

- Use strict TypeScript configuration
- Prefer `const` and `let` over `var`
- Use async/await over raw promises
- Add type annotations for function parameters and returns

### Formatting

- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

### Comments

- Use JSDoc for function documentation
- Explain "why" not "what" (code shows what)
- Comment complex business logic

## Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature or example
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

Examples:
```
feat(alchemy): add gas estimation example

docs(readme): clarify environment setup steps

fix(pimlico): resolve nonce tracking issue
```

## Pull Request Process

1. **Before submitting:**
   - Ensure all examples still work
   - Run linting and type checking
   - Update documentation if needed
   - Add yourself to CONTRIBUTORS.md (if it exists)

2. **PR Description should include:**
   - What changes were made
   - Why the changes were needed
   - How to test the changes
   - Any breaking changes

3. **Review Process:**
   - Maintainers will review within 5 business days
   - Address any requested changes promptly
   - Squash commits if requested

4. **After Merge:**
   - Your contribution will be acknowledged
   - Changes will be included in the next release

## Questions?

- Join the [Coinbase Developer Platform Discord](https://discord.gg/coinbase)
- Check the [Developer Documentation](https://docs.cdp.coinbase.com/)
- Open a [Discussion](../../discussions) for general questions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for helping make Account Abstraction more accessible to developers! 🚀
