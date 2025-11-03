# Browser Tools - Global Agent Setup

This directory contains browser automation tools designed to work globally across all Claude agents.

## Quick Setup

1. **Install dependencies:**
   ```bash
   cd ~/agent-tools/browser-tools
   npm install
   ```

2. **Add to shell PATH (add to your ~/.zshrc or ~/.bashrc):**
   ```bash
   export PATH="$PATH:$HOME/agent-tools/browser-tools/scripts"
   ```

3. **Or create alias for Claude Code:**
   ```bash
   alias cl="PATH=$PATH:$HOME/agent-tools/browser-tools/scripts claude --dangerously-skip-permissions"
   ```

4. **Add to Claude Code working directories:**
   ```bash
   # In Claude Code, run:
   # /add-dir ~/agent-tools/browser-tools
   ```

## Global Usage

Once set up, all tools are available globally:

- `browser-tools-start` - Start Chrome with debugging
- `browser-tools-nav` - Navigate to URLs  
- `browser-tools-eval` - Execute JavaScript
- `browser-tools-screenshot` - Capture screenshots
- `browser-tools-pick` - Interactive element picker
- `browser-tools-cookies` - Extract cookies

## Referencing the Skill

In Claude Code, reference the skill with:
```
@SKILL.md
```

This loads the complete browser tools documentation into context (only ~225 tokens vs 13,000+ for MCP servers).

## Platform Notes

**macOS:** Chrome path is hardcoded to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

**Linux/Windows:** Update the Chrome path in `scripts/start.js` for your platform:
- Linux: `/usr/bin/google-chrome` or `/opt/google/chrome/chrome`
- Windows: `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`

## Benefits Over MCP Servers

- **Token Efficient:** ~225 tokens vs 13,000-18,000 for browser MCP servers
- **Composable:** Pipe outputs, chain commands, process with Unix tools
- **Extensible:** Easy to add new focused tools
- **Fast:** No MCP server overhead or context switching
- **Universal:** Works with any agent that can run Bash commands# browser-skill
