import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { analyzeHtml, auditSite, buildAuditReports, buildFixPrompts, buildGeneratedKit } from './auditor.js';

const pkg = createRequire(import.meta.url)('../package.json');
const PROTOCOL_VERSION = '2025-06-18';

const tools = [
  {
    name: 'audit_site',
    title: 'Audit Website SEO',
    description: 'Run a full interseo audit for a public website URL, including robots.txt, sitemap, metadata, policies, crawl checks, scoring, reports, and generated SEO kit files.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Website URL to audit.' },
        siteName: { type: 'string', description: 'Optional site or brand name. If omitted, interseo infers it from crawl metadata.' },
        crawlLimit: { type: 'number', description: 'Maximum same-origin pages to crawl. Default 5, max 40.' },
        linkProbeLimit: { type: 'number', description: 'Maximum internal URLs to probe for broken-link detection. Default 12.' }
      },
      required: ['url']
    }
  },
  {
    name: 'generate_seo_kit',
    title: 'Generate SEO Kit',
    description: 'Generate robots.txt, sitemap.xml, JSON-LD, Search Console checklist, legal templates, llms.txt, humans.txt, security.txt, and MCP config without crawling.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Canonical website URL.' },
        siteName: { type: 'string', description: 'Optional site or brand name. If omitted, interseo uses the domain.' },
        description: { type: 'string', description: 'Short site description.' },
        businessName: { type: 'string', description: 'Legal or business name.' },
        discoveredUrls: { type: 'array', items: { type: 'string' }, description: 'Known same-origin URLs to include in sitemap.xml.' }
      },
      required: ['url']
    }
  },
  {
    name: 'generate_fix_prompt',
    title: 'Generate SEO Fix Prompt',
    description: 'Generate a ready-to-use prompt for fixing SEO issues with the interseo skill, MCP workflow, or direct repository edits.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Website URL to audit before generating the prompt.' },
        mode: { type: 'string', enum: ['skill', 'mcp', 'direct'], description: 'Prompt style to return. Default skill.' },
        audit: { type: 'object', description: 'Optional audit result. If provided, no new crawl is needed.' }
      }
    }
  },
  {
    name: 'analyze_html',
    title: 'Analyze HTML SEO',
    description: 'Analyze raw HTML for SEO metadata, headings, links, images, JSON-LD, Open Graph, Twitter Cards, hreflang, and mixed content.',
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'HTML source.' },
        url: { type: 'string', description: 'Page URL used to resolve relative links.' }
      },
      required: ['html', 'url']
    }
  },
  {
    name: 'build_report',
    title: 'Build Audit Report',
    description: 'Build Markdown and CSV reports from an interseo audit JSON object.',
    inputSchema: {
      type: 'object',
      properties: {
        audit: { type: 'object', description: 'Audit result returned by audit_site.' }
      },
      required: ['audit']
    }
  }
];

const handlers = {
  async audit_site(args) {
    const result = await auditSite(args || {});
    return compactToolResult(result);
  },
  async generate_seo_kit(args) {
    return buildGeneratedKit(args || {});
  },
  async generate_fix_prompt(args) {
    const audit = args?.audit || await auditSite({ url: args?.url, crawlLimit: args?.crawlLimit, linkProbeLimit: args?.linkProbeLimit });
    const prompts = audit.fixPrompts || buildFixPrompts(audit);
    const mode = ['skill', 'mcp', 'direct'].includes(args?.mode) ? args.mode : 'skill';
    return { mode, prompt: prompts[mode], prompts, issues: prompts.issues };
  },
  async analyze_html(args) {
    return analyzeHtml(String(args?.html || ''), String(args?.url || 'https://example.com/'));
  },
  async build_report(args) {
    return buildAuditReports(args?.audit || {});
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
      serverInfo: { name: 'interseo', title: 'interseo', version: pkg.version },
      instructions: 'Use interseo tools to audit SEO, generate Google-ready assets, and build reports.'
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

function compactToolResult(result) {
  return {
    auditedAt: result.auditedAt,
    finalUrl: result.finalUrl,
    score: result.score,
    grade: result.grade,
    categories: result.categories,
    priority: (result.priority || []).slice(0, 12),
    robots: result.robots,
    sitemap: result.sitemap,
    policies: result.policies,
    crawl: result.crawl,
    kit: result.kit,
    dns: result.dns,
    reports: result.reports
  };
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}