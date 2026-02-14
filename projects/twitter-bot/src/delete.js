import { twitterClient } from './twitter.js';

async function deleteTweet() {
  const args = process.argv.slice(2);
  const tweetId = args[0];

  if (!tweetId) {
    console.log('❌ Please provide tweet ID');
    console.log('Usage: node src/delete.js <tweet_id>');
    process.exit(1);
  }

  try {
    await twitterClient.v2.deleteTweet(tweetId);
    console.log('✅ Tweet deleted successfully!');
  } catch (error) {
    console.error('❌ Error deleting tweet:', error);
    process.exit(1);
  }
}

deleteTweet();
