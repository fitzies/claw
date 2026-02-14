/**
 * Get Non-Paying Users
 * 
 * Outputs a list of emails for users who haven't paid.
 * Use this output to send email campaigns via Resend.
 */

import { clerkClient } from '@clerk/clerk-sdk-node';
import Stripe from 'stripe';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Initialize
const stripe = new Stripe(config.stripeSecretKey);
process.env.CLERK_SECRET_KEY = config.clerkSecretKey;
const clerk = clerkClient;

async function getNonPayingUsers() {
  console.log('🔍 Finding non-paying users...\n');
  
  // Get Stripe subscribers
  const subscribers = new Set();
  
  try {
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      status: 'active'
    });
    
    subscriptions.data.forEach(sub => {
      if (sub.customer?.email) {
        subscribers.add(sub.customer.email.toLowerCase());
      }
    });
  } catch (error) {
    console.error('Stripe error:', error.message);
  }
  
  // Get Clerk users
  let clerkUsers = [];
  try {
    clerkUsers = await clerk.users.getUserList({ limit: 100 });
  } catch (error) {
    console.error('Clerk error:', error.message);
  }
  
  // Find non-paying
  const nonPaying = clerkUsers.filter(user => {
    const email = user.emailAddresses?.[0]?.emailAddress?.toLowerCase();
    return email && !subscribers.has(email);
  });
  
  console.log(`📊 Total Clerk users: ${clerkUsers.length}`);
  console.log(`💰 Paying users: ${subscribers.size}`);
  console.log(`🚫 Non-paying users: ${nonPaying.length}\n`);
  
  // Output as JSON for programmatic use
  const output = nonPaying.map(u => ({
    id: u.id,
    email: u.emailAddresses?.[0]?.emailAddress,
    firstName: u.firstName,
    lastName: u.lastName
  }));
  
  fs.writeFileSync('./nonpaying.json', JSON.stringify(output, null, 2));
  console.log('💾 Saved to nonpaying.json');
  
  // Also output as CSV
  const csv = 'id,email,firstName,lastName\n' + 
    output.map(u => `${u.id},${u.email},${u.firstName || ''},${u.lastName || ''}`).join('\n');
  fs.writeFileSync('./nonpaying.csv', csv);
  console.log('💾 Saved to nonpaying.csv');
  
  // Simple list
  console.log('\n📧 Email list:\n');
  output.forEach(u => {
    console.log(u.email);
  });
  
  return output;
}

getNonPayingUsers().catch(console.error);
