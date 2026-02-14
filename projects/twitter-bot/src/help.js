console.log(`
🐦 Claw Twitter Bot - Available Commands

Setup:
  npm install

Commands:

  📝 Post a tweet:
     npm run tweet "Your tweet content"

  📖 Read your timeline:
     npm run timeline          (last 10 tweets)
     npm run timeline 20       (last 20 tweets)

  💬 Read mentions:
     npm run timeline mentions 10

  ↩️ Reply to a tweet:
     node src/reply.js <tweet_id> "Your reply"

  🗑️ Delete a tweet:
     node src/delete.js <tweet_id>

Examples:
  npm run tweet "Hello from Claw! 🦀"
  npm run timeline 5
  node src/reply.js 1234567890 "Great tweet!"
  node src/delete.js 1234567890

🔗 API Documentation:
   https://developer.twitter.com/en/docs/twitter-api
`);
