import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Initialize bot
const bot = new TelegramBot(config.telegramBotToken, { polling: true });

const PULSEFLOW_API = 'https://pulseflow.co/api/automations';

console.log('🤖 Pulseflow Debug Bot started...');

// Conversation states
const states = {
  NONE: 'none',
  AWAITING_AUTOMATION: 'awaiting_automation',
  AWAITING_EXPLANATION: 'awaiting_explanation',
  AWAITING_HELP: 'awaiting_help',
  AWAITING_RETRY: 'awaiting_retry',
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

// Helper: Analyze and explain issue
function explainIssue(failedLog, automation) {
  const errorMessage = failedLog?.error || '';
  const errorOutput = failedLog?.output || {};
  const failedNode = automation?.definition?.nodes?.find(n => n.id === failedLog?.nodeId);
  
  const explanations = {
    network: {
      emoji: '🌐',
      title: 'Network hiccup',
      message: 'There was a temporary network issue. This usually resolves itself in a few minutes.',
      question: 'Want me to explain more about network errors?'
    },
    insufficient_funds: {
      emoji: '💰',
      title: 'Not enough balance',
      message: 'Your wallet doesn\'t have enough PLS to run this automation.',
      question: 'Do you need help checking your wallet balance?'
    },
    slippage: {
      emoji: '📉',
      title: 'Price moved too fast',
      message: 'The price changed between when the trade was planned and when it executed.',
      question: 'Want me to explain how to adjust slippage settings?'
    },
    revert: {
      emoji: '⚠️',
      title: 'Transaction rejected',
      message: 'The blockchain rejected this transaction. Something in the parameters is wrong.',
      question: 'Should I explain what might be wrong with the configuration?'
    },
    variable: {
      emoji: '🔧',
      title: 'Missing variable',
      message: 'A variable is being used but hasn\'t been set yet.',
      question: 'Do you need help understanding variables?'
    },
    previous_output: {
      emoji: '📊',
      title: 'Missing data',
      message: 'The automation is trying to use data from a previous step that doesn\'t exist.',
      question: 'Want me to explain how nodes pass data to each other?'
    },
    foreach: {
      emoji: '🔄',
      title: 'For-Each issue',
      message: 'There\'s something wrong with your For-Each loop setup.',
      question: 'Do you need help with For-Each configuration?'
    },
    success: {
      emoji: '🎉',
      title: 'All good!',
      message: 'Your last run was successful!',
      question: null
    }
  };
  
  // Detect issue type
  if (errorMessage.match(/504|502|503|ETIMEDOUT|ECONNREFUSED|rate limit|429/i)) {
    return explanations.network;
  }
  if (errorMessage.match(/insufficient funds/i)) {
    return explanations.insufficient_funds;
  }
  if (errorMessage.match(/INSUFFICIENT_OUTPUT_AMOUNT|slippage/i)) {
    return explanations.slippage;
  }
  if (errorMessage.match(/execution reverted|CALL_EXCEPTION/i)) {
    return explanations.revert;
  }
  if (errorMessage.match(/Variable.*not found/i)) {
    return explanations.variable;
  }
  if (errorMessage.match(/Previous node output|no previous node output/i)) {
    return explanations.previous_output;
  }
  if (errorMessage.match(/For-Each|forEach/i)) {
    return explanations.foreach;
  }
  
  return explanations.success;
}

// Keyboard layouts
const keyboards = {
  main: {
    reply_markup: {
      keyboard: [
        [{ text: '🔍 Check my automation' }],
        [{ text: '❓ What does this mean?' }],
        [{ text: '🔄 Run my automation' }]
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
  },
  explanation: {
    reply_markup: {
      keyboard: [
        [{ text: 'Yes, explain more' }],
        [{ text: 'No, I\'m good' }]
      ],
      resize_keyboard: true
    }
  }
};

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sessions.set(chatId, { state: states.NONE });
  
  bot.sendMessage(chatId,
    `👋 Hey! I'm your Pulseflow assistant!\n\nI can help you debug automation issues and explain what's happening.\n\nWhat would you like to do?`,
    keyboards.main
  );
});

// Handle main menu options
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  
  if (text?.startsWith('/')) return; // Skip commands
  
  const session = sessions.get(chatId) || { state: states.NONE };
  
  // Handle automation ID input
  const idMatch = text?.match(/([a-z0-9]{20,30})/) || text?.includes('pulseflow.co/automations/');
  
  if (idMatch || text?.includes('/automations/')) {
    let automationId;
    if (text.includes('/automations/')) {
      const match = text.match(/automations\/([a-z0-9]+)/);
      automationId = match?.[1];
    } else {
      automationId = idMatch[1];
    }
    
    if (automationId) {
      bot.sendMessage(chatId, `Checking that automation... 🔍`);
      
      const automation = await getAutomation(automationId);
      
      if (!automation) {
        bot.sendMessage(chatId,
          `Couldn't find that automation. Make sure the ID is correct! 🤔\n\nTry again?`,
          keyboards.main
        );
        sessions.set(chatId, { state: states.NONE });
        return;
      }
      
      const executions = automation.executions || [];
      const latestExecution = executions[0];
      
      if (!latestExecution) {
        bot.sendMessage(chatId,
          `I found the automation but no executions yet!\n\nHave you run it at least once?`,
          keyboards.main
        );
        sessions.set(chatId, { state: states.NONE });
        return;
      }
      
      const explanation = explainIssue(
        latestExecution.logs?.find(l => l.error),
        automation
      );
      
      // Store session with automation
      sessions.set(chatId, {
        state: states.AWAITING_EXPLANATION,
        automationId,
        automation,
        execution: latestExecution
      });
      
      bot.sendMessage(chatId,
        `${explanation.emoji} *${explanation.title}*\n\n${explanation.message}`,
        { parse_mode: 'Markdown', ...keyboards.explanation }
      );
    }
    return;
  }
  
  // Handle "Check my automation"
  if (text === '🔍 Check my automation') {
    sessions.set(chatId, { state: states.AWAITING_AUTOMATION });
    bot.sendMessage(chatId,
      `Send me your automation ID (or paste a Pulseflow link).\n\nI'll check what's going on!`,
      keyboards.yesNo
    );
    return;
  }
  
  // Handle "What does this mean?"
  if (text === '❓ What does this mean?') {
    if (session.automation) {
      const explanation = explainIssue(
        session.execution?.logs?.find(l => l.error),
        session.automation
      );
      
      sessions.set(chatId, { ...session, state: states.AWAITING_HELP });
      bot.sendMessage(chatId,
        `${explanation.message}\n\n${explanation.question || 'Anything else?'}`,
        keyboards.explanation
      );
    } else {
      bot.sendMessage(chatId,
        `I'd be happy to explain! First, send me your automation ID so I can give you a specific answer.`,
        keyboards.main
      );
    }
    return;
  }
  
  // Handle "Run my automation"
  if (text === '🔄 Run my automation') {
    sessions.set(chatId, { ...session, state: states.AWAITING_RETRY });
    bot.sendMessage(chatId,
      `To run your automation:\n\n1. Open Pulseflow\n2. Find your automation\n3. Click "Run Now"\n\nWant me to wait while you run it and check again?`,
      keyboards.yesNo
    );
    return;
  }
  
  // Handle Yes/No responses based on state
  if (text === '✅ Yes' || text === '❌ No') {
    switch (session.state) {
      case states.AWAITING_AUTOMATION:
        if (text === '✅ Yes') {
          bot.sendMessage(chatId,
            `Great! Send me your automation ID (or paste a link).`,
            keyboards.yesNo
          );
        } else {
          bot.sendMessage(chatId, `No problem! What else can I help with?`, keyboards.main);
          sessions.set(chatId, { state: states.NONE });
        }
        break;
        
      case states.AWAITING_EXPLANATION:
        if (text === '✅ Yes' && session.explanation) {
          bot.sendMessage(chatId,
            `Here's a detailed explanation:\n\n${session.explanation.detailedHelp || session.explanation.message}\n\nAnything else?`,
            keyboards.main
          );
        } else {
          bot.sendMessage(chatId, `Alright! Anything else I can help with?`, keyboards.main);
          sessions.set(chatId, { state: states.NONE });
        }
        break;
        
      case states.AWAITING_HELP:
        if (text === '✅ Yes') {
          bot.sendMessage(chatId,
            `Here's what you can do:\n\nSince your wallet is connected to Pulseflow:\n• Open the automation editor\n• Check the node that failed\n• Fix the configuration\n• Run it again\n\nNeed more specific guidance?`,
            keyboards.main
          );
        } else {
          bot.sendMessage(chatId, `Got it! Let me know if you need anything else.`, keyboards.main);
        }
        sessions.set(chatId, { ...session, state: states.NONE });
        break;
        
      case states.AWAITING_RETRY:
        if (text === '✅ Yes') {
          bot.sendMessage(chatId,
            `Sounds good! Run your automation, then send me the ID again when you're done.\n\nI'll check if it worked! 🎯`,
            keyboards.main
          );
        } else {
          bot.sendMessage(chatId, `No worries! What else can I help with?`, keyboards.main);
        }
        sessions.set(chatId, { state: states.NONE });
        break;
        
      default:
        bot.sendMessage(chatId, `What would you like to do?`, keyboards.main);
        sessions.set(chatId, { state: states.NONE });
    }
    return;
  }
  
  // Default response
  if (session.state === states.NONE) {
    bot.sendMessage(chatId, `What would you like to do?`, keyboards.main);
  }
});

// Error handling
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

console.log('✅ Bot is ready! Chat with me on Telegram!');
