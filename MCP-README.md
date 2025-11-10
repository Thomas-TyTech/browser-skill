# Browser Tools MCP Server

This is an MCP (Model Context Protocol) server that provides browser automation capabilities without requiring API keys. It exposes the same functionality as the browser-tools CLI commands through the MCP protocol.

## Features

The MCP server provides six browser automation tools:

1. **browser_start** - Start Chrome with remote debugging
2. **browser_navigate** - Navigate to URLs
3. **browser_eval** - Execute JavaScript in the browser
4. **browser_screenshot** - Capture screenshots
5. **browser_pick** - Interactive element picker
6. **browser_cookies** - Extract cookies

## Installation

1. Install dependencies:
```bash
npm install
```

2. The MCP server can be run directly:
```bash
node mcp-server.js
```

Or if installed globally:
```bash
browser-tools-mcp
```

## Configuration

### Claude Desktop

Add this to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "browser-tools": {
      "command": "node",
      "args": ["/absolute/path/to/browser-skill/mcp-server.js"]
    }
  }
}
```

Or if installed globally via npm:

```json
{
  "mcpServers": {
    "browser-tools": {
      "command": "browser-tools-mcp"
    }
  }
}
```

### Other MCP Clients

The server uses stdio transport and follows the MCP protocol. It can be integrated with any MCP-compatible client by running it with the appropriate command configuration.

## Tool Descriptions

### browser_start

Starts Chrome browser with remote debugging on port 9222.

**Parameters:**
- `useProfile` (boolean, optional): Whether to copy and use your default Chrome profile (includes cookies, logins). Default: false

**Example:**
```json
{
  "useProfile": true
}
```

### browser_navigate

Navigate to a URL in the browser.

**Parameters:**
- `url` (string, required): The URL to navigate to
- `newTab` (boolean, optional): Whether to open in a new tab. Default: false

**Example:**
```json
{
  "url": "https://example.com",
  "newTab": false
}
```

### browser_eval

Execute JavaScript code in the browser context with full DOM access.

**Parameters:**
- `code` (string, required): JavaScript code to execute

**Example:**
```json
{
  "code": "document.title"
}
```

```json
{
  "code": "Array.from(document.querySelectorAll('a')).map(a => ({text: a.textContent, href: a.href}))"
}
```

### browser_screenshot

Capture a screenshot of the current browser viewport.

**Parameters:** None

**Returns:** File path to the saved screenshot in the temp directory

### browser_pick

Interactive element picker with visual overlay. Allows selecting elements by clicking on them in the browser.

**Parameters:**
- `message` (string, required): Instructions to display to the user during picking

**Usage:**
- Hover over elements to highlight them
- Click to select a single element
- Cmd/Ctrl+Click to select multiple elements
- Press Enter to finish (when multiple elements selected)
- Press ESC to cancel

**Example:**
```json
{
  "message": "Click the submit button"
}
```

**Returns:** Element information including:
- tag: HTML tag name
- id: Element ID (if present)
- class: Element classes (if present)
- text: Element text content (truncated to 200 chars)
- html: Element HTML (truncated to 500 chars)
- parents: Parent hierarchy

### browser_cookies

Extract HTTP-only cookies from the browser.

**Parameters:**
- `domain` (string, optional): Filter cookies by domain

**Example:**
```json
{
  "domain": "google.com"
}
```

**Returns:** Cookie information in format:
```
name=value; Domain=domain; Path=path; HttpOnly=true/false; Secure=true/false
```

## Usage Flow

1. Start the browser first:
   ```
   Use browser_start tool
   ```

2. Navigate to a page:
   ```
   Use browser_navigate with url
   ```

3. Interact with the page:
   - Execute JavaScript: `browser_eval`
   - Take screenshots: `browser_screenshot`
   - Select elements: `browser_pick`
   - Extract cookies: `browser_cookies`

## Requirements

- Chrome browser installed (macOS path: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`)
- Node.js
- Dependencies: puppeteer-core, @modelcontextprotocol/sdk

## Platform Notes

The current implementation assumes macOS paths for Chrome. For Linux/Windows, you would need to adjust the Chrome executable path in `mcp-server.js`:

- **Linux**: `/usr/bin/google-chrome` or `/usr/bin/chromium`
- **Windows**: `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`

## Comparison with CLI Tools

This MCP server provides the same functionality as the CLI tools but through the MCP protocol:

| CLI Tool | MCP Tool |
|----------|----------|
| browser-tools-start | browser_start |
| browser-tools-nav | browser_navigate |
| browser-tools-eval | browser_eval |
| browser-tools-screenshot | browser_screenshot |
| browser-tools-pick | browser_pick |
| browser-tools-cookies | browser_cookies |

## Benefits of MCP Server

- **No API Keys Required**: Uses local Chrome browser, no cloud services
- **Native Integration**: Works seamlessly with Claude Desktop and other MCP clients
- **Same Capabilities**: All functionality of CLI tools available through MCP
- **Stateful Sessions**: Browser stays open between tool calls for efficient workflows

## Troubleshooting

**Connection Error**: If you get "Failed to connect to browser", make sure:
1. Chrome is running with `browser_start` first
2. Port 9222 is not blocked
3. No other process is using port 9222

**No Active Tab**: If you get "No active tab found":
1. Make sure you've navigated to a page with `browser_navigate`
2. Check that Chrome didn't crash or close

## License

MIT
