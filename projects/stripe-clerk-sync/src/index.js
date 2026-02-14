/**
 * Stripe + Clerk Sync
 * 
 * This script syncs Stripe subscriptions with Clerk users
 * to identify which users have paid and which haven't.
 */

import Stripe from 'stripe';
import { clerkClient } from '@clerk/clerk-sdk-node';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Initialize Stripe
const stripe = new Stripe(config.stripeSecretKey);

// Initialize Clerk
process.env.CLERK_SECRET_KEY = config.clerkSecretKey;
const clerk = clerkClient;

async function getStripeSubscribers() {
  console.log('📊 Fetching Stripe subscribers...');
  
  const subscribers = new Map(); // email -> customer data
  
  try {
    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      status: 'active',
      expand: ['data.customer']
    });
    
    subscriptions.data.forEach(sub => {
      const customer = sub.customer;
      if (customer.email) {
        subscribers.set(customer.email.toLowerCase(), {
          customerId: customer.id,
          subscriptionId: sub.id,
          status: sub.status,
          plan: sub.items.data[0]?.price.product,
          currentPeriodEnd: new Date(sub.current_period_end * 1000)
        });
      }
    });
    
    console.log(`✅ Found ${subscribers.size} active subscribers`);
    return subscribers;
  } catch (error) {
    console.error('❌ Error fetching Stripe subscriptions:', error.message);
    return subscribers;
  }
}

async function getClerkUsers() {
  console.log('👤 Fetching Clerk users...');
  
  try {
    const users = await clerk.users.getUserList({ limit: 100 });
    console.log(`✅ Found ${users.length} Clerk users`);
    return users;
  } catch (error) {
    console.error('❌ Error fetching Clerk users:', error.message);
    return [];
  }
}

async function syncUsers() {
  console.log('\n🔄 Syncing Stripe + Clerk...\n');
  
  const subscribers = await getStripeSubscribers();
  const clerkUsers = await getClerkUsers();
  
  const results = {
    paying: [],
    nonPaying: [],
    unknown: []
  };
  
  clerkUsers.forEach(user => {
    const email = user.emailAddresses?.[0]?.emailAddress?.toLowerCase();
    
    if (!email) {
      results.unknown.push({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        reason: 'No email'
      });
      return;
    }
    
    if (subscribers.has(email)) {
      results.paying.push({
        id: user.id,
        email,
        stripeCustomerId: subscribers.get(email).customerId,
        subscriptionId: subscribers.get(email).subscriptionId,
        currentPeriodEnd: subscribers.get(email).currentPeriodEnd
      });
    } else {
      results.nonPaying.push({
        id: user.id,
        email,
        firstName: user.firstName,
        lastName: user.lastName
      });
    }
  });
  
  console.log('\n📈 Results:');
  console.log(`   Paying users: ${results.paying.length}`);
  console.log(`   Non-paying users: ${results.nonPaying.length}`);
  console.log(`   Unknown: ${results.unknown.length}`);
  
  // Save results
  fs.writeFileSync('./results.json', JSON.stringify(results, null, 2));
  console.log('\n💾 Results saved to results.json');
  
  // Return non-paying users for email campaigns
  return results.nonPaying;
}

// Run if called directly
syncUsers().catch(console.error);

export { syncUsers, getStripeSubscribers, getClerkUsers };
