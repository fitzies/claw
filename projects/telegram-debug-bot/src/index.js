import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Initialize bot
const bot = new TelegramBot(config.telegramBotToken, { polling: true });

const PULSEFLOW_API = 'https://pulseflow.co/api/automations';
const API_PASSWORD = config.apiPassword;

// Debugging guide loaded from file
const DEBUGGING_GUIDE = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'debugging-for-pulseflow.md'),
  'utf8'
);

console.log('🤖 Pulseflow Debug Bot started...');

// Helper: Fetch automation data
async function getAutomation(automationId) {
  try {
    const response = await fetch(`${PULSEFLOW_API}/${automationId}?password=${API_PASSWORD}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching automation:', error.message);
    return null;
  }
}

// Helper: Analyze execution logs
function analyzeExecution(execution) {
  const issues = [];
  const logs = execution.logs || [];
  
  // Find failed node
  const failedLog = logs.find(log => log.error !== null);
  
  if (!failedLog) {
    // Check if execution itself has error
    if (execution.error) {
      issues.push({
        type: 'execution_error',
        message: execution.error,
        severity: 'high'
      });
    } else if (execution.status === 'CANCELLED') {
      issues.push({
        type: 'cancelled',
        message: 'Execution was cancelled by user',
        severity: 'low'
      });
    } else {
      issues.push({
        type: 'unknown',
        message: 'No clear failure point found',
        severity: 'low'
      });
    }
    return { issues, failedNode: null };
  }
  
  const failedNode = execution.definition?.nodes?.find(n => n.id === failedLog.nodeId);
  
  // Analyze error type from output
  const errorOutput = failedLog.output || {};
  const errorMessage = failedLog.error || '';
  
  // Network errors
  if (errorMessage.match(/504|502|503|ETIMEDOUT|ECONNREFUSED|rate limit|429/i)) {
    issues.push({
      type: 'network',
      message: errorOutput.userMessage || 'Temporary network issue',
      retryable: true,
      severity: 'medium',
      fix: 'Wait a moment and retry the automation'
    });
  }
  
  // Blockchain errors
  if (errorMessage.match(/insufficient funds|execution reverted|CALL_EXCEPTION/i)) {
    if (errorMessage.match(/insufficient funds/i)) {
      issues.push({
        type: 'blockchain',
        message: 'Wallet has insufficient funds for this transaction',
        retryable: false,
        severity: 'high',
        fix: 'Fund your wallet or reduce the transaction amount'
      });
    }
    
    if (errorMessage.match(/INSUFFICIENT_OUTPUT_AMOUNT|slippage/i)) {
      issues.push({
        type: 'blockchain',
        message: errorOutput.revertReason || 'Slippage issue - price moved during execution',
        retryable: true,
        severity: 'medium',
        fix: 'Increase slippage tolerance (try 2-3%) or reduce swap amount'
      });
    }
    
    if (errorMessage.match(/execution reverted/i)) {
      issues.push({
        type: 'blockchain',
        message: errorOutput.revertReason || 'Transaction would revert',
        retryable: false,
        severity: 'high',
        fix: 'Check your parameters and try again with different values'
      });
    }
  }
  
  // Variable errors
  if (errorMessage.match(/Variable.*not found/i)) {
    issues.push({
      type: 'configuration',
      message: errorMessage,
      retryable: false,
      severity: 'high',
      fix: 'Add a Variable node before this node to set the variable'
    });
  }
  
  // Previous output errors
  if (errorMessage.match(/Previous node output|no previous node output/i)) {
    issues.push({
      type: 'configuration',
      message: errorMessage,
      retryable: false,
      severity: 'high',
      fix: 'Use this only after a node that produces output (like checkBalance)'
    });
  }
  
  // ForEach errors
  if (errorMessage.match(/For-Each|forEach/i)) {
    issues.push({
      type: 'configuration',
      message: errorMessage,
      retryable: false,
      severity: 'high',
      fix: 'Move the node inside the For-Each block or remove the sentinel'
    });
  }
  
  // Default fallback
  if (issues.length === 0) {
    issues.push({
      type: 'unknown',
      message: errorOutput.userMessage || errorMessage || 'Unknown error occurred',
      severity: 'medium',
      fix: 'Review your automation configuration and try again'
    });
  }
  
  return { issues, failedNode, failedLog };
}

// Helper: Generate diagnosis response
function generateDiagnosis(automation, executions) {
  const latestExecution = executions[0];
  
  if (!latestExecution) {
    return {
      status: 'unknown',
      message: 'No executions found for this automation'
    };
  }
  
  const { issues, failedNode, failedLog } = analyzeExecution(latestExecution);
  
  let response = `🔍 *Pulseflow Debug Report*\n\n`;
  response += `📊 *Automation*: ${automation.name || 'Unnamed'}\n`;
  response += `📅 *Last Run*: ${new Date(latestExecution.startedAt).toLocaleString()}\n`;
  response += `📈 *Status*: ${latestExecution.status}\n\n`;
  
  if (failedNode) {
    response += `❌ *Failed Node*: ${failedNode.type}\n`;
    if (failedNode.data?.notes) {
      response += `📝 *Notes*: ${failedNode.data.notes}\n`;
    }
  }
  
  response += `\n🔴 *Issues Found*:\n`;
  issues.forEach((issue, idx) => {
    response += `${idx + 1}. *${issue.type.toUpperCase()}*${issue.retryable ? ' (retryable)' : ''}\n`;
    response += `   ${issue.message}\n`;
    response += `   💡 Fix: ${issue.fix}\n\n`;
  });
  
  // Additional context
  if (failedLog?.input) {
    response += `📋 *Node Configuration Used*:\n`;
    const inputStr = JSON.stringify(failedLog.input, null, 2);
    response += `\`\`\`${inputStr.slice(0, 500)}\`\`\`\n`;
  }
  
  // Execution history
  response += `\n📜 *Recent Executions*:\n`;
  executions.slice(0, 5).forEach((ex, idx) => {
    const emoji = ex.status === 'SUCCESS' ? '✅' : ex.status === 'FAILED' ? '❌' : '⏸️';
    response += `${emoji} ${new Date(ex.startedAt).toLocaleString()} - ${ex.status}\n`;
  });
  
  // Wallet reminder
  response += `\n⚠️ *Note*: Since your wallet is connected to Pulseflow, I recommend reviewing the configuration yourself rather than making changes through this bot.`;
  
  return {
    status: latestExecution.status,
    message: response,
    issues,
    execution: latestExecution
  };
}

// Start message
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `🤖 *Pulseflow Debug Bot*\n\nSend me your automation ID and I'll analyze your recent executions to help diagnose issues.\n\nJust paste the automation ID (e.g., \`cmkwhwr4j0001jp0412bdp8zw\`) and I'll do the rest!`,
    { parse_mode: 'Markdown' }
  );
});

