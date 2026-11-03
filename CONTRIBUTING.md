# Contributing to T2K-4E GM Tool

Thank you for considering contributing to the Twilight: 2000 Fourth Edition GM Tool! This document outlines how to participate.

## 📋 Code of Conduct

- Be respectful to all contributors
- Assume good intentions
- Provide constructive feedback
- Welcome diverse perspectives
- No harassment or discrimination

## 🎯 How to Contribute

### Reporting Bugs

1. **Search existing issues** to avoid duplicates
2. **Provide details:**
   - Exact steps to reproduce
   - Expected vs actual behavior
   - System info (OS, Node version, browser)
   - Screenshots if applicable
   - Error messages from console/server logs

### Suggesting Features

1. **Describe the feature** clearly
2. **Explain the use case** — why is it needed?
3. **Provide examples** — how would users interact with it?
4. **Check compatibility** with existing features
5. **Link to related issues** if applicable

### Submitting Code

#### 1. Fork and Clone
```bash
git clone https://github.com/[YOUR-USERNAME]/Twilight2000-GM-Tool.git
cd Twilight2000-GM-Tool
```

#### 2. Create a Feature Branch
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-name
```

#### 3. Make Your Changes

**Code Style:**
- Follow existing code patterns
- Use meaningful variable names
- Comment complex logic
- Keep functions focused

**File Structure:**
- Server code in `server/`
- Client code in root (*.js, *.html)
- Tests in `tests/`
- Documentation in root (*.md)

#### 4. Test Your Changes

```bash
# Run full test suite
npm test

# Run specific test file
npm test -- tests/your-test.cjs

# Check Node.js version (must be 24+)
node --version
```

**Add tests** for new features:
- Test happy path
- Test error cases
- Test edge cases
- Verify database isolation

#### 5. Commit with Clear Messages

```bash
git add .
git commit -m "Brief description of change

Longer explanation of what changed and why.
Fixes #123 (if fixing an issue)
"
```

**Commit message format:**
```
Type: Brief description (50 chars max)

Detailed explanation (wrap at 72 chars):
- What changed
- Why it changed
- Any important details

Fixes #123
Co-authored-by: Name <email@example.com> (if applicable)
```

**Commit types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Test additions
- `refactor:` Code reorganization
- `perf:` Performance improvement
- `chore:` Maintenance

#### 6. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a PR with:
- **Title:** Clear, descriptive
- **Description:** What, why, and how
- **Related issues:** Links to issues
- **Breaking changes:** If any
- **Testing:** How to verify

## 📝 Code Standards

### JavaScript/Node.js

```javascript
// Use const by default, let if needed
const value = 42;

// Use meaningful names
const campaignId = campaign.id;

// Comment complex logic
// Calculate XP based on mission difficulty and player level
const xp = basexp + (difficulty * level);

// Consistent indentation (2 spaces)
function doSomething(param) {
  return param * 2;
}

// Error handling
try {
  const result = await operation();
} catch (error) {
  console.error('Operation failed:', error.message);
  throw new Error('Descriptive error message');
}
```

### HTML/CSS

```html
<!-- Use semantic HTML -->
<section class="campaign-editor">
  <h2>Campaign Setup</h2>
  <button class="btn btn-primary">Save</button>
</section>
```

```css
/* Use descriptive class names */
.campaign-editor {
  padding: 1rem;
}

/* Group related properties */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
}
```

## 🧪 Testing

### Running Tests

```bash
npm test                    # Run all tests
npm test -- tests/file.cjs  # Run specific file
npm test -- --grep "pattern" # Run matching tests
```

### Writing Tests

**Test file location:** `tests/your-feature.test.cjs`

**Test structure:**
```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { myFunction } from '../server/my-module.cjs';

test('myFunction returns correct value', () => {
  const result = myFunction(5);
  assert.strictEqual(result, 10);
});

