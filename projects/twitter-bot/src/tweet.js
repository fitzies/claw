import { twitterClient } from './twitter.js';

async function postTweet() {
  const args = process.argv.slice(2);
  const text = args.join(' ');

  if (!text) {
    console.log('❌ Please provide tweet text');
    console.log('Usage: npm run tweet "Your tweet here"');
    process.exit(1);
  }

  try {
    const tweet = await twitterClient.v2.tweet(text);
    console.log('✅ Tweet posted successfully!');
    console.log(`🔗 https://twitter.com/i/status/${tweet.data.id}`);
  } catch (error) {
    console.error('❌ Error posting tweet:', error);
    process.exit(1);
  }
}

postTweet();
