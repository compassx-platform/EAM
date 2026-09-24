"""
Executable entrypoint for running the CompassX EAM MCP server:
    python -m backend.mcp [--transport stdio|sse] [--port 8001]
"""

from backend.mcp.server import main

if __name__ == "__main__":
    main()
