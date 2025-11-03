---
name: browser-tools
description: Minimal browser automation toolkit for web scraping, testing, and site exploration using Chrome DevTools Protocol. Use when tasks require browser interaction, JavaScript execution, element selection, or visual inspection of web pages. More efficient than browser MCP servers with only ~225 tokens vs 13,000-18,000 tokens.
license: MIT
---

# Browser Tools

Minimal CDP-based browser automation for collaborative site exploration, web scraping, and frontend development tasks. Provides token-efficient browser control without the overhead of full MCP servers.

All scripts are globally available with the `browser-tools-` prefix and can be executed from any directory.

## When to Use This Skill

Use this skill when tasks involve:
- Web scraping and data extraction
- Frontend development and testing  
- Visual inspection of web pages
- Interactive element selection for DOM analysis
- JavaScript execution in browser context
- Site exploration requiring browser state (cookies, sessions)
- Building deterministic scrapers with authenticated sessions

## Core Browser Tools

### Start Chrome Browser

```bash
browser-tools-start              # Fresh profile
browser-tools-start --profile    # Copy user profile (cookies, logins)
```

Start Chrome on `:9222` with remote debugging enabled. Use `--profile` to copy your default Chrome profile for authenticated sessions. Kills any existing Chrome instances first.

### Navigate to URLs

```bash
browser-tools-nav https://example.com       # Navigate current tab
browser-tools-nav https://example.com --new # Open new tab
```

Navigate to URLs in existing tab or create new tabs. Waits for DOM content to load before returning.

### Execute JavaScript

```bash
browser-tools-eval 'document.title'
browser-tools-eval 'document.querySelectorAll("a").length'
browser-tools-eval 'Array.from(document.querySelectorAll("h1")).map(h => h.textContent)'
browser-tools-eval 'document.querySelector("form").submit()'
```

Execute JavaScript in active page context with full DOM access and async support. Results are automatically formatted for readability - arrays and objects are displayed with key-value pairs.

### Take Screenshots

```bash
browser-tools-screenshot
```

Capture viewport screenshot of active tab. Returns temporary file path with timestamp for visual analysis. Use with Read tool to analyze images.

### Interactive Element Selection

```bash
browser-tools-pick "Select the navigation menu items"
browser-tools-pick "Click the form fields to extract"
browser-tools-pick "Choose the product cards"
```

Launch interactive element picker overlay on the active page. Instructions:
- Move mouse to highlight elements
- Click to select single element
- Cmd/Ctrl+Click for multi-select
- Enter to finish with selected elements
- ESC to cancel

Returns detailed element information including tag, id, class, text content, HTML snippet, and parent hierarchy for building selectors.

### Extract Cookies

```bash
browser-tools-cookies                    # Extract all cookies
browser-tools-cookies --domain google.com # Extract cookies for specific domain
```

Extract HTTP-only cookies for authenticated scraping. Useful for building deterministic scrapers that need to maintain session state.

## Installation & Setup

The skill requires puppeteer-core to be installed:

```bash
cd ~/agent-tools/browser-tools
npm install
```

Make scripts executable:

```bash
chmod +x scripts/*.js
```

## Workflow Patterns

### Web Scraping Setup
1. Start browser with profile: `browser-tools-start --profile`  
2. Navigate to target: `browser-tools-nav https://target-site.com`
3. Use pick tool to identify elements interactively: `browser-tools-pick "Select data elements"`
4. Execute JavaScript to extract data: `browser-tools-eval 'extractionCode'`
5. Save results using standard file operations or pipe to files

### Frontend Development  
1. Start fresh browser: `browser-tools-start`
2. Navigate to dev server: `browser-tools-nav http://localhost:3000`
3. Execute JavaScript for debugging: `browser-tools-eval 'debugCode'`
4. Take screenshots: `browser-tools-screenshot` for visual regression testing

### Multi-page Workflows
Chain navigation and extraction commands:
```bash
browser-tools-nav https://site.com/page1 && browser-tools-eval 'extractData()' > page1.json
browser-tools-nav https://site.com/page2 && browser-tools-eval 'extractData()' > page2.json
```

### Building Scrapers with Pick Tool
1. Use pick tool to interactively identify elements: `browser-tools-pick "Select product info"`
2. Copy returned selectors and element info
3. Build extraction JavaScript using the selectors
4. Test with eval tool: `browser-tools-eval 'document.querySelectorAll("selector")'`
5. Create deterministic scraper script

## Token Efficiency

This skill uses ~225 tokens compared to 13,000-18,000 tokens for equivalent MCP servers. Efficiency comes from:
- Leveraging existing model knowledge of Bash and JavaScript
- Focused tool descriptions rather than comprehensive API documentation  
- Minimal context overhead while maintaining full functionality

## Composability Benefits

Unlike MCP servers, tool outputs are fully composable:
- Pipe results to files for batch processing: `browser-tools-eval 'data()' > output.json`
- Chain multiple commands: `browser-tools-nav url && browser-tools-eval 'code'`
- Process outputs with standard Unix tools: `browser-tools-cookies | grep domain`
- Save intermediate results without consuming context space
- Build complex workflows combining multiple tools

## Implementation Notes

- All scripts use Puppeteer Core connecting to Chrome on localhost:9222
- JavaScript execution happens in async page context with full DOM access  
- Element picker provides detailed selector and context information for scraper building
- Screenshots saved to temporary directory with timestamp filenames
- Cookie extraction includes HTTP-only cookies inaccessible to page JavaScript
- Scripts handle connection failures gracefully and provide clear error messages

## Extension Pattern

Add new tools by creating focused scripts that:
1. Connect to Chrome DevTools on :9222
2. Perform specific operation  
3. Output structured, parseable results
4. Handle errors gracefully with clear messages
5. Disconnect cleanly

Keep each tool focused on single responsibility for maximum reusability and token efficiency. Follow the same argument parsing and output formatting patterns as existing tools.