// Help message
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `📖 *How to use*\n\n1. Go to Pulseflow and open your automation\n2. Copy the automation ID from the URL or settings\n3. Send it to me\n\nI'll fetch the last 10 executions and analyze any issues!`,
    { parse_mode: 'Markdown' }
  );
});

// Handle automation IDs
const idPattern = /^[a-z0-9]{20,30}$/;

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  
  // Skip commands
  if (text?.startsWith('/')) return;
  
  // Check if message looks like an automation ID
  if (idPattern.test(text)) {
    bot.sendMessage(chatId, `🔍 Analyzing automation \`${text}\`...`, { parse_mode: 'Markdown' });
    
    const automation = await getAutomation(text);
    
    if (!automation) {
      bot.sendMessage(chatId,
        `❌ Could not fetch automation \`${text}\`\n\nPlease verify:\n- The ID is correct\n- The automation exists\n\nTry again or contact support.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Get executions (assume they're included in the automation response)
    const executions = (automation.executions || []).slice(0, 10);
    
    const diagnosis = generateDiagnosis(automation, executions);
    
    bot.sendMessage(chatId, diagnosis.message, { parse_mode: 'Markdown' });
    return;
  }
  
  // Handle URLs
  if (text?.includes('pulseflow.co/automations/')) {
    const match = text.match(/automations\/([a-z0-9]+)/);
    if (match) {
      const automationId = match[1];
      bot.sendMessage(chatId, `🔍 Analyzing automation \`${automationId}\`...`, { parse_mode: 'Markdown' });
      
      const automation = await getAutomation(automationId);
      
      if (!automation) {
        bot.sendMessage(chatId,
          `❌ Could not fetch automation \`${automationId}\`\n\nPlease verify the automation exists and try again.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      const executions = (automation.executions || []).slice(0, 10);
      const diagnosis = generateDiagnosis(automation, executions);
      
      bot.sendMessage(chatId, diagnosis.message, { parse_mode: 'Markdown' });
    }
  }
});

// Error handling
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

console.log('✅ Bot is ready to debug!');
