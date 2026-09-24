"""
CompassX EAM Model Context Protocol (MCP) Server package.

Provides agent tools and resources across 6 platform modules:
- workflow
- records
- forms
- entity
- condition
- people
and user acting context.
"""

from backend.mcp.server import mcp, create_mcp_server

__all__ = ["mcp", "create_mcp_server"]
