# GitHub Source Instructions

## Requirements

- `gh` CLI must be installed and authenticated
- Or `GITHUB_TOKEN` environment variable set

## For GitHub Repository

### Fetch repository overview
```bash
gh repo view <owner/repo>
```

### List repository structure
```bash
gh api repos/<owner/repo>/git/trees/HEAD?recursive=1 --jq '.tree[].path' | head -100
```

### Read important files
Clone locally or use API:
```bash
gh api repos/<owner/repo>/contents/README.md --jq '.content' | base64 -d
gh api repos/<owner/repo>/contents/src --jq '.[].name'
```

### Focus areas for comprehension
- README.md - Project purpose and overview
- Main entry points (index.ts, main.py, etc.)
- Core source files in src/ or lib/
- Configuration files (package.json, etc.)
- Documentation in docs/

## For GitHub Pull Request

### Fetch PR metadata
```bash
gh pr view <number> --repo <owner/repo> --json title,body,state,author,baseRefName,headRefName
```

### Get changed files list
```bash
gh pr view <number> --repo <owner/repo> --json files --jq '.files[].path'
```

### Get full diff
```bash
gh pr diff <number> --repo <owner/repo>
```

### Get PR discussion context
```bash
gh pr view <number> --repo <owner/repo> --json comments,reviews
```

### Get commit messages
```bash
gh pr view <number> --repo <owner/repo> --json commits --jq '.commits[].messageHeadline'
```

### Focus areas for changes
- PR title and description explain the "why"
- Commit messages provide context
- Diff shows the "what"
- Review comments highlight concerns
- Look at both added and removed code

## Prioritization

1. Always read PR/repo description first
2. Focus on source code over tests (unless testing-focused)
3. Limit to ~20 most relevant files
4. Skip generated files, lock files, binaries
