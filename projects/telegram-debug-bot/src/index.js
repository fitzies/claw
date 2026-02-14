import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import { clerkClient } from '@clerk/clerk-sdk-node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Initialize Stripe
let stripe = null;
if (config.stripeSecretKey) {
  stripe = new Stripe(config.stripeSecretKey);
}

// Initialize Clerk client
let clerk = null;
if (config.clerkSecretKey) {
  process.env.CLERK_SECRET_KEY = config.clerkSecretKey;
  clerk = clerkClient;
}

// Initialize bot
const bot = new TelegramBot(config.telegramBotToken, { polling: true });

const PULSEFLOW_API = 'https://pulseflow.co/api/automations';

console.log('🤖 Pulseflow Debug Bot started...');

// User sessions for conversational flow
const userSessions = new Map();

// Helper: Fetch automation data
async function getAutomation(automationId) {
  try {
    const response = await fetch(`${PULSEFLOW_API}/${automationId}?password=${config.apiPassword}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching automation:', error.message);
    return null;
  }
}

// Helper: Analyze execution logs - conversational style
function analyzeExecution(execution, automation) {
  const logs = execution.logs || [];
  const failedLog = logs.find(log => log.error !== null);
  
  if (!failedLog) {
    if (execution.status === 'SUCCESS') {
      return {
        greeting: "Good news! 🎉",
        message: `Your automation "${automation.name || 'Unnamed'}" ran successfully!`,
        details: "Everything looks good with your last run.",
        footer: "Anything else I can help with?"
      };
    }
    return {
      greeting: "Hmm...",
      message: "I see the execution exists but I can't see any details about what happened.",
      details: "This might be a temporary issue. Want me to try again later?",
      footer: null
    };
  }
  
  const failedNode = execution.definition?.nodes?.find(n => n.id === failedLog.nodeId);
  const errorOutput = failedLog.output || {};
  const errorMessage = failedLog.error || '';
  
  // Determine issue type and response
  let response = { greeting: "Found an issue!", message: "", details: "", footer: "Want me to explain more?" };
  
  if (errorMessage.match(/504|502|503|ETIMEDOUT|ECONNREFUSED|rate limit|429/i)) {
    response.greeting = "Network hiccup! 🌐";
    response.message = "There was a temporary network issue when your automation tried to run.";
    response.details = "This is usually just a short delay. Try running it again in a moment.";
    response.footer = "It should work next time!";
  }
  else if (errorMessage.match(/insufficient funds/i)) {
    response.greeting = "Wallet issue! 💰";
    response.message = "Your wallet doesn't have enough balance for this transaction.";
    response.details = "Either add more funds to your wallet, or reduce the amount in your automation.";
    response.footer = "Your wallet is connected, so you can check and fix this yourself!";
  }
  else if (errorMessage.match(/INSUFFICIENT_OUTPUT_AMOUNT|slippage/i)) {
    response.greeting = "Slippage issue! 📉";
    response.message = "The price moved too much between when the trade was planned and executed.";
    response.details = "Try increasing your slippage tolerance (to 2-3%) or reduce the trade size.";
    response.footer = "Can adjust this in your swap node settings!";
  }
  else if (errorMessage.match(/execution reverted/i)) {
    response.greeting = "Transaction reverted! ⚠️";
    response.message = "The blockchain rejected this transaction.";
    response.details = errorOutput.revertReason 
      ? `Reason: ${errorOutput.revertReason}`
      : "Check your parameters - something might be configured wrong.";
    response.footer = "Review your automation settings and try again!";
  }
  else if (errorMessage.match(/Variable.*not found/i)) {
    response.greeting = "Missing variable! 🔧";
    response.message = `Your automation is trying to use a variable called "${errorMessage.match(/Variable '(\w+)'/)?.[1]}" but it hasn't been set yet.`;
    response.details = "Add a Variable node before the node that's failing to set this value.";
    response.footer = "Since your wallet is connected, you can add this yourself!";
  }
  else if (errorMessage.match(/Previous node output|no previous node output/i)) {
    response.greeting = "Data missing! 📊";
    response.message = "The automation is trying to use data from a previous step that doesn't exist or didn't produce output.";
    response.details = "Make sure you're using this after a node that returns data (like checkBalance).";
    response.footer = "Adjust the order of your nodes!";
  }
  else if (errorMessage.match(/For-Each|forEach/i)) {
    response.greeting = "For-Each issue! 🔄";
    response.message = "Something's off with your For-Each loop.";
    response.details = errorMessage;
    response.footer = "Since your wallet is connected, check the For-Each configuration yourself!";
  }
  else {
    response.greeting = "Something went wrong! ❌";
    response.message = errorOutput.userMessage || "An error occurred during execution.";
    response.details = errorMessage.slice(0, 200);
    response.footer = null;
  }
  
  // Add node info
  if (failedNode) {
    response.nodeType = failedNode.type;
    response.nodeNotes = failedNode.data?.notes;
  }
  
  return response;
}

// Helper: Generate conversational response
function generateResponse(automation, executions) {
  const latestExecution = executions[0];
  if (!latestExecution) {
    return {
      text: "I couldn't find any executions for this automation. Has it been run yet? 🤔",
      quickReplies: null
    };
  }
  
  const analysis = analyzeExecution(latestExecution, automation);
  
  let text = `${analysis.greeting}\n\n`;
  text += `${analysis.message}\n\n`;
  
  if (analysis.details) {
    text += `${analysis.details}\n\n`;
  }
  
  if (analysis.nodeType) {
    text += `(Failed at: ${analysis.nodeType} node`;
    if (analysis.nodeNotes) text += ` — "${analysis.nodeNotes}"`;
    text += `)\n\n`;
  }
  
  // Execution history
  text += `📜 *Recent runs*:\n`;
  executions.slice(0, 5).forEach(ex => {
    const emoji = ex.status === 'SUCCESS' ? '✅' : ex.status === 'FAILED' ? '❌' : '⏸️';
    text += `${emoji} ${new Date(ex.startedAt).toLocaleString()}\n`;
  });
  
  if (analysis.footer) {
    text += `\n${analysis.footer}`;
  }
  
  // Quick replies for follow-up
  const quickReplies = [
    { text: "What does this mean?", callback_data: "explain" },
    { text: "Run again", callback_data: "retry" },
    { text: "Help me fix it", callback_data: "help" }
  ];
  
  return { text, quickReplies };
}

// Start message
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userSessions.delete(chatId);
  
  bot.sendMessage(chatId, 
    `👋 Hey! I'm your Pulseflow assistant!\n\nI can help you debug automation issues. Just send me your automation ID (or paste a link) and I'll check what's going on.\n\nTry it out!`
  );
});

