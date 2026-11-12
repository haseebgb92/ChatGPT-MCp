# MCP Bridge v0.2.12 — Team Peers

Team Peers adds private Tailscale networking to existing Local MCP, Web MCP, and Meta Manager tunnels without changing existing OpenAI API keys or tunnel IDs.

## Setup on both computers

1. Install MCP Bridge v0.2.12 and Tailscale on both computers. Windows Firewall may need to allow TCP 44176 inbound on the Tailscale interface.
2. Join the same trusted Tailscale network (or use Tailscale device sharing). The two computers must appear online and reach each other. Do not publish the Team Peers listener with Tailscale Funnel.
3. On each computer, open Team peers and choose Copy private invite. Share the invite privately with the other person. The invite contains a secret bearer token.
4. Paste the OTHER computer's invite into Add a trusted PC on each computer, and select Check connection. Pairing is reciprocal: both PCs must approve the other IP in their peer list.
5. Test two-way chat. For screen preview, the computer owner enables Share my screen and the viewer clicks Start viewing.
6. For mouse/keyboard/commands, the owner clicks Allow control · 10 minutes and confirms. Stop remote control blocks commands and input immediately, or the grant expires after ten minutes.
7. Remove a peer and regenerate your invite to revoke old authorizations.

## ChatGPT accounts

Each person continues to use their own ChatGPT account, OpenAI Secure MCP tunnel, and Runtime API key. No credentials or existing tunnel IDs are shared. Each ChatGPT connects to its own Local MCP plugin, which now has peer_list, peer_status, peer_send_message, peer_read_messages, peer_view_screen, peer_input, and peer_run_command tools. These act through Tailscale to reach explicitly paired PCs. Shahbaz must have his own Local MCP tunnel connected in his ChatGPT account.

## Security

- The peer listener binds only to its Tailscale IPv4 address on port 44176; never to a public interface or Funnel.
- Every request requires a random 256-bit bearer token AND comes from a known reciprocal peer IP.
- Screen sharing and remote control are OFF by default every time the Bridge starts.
- The private config stores peer tokens and is user-only readable on Linux; do not post, email publicly, or put invites in logs.
- Remote shell commands execute with the receiving user's operating-system privileges, without a sandbox. Passwordless sudo can turn that into root access. Only approve a session for someone you trust and stop it afterward.
- Screen previews refresh about once a second, not a true high-FPS video stream. DRM/locked screens can be blanked.

## Supported platforms and verification

Linux/X11 supports screen sharing and mouse/keyboard through Electron DesktopCapturer and xdotool. Windows 11 has an Electron screen-capture path and a PowerShell input helper, but Windows integration awaits a real test on Shahbaz's PC. A Windows firewall rule may be required. The network must be Tailscale private and is encrypted by Tailscale. No additional application-layer end-to-end encryption is added.

Automated tests: node --test tests/peer-network.test.js tests/diagnostics.test.js

After installation, restart or reconnect Local MCP to discover the peer tools; do not overwrite older tunnel settings. This release is based on v0.2.11, not v0.2.3.
