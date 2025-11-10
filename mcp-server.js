#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BROWSER_URL = "http://localhost:9222";
const MAX_RESPONSE_LENGTH = 25000; // Character limit for responses

// Helper function to truncate long strings
function truncateString(str, maxLength = MAX_RESPONSE_LENGTH) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + `\n\n[Truncated - Response exceeded ${maxLength} characters]`;
}

// Helper function to connect to browser
async function connectToBrowser() {
  try {
    return await puppeteer.connect({
      browserURL: BROWSER_URL,
      defaultViewport: null,
    });
  } catch (error) {
    throw new Error(
      `Failed to connect to browser on port 9222. ` +
      `Please ensure Chrome is running by calling browser_start first. ` +
      `Error details: ${error.message}`
    );
  }
}

// Helper function to get active page
async function getActivePage(browser) {
  const pages = await browser.pages();
  const page = pages.at(-1);
  if (!page) {
    throw new Error(
      "No active browser tab found. " +
      "Please navigate to a URL using browser_navigate before using this tool."
    );
  }
  return page;
}

// Helper function to format evaluation results
function formatEvalResult(result, format = "markdown") {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }

  // Markdown format
  if (Array.isArray(result)) {
    if (result.length === 0) {
      return "Empty array";
    }
    return result
      .map((item, idx) => {
        if (typeof item === "object" && item !== null) {
          return `**Item ${idx + 1}**\n${Object.entries(item)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join("\n")}`;
        }
        return `- ${item}`;
      })
      .join("\n\n");
  } else if (typeof result === "object" && result !== null) {
    return Object.entries(result)
      .map(([key, value]) => `- **${key}**: ${value}`)
      .join("\n");
  }
  return String(result);
}

// Helper function to format cookie output
function formatCookies(cookies, format = "markdown") {
  if (format === "json") {
    return JSON.stringify(cookies, null, 2);
  }

  // Markdown format
  return cookies
    .map(
      (cookie) =>
        `**${cookie.name}**\n` +
        `- Value: ${cookie.value}\n` +
        `- Domain: ${cookie.domain}\n` +
        `- Path: ${cookie.path}\n` +
        `- HttpOnly: ${cookie.httpOnly}\n` +
        `- Secure: ${cookie.secure}`
    )
    .join("\n\n");
}

// Helper function to format element info
function formatElementInfo(info, format = "markdown") {
  if (format === "json") {
    return JSON.stringify(info, null, 2);
  }

  // Markdown format
  if (Array.isArray(info)) {
    return info
      .map(
        (el, idx) =>
          `**Element ${idx + 1}**\n` +
          `- Tag: ${el.tag}\n` +
          `- ID: ${el.id || "none"}\n` +
          `- Class: ${el.class || "none"}\n` +
          `- Text: ${el.text || "none"}\n` +
          `- HTML: \`${el.html}\`\n` +
          `- Parents: ${el.parents}`
      )
      .join("\n\n");
  } else {
    return (
      `**Selected Element**\n` +
      `- Tag: ${info.tag}\n` +
      `- ID: ${info.id || "none"}\n` +
      `- Class: ${info.class || "none"}\n` +
      `- Text: ${info.text || "none"}\n` +
      `- HTML: \`${info.html}\`\n` +
      `- Parents: ${info.parents}`
    );
  }
}

