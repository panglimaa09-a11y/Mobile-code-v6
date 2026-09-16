# Mobile Code v6.2

Developer Hub menambahkan:
- Connections: OpenAI-compatible/local AI endpoint config.
- Agent: project-aware analysis through selected connection.
- Copilot: current-file suggestions through selected connection.
- MCP: endpoint registry + `/tools` probe.
- Plugins: local `.mce/plugins/<id>/plugin.json`, disabled by default and explicitly enabled.

Security notes:
- API keys are stored server-side under workspace/.mce and are not returned by GET /api/connections.
- AI calls are made by the Mobile Code server, not by browser JavaScript.
- MCP probe is explicit and only accepts http/https endpoints.
- Plugins are opt-in. This build does not auto-execute plugin JavaScript in the main page.
