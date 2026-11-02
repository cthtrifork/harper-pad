//go:build mcp && production

package app

// Wails' built-in MCP server lets any local process click through the UI, read the DOM and call
// PadService (docs/mcp.md). It is for development only, so a build with both tags must not
// compile; the undefined name below is the error message.
var _ = the_mcp_build_tag_must_not_be_combined_with_the_production_tag
