# Git Source Instructions

## Requirements

- Must be run from within a git repository
- `git` CLI available

## For Local Repository

### Check repo status
```bash
git status
git log --oneline -10
```

### Explore structure
```bash
find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) | grep -v node_modules | grep -v dist | head -50
```

### Read key files
Use the Read tool to read:
- README.md
- CLAUDE.md or AGENT.md
- Main source files identified from structure

### Focus areas for comprehension
- Entry points and main modules
- Core business logic
- Public APIs and interfaces
- Configuration and setup

## For Branch Diff

### Identify branches
```bash
git branch -a
git log --oneline main..<branch> # or master
```

### Get commit messages (explain why)
```bash
git log main..<branch> --format="%s%n%b"
```

### Get list of changed files
```bash
git diff --name-only main...<branch>
```

### Get full diff
```bash
git diff main...<branch>
```

### Get diff with context
```bash
git diff -U10 main...<branch>  # 10 lines of context
```

### Focus areas for changes
- Commit messages explain intent
- Look at both additions and deletions
- Understand what problem is being solved
- Note any refactoring vs new features

## Prioritization

1. Commit messages first - they explain why
2. Changed source files over changed tests
3. Core modules over utilities
4. Skip formatting-only changes
5. Limit diff review to meaningful changes
