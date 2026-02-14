import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const DEBUGGING_GUIDE = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'debugging-for-pulseflow.md'),
  'utf8'
);

const PULSEFLOW_API = 'https://pulseflow.co/api/automations';

const app = express();
app.use(cors());
app.use(express.json());

const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

// Helper: fetch automation
async function fetchAutomation(id) {
  try {
    const response = await fetch(`${PULSEFLOW_API}/${id}?password=${config.apiPassword}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

// Helper: analyze automation (returns string)
async function analyzeAutomation(automation) {
  const name = automation.name || 'Unnamed';
  const latestExec = automation.executions?.[0];
  const status = latestExec?.status || 'Unknown';
  const error = latestExec?.error || 'No error';
  
  const failedNodeMatch = error.match(/^([^(]+)\(([^)]+)\)/);
  const failedNodeType = failedNodeMatch?.[1]?.trim() || 'Unknown';
  const failedNodeId = failedNodeMatch?.[2]?.trim() || 'Unknown';
  
  const nodes = automation.definition?.nodes || [];
  const failedNode = nodes.find(n => n.id === failedNodeId);
  const nodeConfig = failedNode?.data?.config || {};
  
  const prompt = `Automation: "${name}"
Status: ${status}
Error: ${error}
Node: ${failedNodeType}
Config: ${JSON.stringify(nodeConfig)}

What's wrong? Fix it. Be concise.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: `Pulseflow expert. Use guide:\n\n${DEBUGGING_GUIDE.slice(0, 3000)}` },
      { role: 'user', content: prompt }
    ],
    max_tokens: 200
  });

  return completion.choices[0]?.message?.content || 'Could not analyze.';
}

// ============ ROUTES ============

// GET /api/debug/:id - Debug latest execution
app.get('/api/debug/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({ error: 'Automation ID required' });
  }
  
  const automation = await fetchAutomation(id);
  
  if (!automation) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  
  const analysis = await analyzeAutomation(automation);
  res.json({ automationId: id, analysis });
});

// GET /api/automation/:id - Get full automation data
app.get('/api/automation/:id', async (req, res) => {
  const { id } = req.params;
  
  const automation = await fetchAutomation(id);
  
  if (!automation) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  
  res.json({ automationId: id, ...automation });
});

// GET /api/automation/:id/definition - Get definition only
app.get('/api/automation/:id/definition', async (req, res) => {
  const { id } = req.params;
  
  const automation = await fetchAutomation(id);
  
  if (!automation) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  
  res.json({ automationId: id, definition: automation.definition });
});

// GET /api/automation/:id/executions - Get all executions
app.get('/api/automation/:id/executions', async (req, res) => {
  const { id } = req.params;
  
  const automation = await fetchAutomation(id);
  
  if (!automation) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  
  res.json({ 
    automationId: id, 
    executions: automation.executions 
  });
});

// GET /api/automation/:id/nodes - Get all nodes with their configs
app.get('/api/automation/:id/nodes', async (req, res) => {
  const { id } = req.params;
  
  const automation = await fetchAutomation(id);
  
  if (!automation) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  
  const nodes = automation.definition?.nodes || [];
  
  res.json({ 
    automationId: id, 
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.type,
      config: n.data?.config || {}
    }))
  });
});

// GET /api/automation/:id/summary - Quick summary
app.get('/api/automation/:id/summary', async (req, res) => {
  const { id } = req.params;
  
  const automation = await fetchAutomation(id);
  
  if (!automation) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  
  const latestExec = automation.executions?.[0];
  const successCount = automation.executions?.filter(e => e.status === 'SUCCESS').length || 0;
  const failCount = automation.executions?.filter(e => e.status === 'FAILED').length || 0;
  
  res.json({
    automationId: id,
    name: automation.name,
    latestStatus: latestExec?.status,
    latestError: latestExec?.error,
    totalRuns: automation.executions?.length || 0,
    successRate: `${((successCount / (automation.executions?.length || 1)) * 100).toFixed(1)}%`
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('\nAvailable routes:');
  console.log('  GET /api/debug/:id          - Debug latest execution');
  console.log('  GET /api/automation/:id     - Get full automation data');
  console.log('  GET /api/automation/:id/definition - Get definition only');
  console.log('  GET /api/automation/:id/executions - Get all executions');
  console.log('  GET /api/automation/:id/nodes     - Get all nodes');
  console.log('  GET /api/automation/:id/summary  - Quick summary');
  console.log('  GET /api/health              - Health check');
});
