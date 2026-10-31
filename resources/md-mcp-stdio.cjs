'use strict';
/**
 * The smallest MCP server loop DevLabs' bundled connectors need: newline-
 * delimited JSON-RPC 2.0 over stdio with `initialize`, `ping`, `tools/list` and
 * `tools/call`. No SDK, so the connectors ship as plain files next to the app
 * and run on its own Node (ELECTRON_RUN_AS_NODE). Logs go to stderr only:
 * stdout is the protocol.
 *
 * A tool is { name, description, inputSchema, run(args) → string | object }.
 * A thrown error becomes an `isError` tool result the agent can read and act on.
 */

const FALLBACK_PROTOCOL = '2025-06-18';

/** Handle one parsed message. Returns the response object, or null for a notification. */
async function handle(msg, server) {
  if (!msg || typeof msg !== 'object') return null;
  const { id, method, params } = msg;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (id === undefined || id === null) return null; // notifications (e.g. notifications/initialized)
  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: (params && params.protocolVersion) || FALLBACK_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: server.name, version: server.version }
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: server.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = server.tools.find((t) => t.name === (params && params.name));
      if (!tool) return fail(-32602, `unknown tool: ${params && params.name}`);
      try {
        const out = await tool.run((params && params.arguments) || {});
        return reply({ content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] });
      } catch (e) {
        return reply({ content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true });
      }
    }
    default:
      return fail(-32601, `method not found: ${method}`);
  }
}

/** Run the loop on stdin/stdout until stdin closes. */
function serve(server) {
  let buf = '';
  let pending = 0;
  let ended = false;
  const done = () => { if (ended && pending === 0) process.exit(0); };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) + '\n');
        continue;
      }
      pending++;
      void handle(msg, server).then((res) => {
        if (res) process.stdout.write(JSON.stringify(res) + '\n');
        pending--;
        done();
      });
    }
  });
  // Finish in-flight calls (e.g. a Discord request) before exiting.
  process.stdin.on('end', () => { ended = true; done(); });
}

module.exports = { handle, serve };
