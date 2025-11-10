"""Connection helpers for MCP servers"""

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


class MCPConnection:
    """Base MCP connection class"""

    def __init__(self):
        self.session = None
        self._context = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.__aexit__(exc_type, exc_val, exc_tb)
        if self._context:
            await self._context.__aexit__(exc_type, exc_val, exc_tb)

    async def list_tools(self) -> list[dict[str, Any]]:
        """List available tools"""
        if not self.session:
            raise RuntimeError("Connection not established")

        result = await self.session.list_tools()
        return [
            {
                "name": tool.name,
                "description": tool.description or "",
                "input_schema": tool.inputSchema,
            }
            for tool in result.tools
        ]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        """Call a tool"""
        if not self.session:
            raise RuntimeError("Connection not established")

        result = await self.session.call_tool(name, arguments)

        # Extract content from result
        if hasattr(result, "content"):
            if len(result.content) == 1:
                content_item = result.content[0]
                if hasattr(content_item, "text"):
                    return content_item.text
                return content_item
            return [
                item.text if hasattr(item, "text") else item
                for item in result.content
            ]

        return result


class StdioConnection(MCPConnection):
    """Stdio MCP connection"""

    def __init__(self, command: str, args: list[str] | None = None, env: dict[str, str] | None = None):
        super().__init__()
        self.command = command
        self.args = args or []
        self.env = env

    async def __aenter__(self):
        # Create server parameters
        server_params = StdioServerParameters(
            command=self.command,
            args=self.args,
            env=self.env,
        )

        # Connect to server
        self._context = stdio_client(server_params)
        read, write = await self._context.__aenter__()

        # Create session
        self.session = ClientSession(read, write)
        await self.session.__aenter__()

        # Initialize session
        await self.session.initialize()

        return self


def create_connection(
    transport: str,
    command: str | None = None,
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
    url: str | None = None,
    headers: dict[str, str] | None = None,
) -> MCPConnection:
    """Create MCP connection based on transport type"""

    if transport == "stdio":
        if not command:
            raise ValueError("Command is required for stdio transport")
        return StdioConnection(command, args, env)
    elif transport == "sse":
        raise NotImplementedError("SSE transport not yet implemented")
    elif transport == "http":
        raise NotImplementedError("HTTP transport not yet implemented")
    else:
        raise ValueError(f"Unknown transport type: {transport}")
