import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { analyzeHtml } from './analyzer.js';
import { buildGeneratedKit } from './kit.js';
import { auditSource } from './source-auditor.js';

const pkg = createRequire(import.meta.url)('../package.json');
const PROTOCOL_VERSION = '2025-06-18';

const tools = [
  {
    name: 'audit_source',
    title: 'Site Audit',
    description: 'Audit the local source code of a website (a folder with HTML files) without any network access: titles, descriptions, H1s, canonical, noindex, robots.txt, sitemap.xml, legal pages, statically-broken internal links, thin content and more. Findings reference real file paths so an agent can fix them directly.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Path to the folder containing the publishable HTML (e.g. dist/, public/ or the project root).' },
        baseUrl: { type: 'string', description: 'Site base URL used to resolve absolute internal links. Default https://example.com.' },
        pageLimit: { type: 'number', description: 'Maximum HTML files to analyze. Default 200.' }
      },
      required: ['dir']
    }
  },
  {
    name: 'generate_seo_kit',
    title: 'SEO Starter Kit',
    description: 'Generate robots.txt, sitemap.xml, JSON-LD, Search Console checklist, legal templates, llms.txt, humans.txt, security.txt, and MCP config for a site URL. Pairs with audit_source: generate whatever the source audit reports as missing.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Canonical website URL.' },
        siteName: { type: 'string', description: 'Optional site or brand name. If omitted, interseo uses the domain.' },
        description: { type: 'string', description: 'Short site description.' },
        businessName: { type: 'string', description: 'Legal or business name.' },
        lang: { type: 'string', description: 'Primary language code (e.g. es, en) for the WebSite structured data.' },
        discoveredUrls: { type: 'array', items: { type: 'string' }, description: 'Known same-origin URLs to include in sitemap.xml.' }
      },
      required: ['url']
    }
  },
  {
    name: 'analyze_html',
    title: 'HTML Snapshot',
    description: 'Analyze raw HTML for SEO metadata, headings, links, images, JSON-LD, Open Graph, Twitter Cards, hreflang, and mixed content.',
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'HTML source.' },
        url: { type: 'string', description: 'Page URL used to resolve relative links.' }
      },
      required: ['html', 'url']
    }
  }
];

const handlers = {
  async audit_source(args) {
    return auditSource(args || {});
  },
  async generate_seo_kit(args) {
    return buildGeneratedKit(args || {});
  },
  async analyze_html(args) {
    return analyzeHtml(String(args?.html || ''), String(args?.url || 'https://example.com/'));
  }
};

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }

  if (!Object.hasOwn(message, 'id')) {
    return;
  }

  try {
    const result = await dispatch(message);
    write({ jsonrpc: '2.0', id: message.id, result });
  } catch (error) {
    write({ jsonrpc: '2.0', id: message.id, error: { code: error.rpcCode || -32603, message: error.message || 'Internal error' } });
  }
});

async function dispatch(message) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'interseo', title: 'interseo Site Audit', version: pkg.version },
      instructions: 'Use interseo tools to audit website source code offline and generate Google-ready SEO assets.'
    };
  }

  if (message.method === 'ping') {
    return {};
  }

  if (message.method === 'tools/list') {
    return { tools };
  }

  if (message.method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    const handler = handlers[name];
    if (!handler) {
      throw rpcError(-32602, `Unknown tool: ${name}`);
    }
    try {
      const data = await handler(args);
      return toolResult(data);
    } catch (error) {
      return {
        content: [{ type: 'text', text: String(error.message || error) }],
        isError: true
      };
    }
  }

  throw rpcError(-32601, `Unsupported method: ${message.method}`);
}

function rpcError(code, message) {
  const error = new Error(message);
  error.rpcCode = code;
  return error;
}

function toolResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: false
  };
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