// Help command
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 *How I can help:*\n\n• Send me an automation ID (like \`cmkwhwr4j0001jp0412bdp8zw\`)\n• Or paste a Pulseflow URL\n• I'll analyze your recent runs and explain any issues\n\n*Note:* Since your wallet is connected, I recommend reviewing changes yourself!\n\nAnything else?`,
    { parse_mode: 'Markdown' }
  );
});

// Admin: List non-paying users
bot.onText(/\/nonpaying/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Checking...');
  
  // This would need proper admin auth in production
  bot.sendMessage(chatId, "Admin features coming soon!");
});

// Handle automation IDs - conversational
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  
  if (text?.startsWith('/')) return;
  
  // Check for automation ID
  const idMatch = text?.match(/([a-z0-9]{20,30})/);
  
  if (idMatch) {
    const automationId = idMatch[1];
    
    bot.sendMessage(chatId, `Let me check that automation... 🔍`);
    
    const automation = await getAutomation(automationId);
    
    if (!automation) {
      bot.sendMessage(chatId,
        `Hmm, I couldn't find an automation with ID \`${automationId}\`\n\nMake sure it exists and you have the right ID! 🤔`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const executions = (automation.executions || []).slice(0, 10);
    const { text: responseText, quickReplies } = generateResponse(automation, executions);
    
    // Send with inline keyboard for quick replies
    if (quickReplies) {
      bot.sendMessage(chatId, responseText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            quickReplies.slice(0, 2).map(q => [{ text: q.text, callback_data: q.callback_data }]),
            quickReplies.slice(2).map(q => [{ text: q.text, callback_data: q.callback_data }])
          ].filter(row => row.length > 0)
        }
      });
    } else {
      bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
    }
    
    // Store session
    userSessions.set(chatId, { automationId, step: 'after_diagnosis' });
    return;
  }
  
  // Handle URLs
  if (text?.includes('pulseflow.co/automations/')) {
    const urlMatch = text.match(/automations\/([a-z0-9]+)/);
    if (urlMatch) {
      const automationId = urlMatch[1];
      bot.sendMessage(chatId, `Checking that automation... 🔍`);
      
      const automation = await getAutomation(automationId);
      
      if (!automation) {
        bot.sendMessage(chatId, `Couldn't find that automation. Double-check the link? 🤔`);
        return;
      }
      
      const executions = (automation.executions || []).slice(0, 10);
      const { text: responseText, quickReplies } = generateResponse(automation, executions);
      
      if (quickReplies) {
        bot.sendMessage(chatId, responseText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              quickReplies.slice(0, 2).map(q => [{ text: q.text, callback_data: q.callback_data }]),
              quickReplies.slice(2).map(q => [{ text: q.text, callback_data: q.callback_data }])
            ].filter(row => row.length > 0)
          }
        });
      } else {
        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
      }
    }
  }
});

// Handle callback queries for inline keyboard
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  bot.answerCallbackQuery(callbackQuery.id);
  
  const session = userSessions.get(chatId);
  
  if (data === 'explain') {
    bot.sendMessage(chatId,
      `Here's what happened:\n\nWhen your automation runs, each node executes in sequence. If any node fails, the whole run stops.\n\nI found a failure at a specific node and can explain what went wrong and how to fix it!\n\nWould you like me to walk you through it?`
    );
  }
  else if (data === 'retry') {
    bot.sendMessage(chatId,
      `You can retry by:\n\n1. Opening the automation in Pulseflow\n2. Clicking "Run Now"\n\nOr just wait for the next scheduled run! 🔄`
    );
  }
  else if (data === 'help') {
    bot.sendMessage(chatId,
      `Since your wallet is connected to Pulseflow, you can make changes directly!\n\n*Tips:*\n• Check the failed node's settings\n• Make sure all required fields are filled\n• Verify wallet has enough balance\n\nNeed more specific help? Just ask! 😊`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Error handling
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

console.log('✅ Bot is ready! Chat with me on Telegram!');
