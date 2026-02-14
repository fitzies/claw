# Pulseflow Tasks

## Ongoing Tasks

### 1. Telegram Debug Bot
- [x] Bot running and responding
- [x] Conversational flow with Yes/No options
- [ ] Add Clerk integration for user lookup
- [ ] Add Stripe integration to check subscription status

**To add Clerk/Stripe:**
```
config.json:
{
  "clerkSecretKey": "...",
  "stripeSecretKey": "..."
}
```

### 2. X/Twitter Bot
- [ ] Fix OAuth tokens (currently invalid)
- [ ] Post every 3 hours
- [ ] Create tweet rotation with different content

**Tweets to rotate:**
1. DCA automation
2. Portfolio rebalancing
3. Liquidity management
4. No-code benefit
5. Time savings

### 3. Email Automation
- [ ] Add Clerk/Stripe integration to identify non-paying users
- [ ] Create email template variations
- [ ] Set up cron for recurring campaigns

### 4. Daily Updates (OpenClaw)
- [ ] Working - runs at 9:30am/9:30pm SGT
- [ ] GitHub trending + X API

---

## Next Actions

1. **Fix X tokens** - James needs to regenerate OAuth 1.0a tokens in X Developer Portal
2. **Add Clerk/Stripe keys** - Add to `telegram-debug-bot/config.json`
3. **Commit bot changes** - Push conversational bot update
4. **Set up X cron** - Tweet every 3 hours once tokens work
