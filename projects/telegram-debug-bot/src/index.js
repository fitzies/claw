import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Load debugging guide for AI context
const DEBUGGING_GUIDE = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'debugging-for-pulseflow.md'),
  'utf8'
);

// MiniMax client for AI-powered debugging
class MiniMaxClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.minimax.chat/v1';
  }
  
  async chat(messages) {
    try {
      const response = await fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'MiniMax-M2.1',
          messages: messages
        })
      });
      
      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (error) {
      console.error('MiniMax error:', error.message);
      return null;
    }
  }
  
  async debugAutomation(error, execution, automation) {
    const prompt = `
You are a Pulseflow debugging assistant. Use this debugging guide to help users:

${DEBUGGING_GUIDE.slice(0, 8000)}

---

USER AUTOMATION DATA:
- Automation: ${automation?.name || 'Unnamed'}
- Status: ${execution?.status || 'Unknown'}
- Error: ${error || 'No error'}
- Node: ${execution?.logs?.find(l => l.error)?.nodeId || 'Unknown'}
- Timestamp: ${execution?.startedAt || 'Unknown'}

Please provide a helpful, conversational response that:
1. Explains what happened in simple terms
2. Uses the debugging guide to give accurate technical context
3. Suggests specific fixes
4. Reminds them they can make changes themselves since their wallet is connected

Keep it friendly and concise. Use emojis sparingly.`;

    return await this.chat([
      {
        role: 'system',
        content: 'You are a helpful Pulseflow assistant. Help users debug automation issues using the debugging guide provided. Be conversational and friendly. Remind users they can make changes themselves since their wallet is connected.'
      },
      { role: 'user', content: prompt }
    ]);
  }
}

// Initialize MiniMax
const minimax = config.minimaxApiKey ? new MiniMaxClient(config.minimaxApiKey) : null;

// Initialize bot
const bot = new TelegramBot(config.telegramBotToken, { polling: true });

const PULSEFLOW_API = 'https://pulseflow.co/api/automations';

console.log('🤖 Pulseflow Debug Bot started with MiniMax AI...');

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
  cancel: {
    reply_markup: {
      keyboard: [
        [{ text: '🔙 Back to menu' }]
      ],
      resize_keyboard: true
    }
  }
};

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sessions.set(chatId, { context: [] });
  
  bot.sendMessage(chatId,
    `👋 Hey! I'm your Pulseflow assistant with AI-powered debugging!\n\nI can:\n• Check your automations and explain what's going wrong\n• Help you understand errors in simple terms\n• Answer questions about Pulseflow\n\nWhat would you like to do?`,
    keyboards.main
  );
});

// Handle messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  
  if (text?.startsWith('/')) return;
  
  const session = sessions.get(chatId) || { context: [] };
  
  // Check for automation ID
  const idMatch = text?.match(/([a-z0-9]{20,30})/);
  const urlMatch = text?.includes('pulseflow.co/automations/');
  
  // Menu options
  if (text === '🔍 Check my automation') {
    sessions.set(chatId, { ...session, awaitingAutomation: true });
    bot.sendMessage(chatId,
      `Send me your automation ID or paste a Pulseflow link.\n\nI'll analyze it and explain what's happening! 🔍`,
      keyboards.cancel
    );
    return;
  }
  
  if (text === '💬 Chat with me') {
    sessions.set(chatId, { ...session, chatting: true });
    bot.sendMessage(chatId,
      `Sure! Ask me anything about Pulseflow or your automations.\n\nI'm here to help! 💬`,
      keyboards.cancel
    );
    return;
  }
  
  if (text === '❓ Help me understand') {
    sessions.set(chatId, { ...session, chatting: true });
    bot.sendMessage(chatId,
      `What would you like to understand?\n\nI can explain:\n• How automations work\n• Common error types\n• Node configurations\n• Best practices\n\nJust ask! 😊`,
      keyboards.cancel
    );
    return;
  }
  
  if (text === '🔙 Back to menu' || text === '🔙 Back') {
    sessions.set(chatId, { context: [] });
    bot.sendMessage(chatId,
      `Back to the menu! What would you like to do?`,
      keyboards.main
    );
    return;
  }
  
  // Handle automation ID or link
  if ((idMatch || urlMatch) || session.awaitingAutomation) {
    let automationId = idMatch?.[1];
    
    if (urlMatch) {
      const match = text.match(/automations\/([a-z0-9]+)/);
      automationId = match?.[1];
    }
    
    if (automationId) {
      bot.sendMessage(chatId, `Checking automation... 🔍`);
      
      const automation = await getAutomation(automationId);
      
      if (!automation) {
        bot.sendMessage(chatId,
          `Couldn't find that automation. Check the ID and try again! 🤔`,
          keyboards.main
        );
        sessions.set(chatId, { context: [] });
        return;
      }
      
      const executions = automation.executions || [];
      const latestExecution = executions[0];
      const failedLog = latestExecution?.logs?.find(l => l.error);
      
      if (minimax) {
        // Use AI to debug
        bot.sendMessage(chatId, `Analyzing with AI... 🤖`);
        
        const aiResponse = await minimax.debugAutomation(
          failedLog?.error || latestExecution?.error,
          latestExecution,
          automation
        );
        
        if (aiResponse) {
          sessions.set(chatId, {
            context: [
              ...session.context.slice(-10),
              { role: 'user', content: `Check automation ${automationId}` },
              { role: 'assistant', content: aiResponse }
            ]
          });
          
          bot.sendMessage(chatId, aiResponse, keyboards.main);
          return;
        }
      }
      
      // Fallback to simple response
      let response = '';
      if (latestExecution?.status === 'SUCCESS') {
        response = `✅ Your automation "${automation.name}" ran successfully!`;
      } else if (failedLog) {
        response = `❌ Found an issue with "${automation.name}":\n\n${failedLog.error || 'Unknown error'}\n\nCheck your automation and try again!`;
      } else {
        response = `⚠️ Something went wrong with "${automation.name}". Try running it again!`;
      }
      
      bot.sendMessage(chatId, response, keyboards.main);
      return;
    }
  }
  
  // Chat with AI
  if (minimax && (session.chatting || session.context.length > 0)) {
    bot.sendMessage(chatId, 'Thinking... 🤔');
    
    const messages = [
      {
        role: 'system',
        content: `You are a helpful Pulseflow assistant. Use this debugging guide for accurate information:

${DEBUGGING_GUIDE.slice(0, 6000)}

Be conversational, helpful, and concise. Remind users they can make changes themselves since their wallet is connected.`
      },
      ...session.context.slice(-6),
      { role: 'user', content: text }
    ];
    
    const response = await minimax.chat(messages);
    
    if (response) {
      sessions.set(chatId, {
        ...session,
        context: [
          ...session.context,
          { role: 'user', content: text },
          { role: 'assistant', content: response }
        ].slice(-20)
      });
      
      bot.sendMessage(chatId, response, keyboards.main);
      return;
    }
  }
  
  // Default
  if (!session.awaitingAutomation) {
    bot.sendMessage(chatId, `What would you like to do?`, keyboards.main);
  }
});

// Error handling
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

console.log('✅ Bot is ready! Chat with me on Telegram!');
