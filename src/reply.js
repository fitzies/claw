import { twitterClient } from './twitter.js';

async function replyToTweet() {
  const args = process.argv.slice(2);
  const tweetId = args[0];
  const replyText = args.slice(1).join(' ');

  if (!tweetId || !replyText) {
    console.log('❌ Please provide tweet ID and reply text');
    console.log('Usage: node src/reply.js <tweet_id> "Your reply here"');
    process.exit(1);
  }

  try {
    const tweet = await twitterClient.v2.reply(replyText, tweetId);
    console.log('✅ Reply posted successfully!');
    console.log(`🔗 https://twitter.com/i/status/${tweet.data.id}`);
  } catch (error) {
    console.error('❌ Error posting reply:', error);
    process.exit(1);
  }
}

replyToTweet();
