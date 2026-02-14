import 'dotenv/config';
import { TwitterApi } from 'twitter-api-v2';

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_CLIENT_ID,
  appSecret: process.env.TWITTER_CLIENT_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const twitterReadOnly = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

export { twitterClient, twitterReadOnly };
export default twitterClient;
