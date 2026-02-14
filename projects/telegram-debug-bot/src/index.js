import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// MiniMax client for conversational AI
class MiniMaxClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.minimax.chat/v1';
  }
  
  async chat(message, context = []) {
    try {
      const response = await fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'MiniMax-M2.1',
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant for Pulseflow, a no-code automation platform for PulseChain. 

Your job is to:
1. Help users debug their automation issues
2. Explain blockchain and automation concepts in simple terms
3. Be friendly and conversational
4. Be honest - if you don't know something, say so

Key points to remember:
- Pulseflow uses a visual node-based editor
- Users connect wallets and create automation flows
- Common issues: insufficient funds, slippage, network errors, variable configuration
- Always remind users they can make changes themselves since their wallet is connected

Keep responses concise and helpful.`
            },
            ...context,
            { role: 'user', content: message }
          ]
        })
      });
      
      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'Sorry, I had trouble understanding that.';
    } catch (error) {
      console.error('MiniMax error:', error.message);
      return null;
    }
  }
}

// Initialize MiniMax
const minimax = config.minimaxApiKey ? new MiniMaxClient(config.minimaxApiKey) : null;

// Initialize bot
const bot = new TelegramBot(config.telegramBotToken, { polling: true });

const PULSEFLOW_API = 'https://pulseflow.co/api/automations';

console.log('🤖 Pulseflow Bot started...');

// Conversation states
const states = {
  NONE: 'none',
  AWAITING_AUTOMATION: 'awaiting_automation',
  CHATTING: 'chatting'
};

// User sessions
const sessions = new Map();

// Helper: Fetch automation data
async function getAutomation(automationId) {
  try {
    const response = await fetch(`${PULSEFLOW_API}/${automationId}?password=${config.apiPassword}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

// Helper: Analyze execution for context
function analyzeExecution(automation, executions) {
  const latestExecution = executions[0];
  if (!latestExecution) return null;
  
  const failedLog = latestExecution.logs?.find(l => l.error);
  const errorMessage = failedLog?.error || '';
  const errorOutput = failedLog?.output || {};
  
  let summary = '';
  
  if (latestExecution.status === 'SUCCESS') {
    summary = 'The automation ran successfully!';
  } else if (errorMessage.match(/insufficient funds/i)) {
    summary = 'The wallet has insufficient funds for this transaction.';
  } else if (errorMessage.match(/slippage|INSUFFICIENT_OUTPUT/i)) {
    summary = 'There was a slippage issue - the price moved too much between planning and execution.';
  } else if (errorMessage.match(/network|timeout/i)) {
    summary = 'There was a temporary network issue.';
  } else if (errorMessage.match(/Variable/i)) {
    summary = 'A variable is being used but hasn\'t been set yet.';
  } else if (errorMessage.match(/reverted/i)) {
    summary = 'The blockchain rejected the transaction.';
  } else if (errorMessage) {
    summary = `An error occurred: ${errorMessage.slice(0, 100)}`;
  } else {
    summary = 'The automation encountered an issue.';
  }
  
  return {
    status: latestExecution.status,
    summary,
    failedNode: failedLog?.nodeId,
    timestamp: latestExecution.startedAt
  };
}

// Keyboard layouts
const keyboards = {
  main: {
    reply_markup: {
      keyboard: [
        [{ text: '🔍 Check my automation' }],
        [{ text: '💬 Chat with me' }],
        [{ text: '❓ Help me understand' }]
      ],
      resize_keyboard: true
    }
  },
  yesNo: {
    reply_markup: {
      keyboard: [
        [{ text: '✅ Yes' }, { text: '❌ No' }]
      ],
      resize_keyboard: true
    }
  }
};

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sessions.set(chatId, { state: states.NONE, context: [] });
  
  bot.sendMessage(chatId,
    `👋 Hey! I'm your Pulseflow assistant!\n\nI can help you with:\n• Debugging automation issues\n• Explaining what's happening\n• Answering questions about Pulseflow\n\nWhat would you like to do?`,
    keyboards.main
  );
});

