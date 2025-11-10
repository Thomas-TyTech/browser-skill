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

// Helper function to connect to browser
async function connectToBrowser() {
  try {
    return await puppeteer.connect({
      browserURL: BROWSER_URL,
      defaultViewport: null,
    });
  } catch (error) {
    throw new Error(
      `Failed to connect to browser. Is Chrome running on port 9222? Error: ${error.message}`
    );
  }
}

// Helper function to get active page
async function getActivePage(browser) {
  const pages = await browser.pages();
  const page = pages.at(-1);
  if (!page) {
    throw new Error("No active tab found");
  }
  return page;
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
          "Start Chrome browser with remote debugging on port 9222. " +
          "Use --profile flag to copy your default Chrome profile (includes cookies, logins). " +
          "Kills any existing Chrome instances before starting.",
        inputSchema: {
          type: "object",
          properties: {
            useProfile: {
              type: "boolean",
              description: "Whether to use your default Chrome profile",
              default: false,
            },
          },
        },
      },
      {
        name: "browser_navigate",
        description:
          "Navigate to a URL in the browser. " +
          "Can navigate in the current tab or open a new tab. " +
          "Waits for DOM content to load before returning.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL to navigate to",
            },
            newTab: {
              type: "boolean",
              description: "Whether to open in a new tab",
              default: false,
            },
          },
          required: ["url"],
        },
      },
      {
        name: "browser_eval",
        description:
          "Execute JavaScript code in the browser context. " +
          "Has full DOM access with async/await support. " +
          "Returns the result of the evaluation, automatically formatted for arrays and objects.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "JavaScript code to execute",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "browser_screenshot",
        description:
          "Capture a screenshot of the current browser viewport. " +
          "Returns the file path to the saved screenshot in the temp directory.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "browser_pick",
        description:
          "Interactive element picker with visual overlay. " +
          "Allows clicking to select single elements or Cmd/Ctrl+Click for multi-select. " +
          "Returns detailed element info including tag, id, class, text, HTML, and parent hierarchy. " +
          "Press Enter to finish selection or ESC to cancel.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Instructions to display to the user during picking",
            },
          },
          required: ["message"],
        },
      },
      {
        name: "browser_cookies",
        description:
          "Extract HTTP-only cookies from the browser. " +
          "Optionally filter by domain. " +
          "Useful for authenticated scraping sessions.",
        inputSchema: {
          type: "object",
          properties: {
            domain: {
              type: "string",
              description: "Optional domain to filter cookies",
            },
          },
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
        } catch {}

        // Wait for processes to fully die
        await new Promise((r) => setTimeout(r, 1000));

        // Setup profile directory
        execSync("mkdir -p ~/.cache/scraping", { stdio: "ignore" });

        if (useProfile) {
          // Sync profile with rsync (much faster on subsequent runs)
          execSync(
            `rsync -a --delete "${process.env.HOME}/Library/Application Support/Google/Chrome/" ~/.cache/scraping/`,
            { stdio: "pipe" }
          );
        }

        // Start Chrome in background (detached so Node can exit)
        spawn(
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          [
            "--remote-debugging-port=9222",
            `--user-data-dir=${process.env["HOME"]}/.cache/scraping`,
          ],
          { detached: true, stdio: "ignore" }
        ).unref();

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
          throw new Error("Failed to connect to Chrome after 30 attempts");
        }

        return {
          content: [
            {
              type: "text",
              text: `✓ Chrome started on :9222${useProfile ? " with your profile" : ""}`,
            },
          ],
        };
      }

      case "browser_navigate": {
        const { url, newTab = false } = args;

        if (!url) {
          throw new Error("url parameter is required");
        }

        const browser = await connectToBrowser();

        try {
          if (newTab) {
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: "domcontentloaded" });
            return {
              content: [
                {
                  type: "text",
                  text: `✓ Opened: ${url}`,
                },
              ],
            };
          } else {
            const page = await getActivePage(browser);
            await page.goto(url, { waitUntil: "domcontentloaded" });
            return {
              content: [
                {
                  type: "text",
                  text: `✓ Navigated to: ${url}`,
                },
              ],
            };
          }
        } finally {
          await browser.disconnect();
        }
      }

      case "browser_eval": {
        const { code } = args;

        if (!code) {
          throw new Error("code parameter is required");
        }

        const browser = await connectToBrowser();

        try {
          const page = await getActivePage(browser);

          const result = await page.evaluate((c) => {
            const AsyncFunction = (async () => {}).constructor;
            return new AsyncFunction(`return (${c})`)();
          }, code);

          // Format output similar to the original script
          let output;
          if (Array.isArray(result)) {
            output = result
              .map((item) => {
                if (typeof item === "object" && item !== null) {
                  return Object.entries(item)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join("\n");
                }
                return String(item);
              })
              .join("\n\n");
          } else if (typeof result === "object" && result !== null) {
            output = Object.entries(result)
              .map(([key, value]) => `${key}: ${value}`)
              .join("\n");
          } else {
            output = String(result);
          }

          return {
            content: [
              {
                type: "text",
                text: output,
              },
            ],
          };
        } finally {
          await browser.disconnect();
        }
      }

      case "browser_screenshot": {
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
                text: filepath,
              },
            ],
          };
        } finally {
          await browser.disconnect();
        }
      }

      case "browser_pick": {
        const { message } = args;

        if (!message) {
          throw new Error("message parameter is required");
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

          // Format output similar to the original script
          let output;
          if (Array.isArray(result)) {
            output = result
              .map((item) =>
                Object.entries(item)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join("\n")
              )
              .join("\n\n");
          } else if (typeof result === "object" && result !== null) {
            output = Object.entries(result)
              .map(([key, value]) => `${key}: ${value}`)
              .join("\n");
          } else {
            output = result === null ? "Cancelled" : String(result);
          }

          return {
            content: [
              {
                type: "text",
                text: output,
              },
            ],
          };
        } finally {
          await browser.disconnect();
        }
      }

      case "browser_cookies": {
        const { domain } = args;

        const browser = await connectToBrowser();

        try {
          const page = await getActivePage(browser);
          const cookies = await page.cookies();

          const filteredCookies = domain
            ? cookies.filter(
                (cookie) =>
                  cookie.domain.includes(domain) ||
                  cookie.domain.includes(`.${domain}`)
              )
            : cookies;

          if (filteredCookies.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: domain
                    ? `No cookies found for domain: ${domain}`
                    : "No cookies found",
                },
              ],
            };
          }

          const output = filteredCookies
            .map(
              (cookie) =>
                `${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; HttpOnly=${cookie.httpOnly}; Secure=${cookie.secure}`
            )
            .join("\n");

          return {
            content: [
              {
                type: "text",
                text: output,
              },
            ],
          };
        } finally {
          await browser.disconnect();
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
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
