import { twitterReadOnly, twitterClient } from './twitter.js';

async function readTimeline() {
  const args = process.argv.slice(2);
  const type = args[0] || 'timeline';
  const count = parseInt(args[1]) || 10;

  try {
    if (type === 'mentions') {
      const tweets = await twitterReadOnly.v2.userMentionTimeline(count);
      console.log(`📬 Last ${count} mentions:\n`);
      tweets.data.forEach((tweet, i) => {
        console.log(`${i + 1}. ${tweet.text}`);
        console.log(`   ID: ${tweet.id}`);
        console.log('');
      });
    } else {
      const tweets = await twitterClient.v2.userTimeline(count);
      console.log(`📖 Last ${count} tweets:\n`);
      tweets.data.forEach((tweet, i) => {
        console.log(`${i + 1}. ${tweet.text}`);
        console.log(`   ID: ${tweet.id}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('❌ Error fetching timeline:', error);
    process.exit(1);
  }
}

readTimeline();
