import 'dotenv/config';
import { twitterClient, twitterReadOnly } from './twitter.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
🐦 Claw Twitter Bot - Interactive Mode

Commands:
  post <text>     - Post a tweet
  timeline [n]    - Show timeline (default: 10)
  mentions [n]    - Show mentions (default: 10)
  reply <id> <text> - Reply to a tweet
  delete <id>     - Delete a tweet
  help            - Show this help
  quit            - Exit

Type 'help' for instructions
`);

function prompt() {
  rl.question('\n🦀> ', async (input) => {
    const parts = input.trim().split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'post':
        const tweetText = args.join(' ');
        if (!tweetText) {
          console.log('❌ Usage: post <text>');
          break;
        }
        try {
          const tweet = await twitterClient.v2.tweet(tweetText);
          console.log('✅ Posted!', `https://twitter.com/i/status/${tweet.data.id}`);
        } catch (error) {
          console.error('❌ Error:', error.message);
        }
        break;

      case 'timeline':
        const timelineCount = parseInt(args[0]) || 10;
        try {
          const tweets = await twitterClient.v2.userTimeline(timelineCount);
          console.log(`\n📖 Last ${timelineCount} tweets:`);
          tweets.data.forEach((t, i) => console.log(`${i + 1}. ${t.text}`));
        } catch (error) {
          console.error('❌ Error:', error.message);
        }
        break;

      case 'mentions':
        const mentionsCount = parseInt(args[0]) || 10;
        try {
          const tweets = await twitterReadOnly.v2.userMentionTimeline(mentionsCount);
          console.log(`\n📬 Last ${mentionsCount} mentions:`);
          tweets.data.forEach((t, i) => console.log(`${i + 1}. ${t.text}`));
        } catch (error) {
          console.error('❌ Error:', error.message);
        }
        break;

      case 'reply':
        const replyId = args[0];
        const replyText = args.slice(1).join(' ');
        if (!replyId || !replyText) {
          console.log('❌ Usage: reply <tweet_id> <text>');
          break;
        }
        try {
          const tweet = await twitterClient.v2.reply(replyText, replyId);
          console.log('✅ Reply posted!', `https://twitter.com/i/status/${tweet.data.id}`);
        } catch (error) {
          console.error('❌ Error:', error.message);
        }
        break;

      case 'delete':
        const deleteId = args[0];
        if (!deleteId) {
          console.log('❌ Usage: delete <tweet_id>');
          break;
        }
        try {
          await twitterClient.v2.deleteTweet(deleteId);
          console.log('✅ Tweet deleted');
        } catch (error) {
          console.error('❌ Error:', error.message);
        }
        break;

      case 'help':
        console.log(`
Commands:
  post <text>     - Post a tweet
  timeline [n]    - Show your timeline
  mentions [n]    - Show mentions
  reply <id> <text> - Reply to a tweet
  delete <id>     - Delete a tweet
  help            - Show this help
  quit            - Exit
        `);
        break;

      case 'quit':
      case 'exit':
        console.log('👋 Bye!');
        rl.close();
        return;

      default:
        console.log(`Unknown command: ${command}. Type 'help' for options.`);
    }

    prompt();
  });
}

prompt();