// Help command
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 *How I can help:*\n\n• Send me an automation ID to check\n• Ask me questions about Pulseflow\n• Chat about any issues you're having\n\nJust type naturally and I'll help out!`,
    { parse_mode: 'Markdown', ...keyboards.main }
  );
});

// Handle messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  
  if (text?.startsWith('/')) return;
  
  const session = sessions.get(chatId) || { state: states.NONE, context: [] };
  
  // Check for automation ID
  const idMatch = text?.match(/([a-z0-9]{20,30})/);
  const urlMatch = text?.includes('pulseflow.co/automations/');
  
  // Handle menu options
  if (text === '🔍 Check my automation') {
    sessions.set(chatId, { ...session, state: states.AWAITING_AUTOMATION });
    bot.sendMessage(chatId,
      `Send me your automation ID (or paste a link).\n\nI'll check what's going on!`,
      keyboards.yesNo
    );
    return;
  }
  
  if (text === '💬 Chat with me') {
    sessions.set(chatId, { ...session, state: states.CHATTING });
    bot.sendMessage(chatId,
      `Sure! Ask me anything about Pulseflow or your automations.\n\nI'm here to help! 💬`,
      keyboards.main
    );
    return;
  }
  
  if (text === '❓ Help me understand') {
    sessions.set(chatId, { ...session, state: states.CHATTING });
    bot.sendMessage(chatId,
      `What would you like to understand better?\n\nI can explain:\n• How automations work\n• Common error types\n• Best practices\n\nJust ask! 😊`,
      keyboards.main
    );
    return;
  }
  
  // Handle automation ID
  if (idMatch || urlMatch) {
    let automationId = idMatch?.[1];
    
    if (urlMatch) {
      const match = text.match(/automations\/([a-z0-9]+)/);
      automationId = match?.[1];
    }
    
    if (automationId) {
      bot.sendMessage(chatId, `Checking that automation... 🔍`);
      
      const automation = await getAutomation(automationId);
      
      if (!automation) {
        bot.sendMessage(chatId,
          `Couldn't find that automation. Check the ID and try again! 🤔`,
          keyboards.main
        );
        sessions.set(chatId, { ...session, state: states.NONE });
        return;
      }
      
      const executions = automation.executions || [];
      const analysis = analyzeExecution(automation, executions);
      
      // Store for context
      sessions.set(chatId, {
        state: states.CHATTING,
        context: [
          ...session.context,
          { role: 'user', content: `Checking automation "${automation.name}" (${automationId})` },
          { role: 'assistant', content: analysis?.summary || 'No execution data found.' }
        ],
        automation: { name: automation.name, executions }
      });
      
      let response = '';
      if (analysis) {
        response = `Here's what I found:\n\n${analysis.summary}\n\n`;
        if (analysis.status === 'SUCCESS') {
          response += `✅ Last run was successful!`;
        } else {
          response += `❌ The last run had an issue.`;
        }
      } else {
        response = `I found your automation but no recent runs.`;
      }
      
      response += `\n\nWould you like me to explain more or help you fix it?`;
      
      bot.sendMessage(chatId, response, keyboards.main);
    }
    return;
  }
  
  // Use MiniMax for chat responses
  if (minimax && (session.state === states.CHATTING || session.context.length > 0)) {
    bot.sendMessage(chatId, 'Thinking... 🤔');
    
    const response = await minimax.chat(text, session.context.slice(-10));
    
    if (response) {
      sessions.set(chatId, {
        ...session,
        context: [
          ...session.context,
          { role: 'user', content: text },
          { role: 'assistant', content: response }
        ].slice(-20) // Keep last 20 messages
      });
      
      bot.sendMessage(chatId, response, keyboards.main);
      return;
    }
  }
  
  // Default fallback
  if (session.state === states.NONE) {
    bot.sendMessage(chatId, `What would you like to do?`, keyboards.main);
  }
});

// Error handling
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

console.log('✅ Bot is ready! Chat with me on Telegram!');