test('myFunction handles edge cases', () => {
  assert.throws(
    () => myFunction(null),
    /Invalid input/
  );
});
```

**Coverage target:** Aim for >80% coverage on changed code

## 📚 Documentation

### Updating Docs

- **Code comments:** Explain *why*, not *what*
- **README updates:** If changing user-facing features
- **FEATURES.md:** If adding/changing features
- **ROADMAP.md:** If affecting timelines
- **Code examples:** Must be tested and working

### Writing Documentation

- Use clear, simple language
- Include examples
- Link to related docs
- Keep up-to-date
- Use code blocks with syntax highlighting

## 🔄 Review Process

### What Reviewers Look For

- ✅ Code follows style guide
- ✅ Tests included and passing
- ✅ No breaking changes (or clearly documented)
- ✅ Documentation updated
- ✅ Commit messages are clear
- ✅ Implementation matches description

### Responding to Review

- Be respectful and professional
- Ask clarifying questions if needed
- Suggest alternatives if disagreeing
- Make requested changes
- Request re-review after changes
- Close related issues

## ⚖️ License Agreement

By contributing, you agree:
- Your code is licensed under GPL v3
- You have the right to contribute it
- It's your original work (or properly attributed)
- You understand the implications

**Copyright:**
- You retain copyright for your contributions
- Your work is protected by GPL v3
- Other contributors retain their copyright
- The project as a whole is GPL v3

## 📋 Contribution Types

### Code Contributions
- New features
- Bug fixes
- Performance improvements
- Code refactoring

### Documentation Contributions
- Writing guides
- Improving existing docs
- Adding examples
- Translating (future)

### Community Contributions
- Testing and bug reports
- Feature suggestions
- Helping other users
- Spreading the word

## 🚀 Development Setup

### Quick Start
```bash
# Install Node.js 24+
# Clone the repository
git clone https://github.com/turbomursu/Twilight2000-GM-Tool.git
cd Twilight2000-GM-Tool

# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm start
```

### Development Workflow
1. Make changes
2. Run tests: `npm test`
3. Test in browser: http://localhost:3000
4. Commit changes
5. Push to fork
6. Create pull request

## 📌 Priority Areas

We especially welcome contributions for:

1. **Bug Fixes**
   - Issues labeled `bug`
   - Verified problems

2. **Feature Implementations**
   - Items in ROADMAP.md
   - Milestones 6b-6d
   - UI/UX improvements

3. **Documentation**
   - User guides
   - API documentation
   - Code examples

4. **Testing**
   - Increasing coverage
   - Edge case testing
   - Integration tests

## 🎯 Getting Started

### For First-Time Contributors

1. Look for issues labeled `good first issue`
2. Pick one that interests you
3. Comment "I'll work on this"
4. Clone, branch, and make changes
5. Open a PR for feedback
6. Iterate based on review
7. Get merged! 🎉

### Need Help?

- **Questions?** Comment on the issue
- **Stuck?** Ask in the PR discussion
- **Design questions?** Open a discussion
- **Just browsing?** Check out the ROADMAP.md

## 📊 Contribution Guidelines

### Pull Request Checklist

- [ ] Forked and branched from `main`
- [ ] Tests pass: `npm test`
- [ ] Code follows style guide
- [ ] Commits have clear messages
- [ ] Documentation updated
- [ ] No console warnings/errors
- [ ] PR description is complete
- [ ] Related issues linked

### Before Submitting

1. **Run full test suite:** `npm test`
2. **Check your changes:** `npm start`
3. **Review your code:** Does it follow patterns?
4. **Test edge cases:** Null, empty, overflow?
5. **Update docs:** README, FEATURES, ROADMAP?
6. **Clean up:** Remove debug code, console.log
7. **Commit messages:** Are they clear?

## 🎓 Learning Resources

### Understanding the Codebase

- **README.md** — Project overview
- **FEATURES.md** — What's implemented
- **ROADMAP.md** — What's planned
- **Milestone docs** — Feature details
- **Code comments** — Implementation details
- **Tests** — Usage examples

### Twilight: 2000 References

- **gmpack/** — Reference game materials
- **T2K 4E rules** — Official rulebook
- **Official procedures** — Combat, travel, etc.

## 🤝 Collaboration

### Working with Others

- Claim issues before working
- Coordinate complex features
- Discuss design decisions
- Review each other's code
- Share knowledge

### Communication

- **Issues:** For bugs and features
- **Discussions:** For questions
- **Pull Requests:** For code review
- **Comments:** For quick feedback

## 📈 Career Growth

Contributing to open source:
- Builds your portfolio
- Develops your skills
- Connects you with developers
- Demonstrates competence
- Helps the community

This project welcomes all skill levels!

## 🎉 Recognition

Contributors are recognized by:
- Commit history (permanent)
- GitHub contributor badge
- Special thanks in release notes (major contributions)
- CONTRIBUTORS.md file (if created)

## 📞 Questions?

- **How do I...?** Check CONTRIBUTING.md
- **Found a bug?** Open an issue
- **Want to contribute?** Fork and PR
- **Have suggestions?** Open a discussion

---

## 🙏 Thank You!

Every contribution, big or small, helps make this tool better for the T2K 4E community.

Together we're building something amazing. Let's make some legendary campaigns! 🎮

---

**Last Updated:** November 2, 2026  
**License:** GPL v3  
**Status:** Welcoming Contributions
