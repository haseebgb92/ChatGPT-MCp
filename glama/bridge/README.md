# Restricted Glama container edition

This Dockerfile builds a genuine MCP server using MCP Bridge's **existing Local Files implementation**. Only five read-only tools run against two public Markdown examples baked into the image. No desktop access, Chrome sessions, local mounts, shell commands, credentials, or actual user files exist here.

The entrypoint deliberately disables shell, write, and HTTP access even if deployment attempts to enable them.

## Local verification

Run from the repository root:

```bash
docker build -t mcp-bridge:glama-readonly .
node --test tests/glama-container.test.mjs
```

The test runs the container with no network, no host mounts, read-only filesystem, capabilities dropped, and no-new-privileges. It checks tool enumeration, example reading and path traversal rejection.

## Glama deployment

On your claimed Glama listing, choose Dockerfile, set context to repository root and path to Dockerfile. Do not configure secrets, mounts, Chrome ports or shell flags. Run the build test and verify exactly the five read-only tools above. Publish a release **only if accurately marked "public documentation sample"**, not full desktop functionality. The complete MCP Bridge must still run on the user's own computer.
