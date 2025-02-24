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

    // ... (rest of your existing paths unchanged - /auth/callback, /tweets/, etc.)
    // Keep everything below as is, just adding logs to /api/login for now

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

    if (path.startsWith('/api/tweets/') && method === 'GET') {
      const [_, __, userId, count] = path.split('/');
      const user = await usersCollection.findOne({ userId });
      if (!user || !user.access_token) {
        return { statusCode: 401, body: 'Not authenticated' };
      }
      const response = await axios.get(
        `https://api.twitter.com/2/users/${userId}/tweets?max_results=${count}`,
        { headers: { Authorization: `Bearer ${user.access_token}` } }
      );
      return {
        statusCode: 200,
        body: JSON.stringify(response.data.data)
      };
    }

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