# Mobile Code v6.4 — Extension Host

Mobile Code now includes a real extension architecture rather than a plugin list.

## Extension model
- `plugin.json` manifest
- version/publisher metadata
- activation events
- contributed commands
- explicit permissions
- isolated extension iframe (`sandbox="allow-scripts"`)
- host command bridge
- extension marketplace/catalog
- enable/disable/remove

## Built-in extensions
- Project Inspector — `workspace.read`
- HTML Preview Tools — `workspace.read`, `preview.read`
- Code Notes — `workspace.read`, `workspace.write`

## Workspace layout
```text
workspace/
└── .mce/
    ├── connections.json
    ├── mcp.json
    ├── notes.json
    └── plugins/
        └── <extension-id>/
            ├── plugin.json
            ├── index.html
            └── plugin.js
```

Third-party extensions should declare the minimum permissions they need. The host does not grant filesystem or terminal access implicitly.
