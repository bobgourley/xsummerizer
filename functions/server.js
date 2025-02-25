const { MongoClient } = require('mongodb');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

const CALLBACK_URL = 'https://xsummerizer.com/api/auth/callback';

exports.handler = async (event, context) => {
  console.log('Function started:', new Date().toISOString());
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db('tweet_narrative');
    const usersCollection = db.collection('users');

    const path = event.path;
    const method = event.httpMethod;

    // Handle /api/login
    if (path === '/api/login' && method === 'GET') {
      console.log('Handling /api/login');
      const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${process.env.X_CLIENT_ID}&redirect_uri=${CALLBACK_URL}&scope=tweet.read%20users.read&state=state&code_challenge=challenge&code_challenge_method=plain`;
      console.log('Redirecting to X:', authUrl);
      return {
        statusCode: 302,
        headers: { Location: authUrl },
        body: ''
      };
    }

    // Handle /api/auth/callback
    if (path === '/api/auth/callback' && method === 'GET') {
      const { code } = event.queryStringParameters;
      const response = await axios.post('https://api.twitter.com/2/oauth2/token', {
        code,
        grant_type: 'authorization_code',
        client_id: process.env.X_CLIENT_ID,
        redirect_uri: CALLBACK_URL,
        code_verifier: 'challenge'
      }, {
        auth: {
          username: process.env.X_CLIENT_ID,
          password: process.env.X_CLIENT_SECRET
        }
      });
      const { access_token } = response.data;
      const userResponse = await axios.get('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const userId = userResponse.data.data.id;
      await usersCollection.updateOne(
        { userId },
        { $set: { access_token, userId } },
        { upsert: true }
      );
      return {
        statusCode: 302,
        headers: { Location: `https://xsummerizer.com/?userId=${userId}` },
        body: ''
      };
    }

    // Handle /api/tweets/:userId/:count with admin bypass
    if (path.startsWith('/api/tweets/') && method === 'GET') {
      console.log('Handling /api/tweets/ for user:', path);
      const parts = path.split('/');
      const userId = parts[3]; // e.g., "14554287"
      const count = parts[4];  // e.g., "50"
      console.log('Fetching user from MongoDB:', userId);
      const user = await usersCollection.findOne({ userId });

      let accessToken;
      if (userId === '14554287') {
        // Admin bypass: Use client credentials for @bobgourley
        console.log('Admin user detected, fetching token with client credentials');
        const response = await axios.post('https://api.twitter.com/2/oauth2/token', {
          grant_type: 'client_credentials',
          client_id: process.env.X_CLIENT_ID,
          client_secret: process.env.X_CLIENT_SECRET
        });
        accessToken = response.data.access_token;
      } else if (user && user.access_token) {
        // Regular user: Use stored access token
        console.log('Using stored access token for user:', userId);
        accessToken = user.access_token;
      } else {
        console.log('User not authenticated:', userId);
        return { statusCode: 401, body: 'Not authenticated' };
      }

      console.log('Fetching tweets from X API for user:', userId, 'count:', count);
      const response = await axios.get(
        `https://api.twitter.com/2/users/${userId}/tweets?max_results=${count}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      console.log('Tweets fetched successfully:', response.data.data.length);
      return {
        statusCode: 200,
        body: JSON.stringify(response.data.data)
      };
    }

    // Handle /api/save-profile
    if (path === '/api/save-profile' && method === 'POST') {
      const { userId, tone, length, guidance } = JSON.parse(event.body);
      await usersCollection.updateOne(
        { userId },
        { $set: { tone, length, guidance } },
        { upsert: true }
      );
      return {
        statusCode: 200,
        body: 'Profile saved!'
      };
    }

    // Handle /api/create-checkout-session
    if (path === '/api/create-checkout-session' && method === 'POST') {
      const { userId, plan } = JSON.parse(event.body);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan === 'single' ? 'price_1QvkjaEHF0Ss91IDEKoczIOu' : 'price_1Qvkk0EHF0Ss91IDhWUXeh7E',
            quantity: 1
          }
        ],
        mode: plan === 'single' ? 'payment' : 'subscription',
        success_url: `https://xsummerizer.com/success?userId=${userId}`,
        cancel_url: 'https://xsummerizer.com/create'
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ id: session.id })
      };
    }

    // Default: 404
    return {
      statusCode: 404,
      body: 'Not found'
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: 'Server error'
    };
  } finally {
    await client.close();
  }
};