// Create server instance
const server = new Server(
  {
    name: "browser-tools-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "browser_start",
        description:
          "Starts a Chrome browser instance with remote debugging enabled on port 9222. " +
          "This is the first tool you must call before using any other browser tools. " +
          "The browser will run in the background and persist between tool calls.\n\n" +
          "USE WHEN: Starting a new browser automation session or when other tools fail with connection errors.\n\n" +
          "PARAMETERS:\n" +
          "- useProfile (boolean, optional): When true, copies your default Chrome profile including saved cookies, login sessions, and browsing data. " +
          "Use this when you need to access authenticated sites without logging in again. When false (default), starts with a fresh profile.\n\n" +
          "BEHAVIOR:\n" +
          "- Kills any existing Chrome instances on port 9222 before starting\n" +
          "- Waits up to 15 seconds for Chrome to become ready\n" +
          "- Returns success message when browser is ready to accept commands\n\n" +
          "EXAMPLES:\n" +
          "- Start fresh browser: {\"useProfile\": false}\n" +
          "- Start with saved logins: {\"useProfile\": true}\n\n" +
          "ERROR HANDLING:\n" +
          "- If connection fails after 30 attempts, verify Chrome is installed\n" +
          "- If port 9222 is in use, existing Chrome will be killed first",
        inputSchema: {
          type: "object",
          properties: {
            useProfile: {
              type: "boolean",
              description:
                "Copy and use your default Chrome profile (includes cookies, logins, browsing data). " +
                "Set to true for authenticated sessions, false for fresh start.",
              default: false,
            },
          },
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: "browser_navigate",
        description:
          "Navigates the browser to a specified URL. Can navigate in the current active tab or open a new tab. " +
          "Waits for the DOM content to fully load before returning, ensuring the page is ready for interaction.\n\n" +
          "USE WHEN: You need to visit a webpage, load content, or open multiple pages in different tabs.\n\n" +
          "PARAMETERS:\n" +
          "- url (string, required): The complete URL to navigate to. Must include protocol (http:// or https://). " +
          "Examples: 'https://example.com', 'https://github.com/user/repo'\n" +
          "- newTab (boolean, optional): When true, opens URL in a new tab. When false (default), navigates the current active tab.\n" +
          "- format (string, optional): Response format - 'markdown' (default) or 'json'\n\n" +
          "BEHAVIOR:\n" +
          "- Waits for 'domcontentloaded' event before returning\n" +
          "- New tabs become the active tab for subsequent operations\n" +
          "- Navigation timeout is set to 30 seconds\n\n" +
          "EXAMPLES:\n" +
          "- Visit a site: {\"url\": \"https://news.ycombinator.com\"}\n" +
          "- Open in new tab: {\"url\": \"https://github.com\", \"newTab\": true}\n\n" +
          "ERROR HANDLING:\n" +
          "- If browser not started, returns error: 'Please call browser_start first'\n" +
          "- If URL is invalid, returns error with suggested format\n" +
          "- If navigation times out, returns error suggesting to check URL or network",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "Complete URL including protocol (e.g., 'https://example.com'). Must be a valid HTTP/HTTPS URL.",
              pattern: "^https?://",
            },
            newTab: {
              type: "boolean",
              description:
                "Open URL in a new tab instead of navigating current tab. Useful for comparing multiple pages.",
              default: false,
            },
            format: {
              type: "string",
              enum: ["markdown", "json"],
              description: "Output format: 'markdown' for human-readable, 'json' for structured data",
              default: "markdown",
            },
          },
          required: ["url"],
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      {
        name: "browser_eval",
        description:
          "Executes JavaScript code in the active browser tab's context with full DOM access. " +
          "Supports async/await syntax and returns the result of the expression. " +
          "This is the primary tool for extracting data, manipulating the page, or querying the DOM.\n\n" +
          "USE WHEN: You need to extract data from a page, query elements, read page content, or execute custom JavaScript logic.\n\n" +
          "PARAMETERS:\n" +
          "- code (string, required): JavaScript expression or code block to execute. Can use async/await. " +
          "Should return a value (primitive, object, or array). The code runs in the page context with access to all DOM APIs.\n" +
          "- format (string, optional): Output format - 'markdown' (default, human-readable) or 'json' (structured data)\n\n" +
          "BEHAVIOR:\n" +
          "- Code executes in an async function context\n" +
          "- Has full access to: document, window, DOM APIs, page variables\n" +
          "- Results are serialized and returned (complex objects become JSON)\n" +
          "- Arrays and objects are automatically formatted based on format parameter\n" +
          "- Output is truncated at 25,000 characters with warning if exceeded\n\n" +
          "EXAMPLES:\n" +
          "- Get page title: {\"code\": \"document.title\"}\n" +
          "- Count links: {\"code\": \"document.querySelectorAll('a').length\"}\n" +
          "- Extract data: {\"code\": \"Array.from(document.querySelectorAll('h2')).map(h => ({text: h.textContent, id: h.id}))\"}\n" +
          "- Async operation: {\"code\": \"await fetch('/api/data').then(r => r.json())\"}\n" +
          "- Get JSON format: {\"code\": \"document.title\", \"format\": \"json\"}\n\n" +
          "ERROR HANDLING:\n" +
          "- If browser not started, returns: 'Please call browser_start first'\n" +
          "- If no page loaded, returns: 'Please navigate to a URL using browser_navigate first'\n" +
          "- JavaScript errors are caught and returned with full stack traces\n" +
          "- For large results, consider using more specific selectors to reduce output size",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description:
                "JavaScript code to execute in browser context. Can be an expression or statement. " +
                "Examples: 'document.title', 'Array.from(document.links).map(l => l.href)'",
            },
            format: {
              type: "string",
              enum: ["markdown", "json"],
              description:
                "Output format: 'markdown' for formatted text with bullets/structure, 'json' for raw JSON data",
              default: "markdown",
            },
          },
          required: ["code"],
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      {
        name: "browser_screenshot",
        description:
          "Captures a screenshot of the current browser viewport and saves it to a temporary file. " +
          "Returns the absolute file path to the saved PNG image, which can be read or analyzed.\n\n" +
          "USE WHEN: You need to visually inspect a page, debug rendering issues, capture UI state, or analyze visual content.\n\n" +
          "PARAMETERS:\n" +
          "- format (string, optional): Output format for the file path - 'markdown' (default) or 'json'\n\n" +
          "BEHAVIOR:\n" +
          "- Captures only the visible viewport (not full page)\n" +
          "- Saves as PNG format with timestamp in filename\n" +
          "- Stores in system temp directory (e.g., /tmp or %TEMP%)\n" +
          "- File persists until system temp cleanup\n" +
          "- Each screenshot gets unique filename: 'screenshot-YYYY-MM-DDTHH-MM-SS-sssZ.png'\n\n" +
          "EXAMPLES:\n" +
          "- Take screenshot: {} (no parameters needed)\n" +
          "- Get path as JSON: {\"format\": \"json\"}\n\n" +
          "TYPICAL WORKFLOW:\n" +
          "1. browser_navigate to desired page\n" +
          "2. browser_screenshot to capture state\n" +
          "3. Use returned path with file reading tools if needed\n\n" +
          "ERROR HANDLING:\n" +
          "- If browser not started, returns: 'Please call browser_start first'\n" +
          "- If no page loaded, returns: 'Please navigate to a URL using browser_navigate first'\n" +
          "- If disk full, returns error with available space information",
        inputSchema: {
          type: "object",
          properties: {
            format: {
              type: "string",
              enum: ["markdown", "json"],
              description: "Output format for the file path response",
              default: "markdown",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: "browser_pick",
        description:
          "Opens an interactive element picker overlay in the browser, allowing visual selection of DOM elements. " +
          "User can hover to highlight elements, click to select, or multi-select with Cmd/Ctrl+Click. " +
          "Returns detailed information about selected element(s) including tag, ID, classes, text content, HTML, and parent hierarchy.\n\n" +
          "USE WHEN: You need to identify specific elements on a page, understand page structure, get element selectors, or let a human select elements interactively.\n\n" +
          "PARAMETERS:\n" +
          "- message (string, required): Instructions displayed to the user in the picker banner. " +
          "Be clear about what to select (e.g., 'Click the submit button', 'Select all product titles').\n" +
          "- format (string, optional): Output format - 'markdown' (default, human-readable) or 'json' (structured data)\n\n" +
          "BEHAVIOR:\n" +
          "- Injects visual overlay with hover highlighting\n" +
          "- Single click: Selects one element and closes picker\n" +
          "- Cmd/Ctrl+Click: Adds element to selection (shows green outline)\n" +
          "- Enter key: Confirms multi-selection and closes picker\n" +
          "- ESC key: Cancels selection and returns null\n" +
          "- Returns element details: tag, id, class, text (200 char max), html (500 char max), parent hierarchy\n\n" +
          "EXAMPLES:\n" +
          "- Single element: {\"message\": \"Click the login button\"}\n" +
          "- Multiple elements: {\"message\": \"Cmd+Click all article headers then press Enter\"}\n" +
          "- JSON output: {\"message\": \"Select the search input\", \"format\": \"json\"}\n\n" +
          "RETURNED DATA STRUCTURE:\n" +
          "- tag: HTML tag name (e.g., 'button', 'div')\n" +
          "- id: Element ID attribute or null\n" +
          "- class: Space-separated class names or null\n" +
          "- text: Trimmed text content (truncated to 200 chars)\n" +
          "- html: Outer HTML of element (truncated to 500 chars)\n" +
          "- parents: Full parent hierarchy as CSS selector path\n\n" +
          "ERROR HANDLING:\n" +
          "- If browser not started, returns: 'Please call browser_start first'\n" +
          "- If no page loaded, returns: 'Please navigate to a URL first'\n" +
          "- If user presses ESC, returns: 'Selection cancelled'\n" +
          "- Instructions should be clear to avoid user confusion",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description:
                "Clear instructions for user about what to select. " +
                "Examples: 'Click the submit button', 'Select the main navigation menu'",
              minLength: 5,
            },
            format: {
              type: "string",
              enum: ["markdown", "json"],
              description:
                "Output format: 'markdown' for formatted element info, 'json' for raw data structure",
              default: "markdown",
            },
          },
          required: ["message"],
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: "browser_cookies",
        description:
          "Extracts cookies from the current browser session. " +
          "Can retrieve all cookies or filter by domain. Returns cookie details including name, value, domain, path, and security flags. " +
          "Useful for authenticated scraping, session management, or understanding site authentication.\n\n" +
          "USE WHEN: You need to extract authentication tokens, analyze cookies for a domain, or debug login/session issues.\n\n" +
          "PARAMETERS:\n" +
          "- domain (string, optional): Filter cookies by domain. Will match exact domain and subdomains. " +
          "Examples: 'google.com' matches '.google.com' and 'www.google.com'. If omitted, returns all cookies.\n" +
          "- format (string, optional): Output format - 'markdown' (default, human-readable) or 'json' (structured data)\n\n" +
          "BEHAVIOR:\n" +
          "- Retrieves cookies from the active page context\n" +
          "- Returns HttpOnly cookies (not accessible via JavaScript)\n" +
          "- Domain filter matches subdomains (e.g., 'example.com' matches '.example.com', 'www.example.com')\n" +
          "- Returns all cookie attributes: name, value, domain, path, httpOnly, secure, sameSite, expires\n\n" +
          "EXAMPLES:\n" +
          "- Get all cookies: {} (no parameters)\n" +
          "- Filter by domain: {\"domain\": \"github.com\"}\n" +
          "- JSON format: {\"domain\": \"google.com\", \"format\": \"json\"}\n\n" +
          "RETURNED DATA:\n" +
          "- name: Cookie name\n" +
          "- value: Cookie value (may be encoded)\n" +
          "- domain: Cookie domain (may start with '.' for subdomains)\n" +
          "- path: Cookie path scope\n" +
          "- httpOnly: Whether cookie is HTTP-only (not accessible to JavaScript)\n" +
          "- secure: Whether cookie requires HTTPS\n\n" +
          "ERROR HANDLING:\n" +
          "- If browser not started, returns: 'Please call browser_start first'\n" +
          "- If no page loaded, returns: 'Please navigate to a URL first'\n" +
          "- If no cookies found, returns informative message about empty result\n" +
          "- Domain filter is case-insensitive",
        inputSchema: {
          type: "object",
          properties: {
            domain: {
              type: "string",
              description:
                "Optional domain filter (e.g., 'google.com'). Matches exact domain and all subdomains.",
              pattern: "^[a-zA-Z0-9][a-zA-Z0-9-.]",
            },
            format: {
              type: "string",
              enum: ["markdown", "json"],
              description:
                "Output format: 'markdown' for formatted cookie list, 'json' for structured array",
              default: "markdown",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "browser_start": {
        const useProfile = args.useProfile || false;

        // Kill existing Chrome
        try {
          execSync("killall 'Google Chrome'", { stdio: "ignore" });
          // Wait a bit for processes to fully die
          await new Promise((r) => setTimeout(r, 1000));
        } catch {
          // Chrome might not be running, that's fine
        }

        // Setup profile directory
        try {
          execSync("mkdir -p ~/.cache/scraping", { stdio: "ignore" });
        } catch (error) {
          throw new Error(
            `Failed to create cache directory. Please check file system permissions. Error: ${error.message}`
          );
        }

        if (useProfile) {
          try {
            // Sync profile with rsync (much faster on subsequent runs)
            execSync(
              `rsync -a --delete "${process.env.HOME}/Library/Application Support/Google/Chrome/" ~/.cache/scraping/`,
              { stdio: "pipe" }
            );
          } catch (error) {
            throw new Error(
              `Failed to copy Chrome profile. Ensure Chrome is installed and profile exists at ~/Library/Application Support/Google/Chrome/. Error: ${error.message}`
            );
          }
        }

        // Start Chrome in background (detached so Node can exit)
        try {
          spawn(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            [
              "--remote-debugging-port=9222",
              `--user-data-dir=${process.env["HOME"]}/.cache/scraping`,
            ],
            { detached: true, stdio: "ignore" }
          ).unref();
        } catch (error) {
          throw new Error(
            `Failed to start Chrome. Ensure Chrome is installed at /Applications/Google Chrome.app/. ` +
            `On Linux, update the path to /usr/bin/google-chrome. Error: ${error.message}`
          );
        }

        // Wait for Chrome to be ready by attempting to connect
        let connected = false;
        for (let i = 0; i < 30; i++) {
          try {
            const browser = await puppeteer.connect({
              browserURL: BROWSER_URL,
              defaultViewport: null,
            });
            await browser.disconnect();
            connected = true;
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        if (!connected) {
          throw new Error(
            "Failed to connect to Chrome after 30 attempts (15 seconds). " +
            "This may indicate Chrome failed to start. " +
            "Try manually running: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222'"
          );
        }

        return {
          content: [
            {
              type: "text",
              text: `✓ Chrome browser started successfully on port 9222${useProfile ? " with your saved profile (cookies and logins available)" : " with fresh profile"}. Ready for navigation.`,
            },
          ],
        };
      }

      case "browser_navigate": {
        const { url, newTab = false, format = "markdown" } = args;

        if (!url) {
          throw new Error(
            "Missing required parameter 'url'. " +
            "Please provide a complete URL including protocol. Example: {\"url\": \"https://example.com\"}"
          );
        }

        if (!url.match(/^https?:\/\//)) {
          throw new Error(
            `Invalid URL format: "${url}". ` +
            "URL must start with 'http://' or 'https://'. " +
            `Did you mean "https://${url}"?`
          );
        }

        const browser = await connectToBrowser();

        try {
          let resultMessage;
          if (newTab) {
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
            resultMessage = `✓ Opened in new tab: ${url}`;
          } else {
            const page = await getActivePage(browser);
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
            resultMessage = `✓ Navigated to: ${url}`;
          }

          return {
            content: [
              {
                type: "text",
                text: format === "json"
                  ? JSON.stringify({ success: true, url, newTab })
                  : resultMessage,
              },
            ],
          };
        } catch (error) {
          if (error.message.includes("timeout")) {
            throw new Error(
              `Navigation timeout after 30 seconds for URL: ${url}. ` +
              "The page may be slow to load or unreachable. " +
              "Try: 1) Check if URL is correct, 2) Check network connection, 3) Try a different URL"
            );
          }
          throw error;
        } finally {
          await browser.disconnect();
        }
      }

      case "browser_eval": {
        const { code, format = "markdown" } = args;

        if (!code) {
          throw new Error(
            "Missing required parameter 'code'. " +
            "Please provide JavaScript code to execute. " +
            "Example: {\"code\": \"document.title\"}"
          );
        }

        const browser = await connectToBrowser();

        try {
          const page = await getActivePage(browser);

          const result = await page.evaluate((c) => {
            const AsyncFunction = (async () => {}).constructor;
            return new AsyncFunction(`return (${c})`)();
          }, code);

          const formattedOutput = formatEvalResult(result, format);
          const truncatedOutput = truncateString(formattedOutput);

          return {
            content: [
              {
                type: "text",
                text: truncatedOutput,
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `JavaScript execution error: ${error.message}\n\n` +
            `Code attempted: ${code}\n\n` +
            "Common issues:\n" +
            "- Syntax errors: Check your JavaScript syntax\n" +
            "- Undefined variables: Ensure variables/functions exist in page context\n" +
            "- Async operations: Use 'await' for promises\n" +
            "Try simpler code first (e.g., 'document.title') to verify page context"
          );
        } finally {
          await browser.disconnect();
        }
      }

      case "browser_screenshot": {
        const { format = "markdown" } = args;

        const browser = await connectToBrowser();

        try {
          const page = await getActivePage(browser);

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `screenshot-${timestamp}.png`;
          const filepath = join(tmpdir(), filename);

          await page.screenshot({ path: filepath });

          return {
            content: [
              {
                type: "text",
                text: format === "json"
                  ? JSON.stringify({ filepath, timestamp })
                  : `Screenshot saved to: ${filepath}`,
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `Failed to capture screenshot: ${error.message}\n\n` +
            "Common issues:\n" +
            "- Disk full: Check available disk space\n" +
            "- Permissions: Ensure write access to temp directory\n" +
            "- Page not loaded: Ensure you've navigated to a URL first"
          );
        } finally {
          await browser.disconnect();
        }
      }

      case "browser_pick": {
        const { message, format = "markdown" } = args;

        if (!message) {
          throw new Error(
            "Missing required parameter 'message'. " +
            "Please provide instructions for what to select. " +
            "Example: {\"message\": \"Click the submit button\"}"
          );
        }

        if (message.length < 5) {
          throw new Error(
            "Parameter 'message' is too short. " +
            "Please provide clear instructions (at least 5 characters). " +
            "Example: {\"message\": \"Select the main navigation menu\"}"
          );
        }

        const browser = await connectToBrowser();

        try {
          const page = await getActivePage(browser);

          // Inject pick() helper into current page
          await page.evaluate(() => {
            if (!window.pick) {
              window.pick = async (message) => {
                if (!message) {
                  throw new Error("pick() requires a message parameter");
                }
                return new Promise((resolve) => {
                  const selections = [];
                  const selectedElements = new Set();

                  const overlay = document.createElement("div");
                  overlay.style.cssText =
                    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none";

                  const highlight = document.createElement("div");
                  highlight.style.cssText =
                    "position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.1s";
                  overlay.appendChild(highlight);

                  const banner = document.createElement("div");
                  banner.style.cssText =
                    "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:12px 24px;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;z-index:2147483647";

                  const updateBanner = () => {
                    banner.textContent = `${message} (${selections.length} selected, Cmd/Ctrl+click to add, Enter to finish, ESC to cancel)`;
                  };
                  updateBanner();

                  document.body.append(banner, overlay);

                  const cleanup = () => {
                    document.removeEventListener("mousemove", onMove, true);
                    document.removeEventListener("click", onClick, true);
                    document.removeEventListener("keydown", onKey, true);
                    overlay.remove();
                    banner.remove();
                    selectedElements.forEach((el) => {
                      el.style.outline = "";
                    });
                  };

                  const onMove = (e) => {
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    if (!el || overlay.contains(el) || banner.contains(el))
                      return;
                    const r = el.getBoundingClientRect();
                    highlight.style.cssText = `position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px`;
                  };

                  const buildElementInfo = (el) => {
                    const parents = [];
                    let current = el.parentElement;
                    while (current && current !== document.body) {
                      const parentInfo = current.tagName.toLowerCase();
                      const id = current.id ? `#${current.id}` : "";
                      const cls = current.className
                        ? `.${current.className.trim().split(/\s+/).join(".")}`
                        : "";
                      parents.push(parentInfo + id + cls);
                      current = current.parentElement;
                    }

                    return {
                      tag: el.tagName.toLowerCase(),
                      id: el.id || null,
                      class: el.className || null,
                      text: el.textContent?.trim().slice(0, 200) || null,
                      html: el.outerHTML.slice(0, 500),
                      parents: parents.join(" > "),
                    };
                  };

                  const onClick = (e) => {
                    if (banner.contains(e.target)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    if (!el || overlay.contains(el) || banner.contains(el))
                      return;

                    if (e.metaKey || e.ctrlKey) {
                      if (!selectedElements.has(el)) {
                        selectedElements.add(el);
                        el.style.outline = "3px solid #10b981";
                        selections.push(buildElementInfo(el));
                        updateBanner();
                      }
                    } else {
                      cleanup();
                      const info = buildElementInfo(el);
                      resolve(selections.length > 0 ? selections : info);
                    }
                  };

                  const onKey = (e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cleanup();
                      resolve(null);
                    } else if (e.key === "Enter" && selections.length > 0) {
                      e.preventDefault();
                      cleanup();
                      resolve(selections);
                    }
                  };

                  document.addEventListener("mousemove", onMove, true);
                  document.addEventListener("click", onClick, true);
                  document.addEventListener("keydown", onKey, true);
                });
              };
            }
          });

          const result = await page.evaluate((msg) => window.pick(msg), message);

          if (result === null) {
            return {
              content: [
                {
                  type: "text",
                  text: "Selection cancelled by user (ESC pressed). No elements selected.",
                },
              ],
            };
          }

          const formattedOutput = formatElementInfo(result, format);
          const truncatedOutput = truncateString(formattedOutput);

          return {
            content: [
              {
                type: "text",
                text: truncatedOutput,
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `Element picker error: ${error.message}\n\n` +
            "Common issues:\n" +
            "- Page navigation during selection: Wait for selection to complete\n" +
            "- JavaScript errors on page: Check browser console for conflicts\n" +
            "Try: Ensure page is fully loaded before using picker"
          );
        } finally {
          await browser.disconnect();
        }
      }

      case "browser_cookies": {
        const { domain, format = "markdown" } = args;

        const browser = await connectToBrowser();

        try {
          const page = await getActivePage(browser);
          const cookies = await page.cookies();

          const filteredCookies = domain
            ? cookies.filter(
                (cookie) =>
                  cookie.domain.toLowerCase().includes(domain.toLowerCase()) ||
                  cookie.domain.toLowerCase().includes(`.${domain.toLowerCase()}`)
              )
            : cookies;

          if (filteredCookies.length === 0) {
            const message = domain
              ? `No cookies found for domain: ${domain}. ` +
                "This may mean: 1) The domain hasn't been visited, 2) The site doesn't set cookies, 3) Cookies were cleared. " +
                "Try: Navigate to a page on this domain first using browser_navigate."
              : "No cookies found in current session. " +
                "This may mean: 1) No pages have been visited, 2) Sites don't set cookies, 3) Using fresh profile. " +
                "Try: Navigate to some pages first or use 'useProfile: true' when starting browser.";

            return {
              content: [
                {
                  type: "text",
                  text: format === "json" ? JSON.stringify({ cookies: [] }) : message,
                },
              ],
            };
          }

          const output = formatCookies(filteredCookies, format);
          const truncatedOutput = truncateString(output);

          return {
            content: [
              {
                type: "text",
                text: truncatedOutput,
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `Failed to retrieve cookies: ${error.message}\n\n` +
            "Common issues:\n" +
            "- Page not loaded: Navigate to a URL first\n" +
            "- Invalid domain filter: Check domain spelling"
          );
        } finally {
          await browser.disconnect();
        }
      }

      default:
        throw new Error(
          `Unknown tool: ${name}. ` +
          "Available tools: browser_start, browser_navigate, browser_eval, browser_screenshot, browser_pick, browser_cookies"
        );
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Browser Tools MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
