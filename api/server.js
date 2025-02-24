require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY);

const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5001;
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

const CALLBACK_URL = 'https://xsummerizer.com/api/auth/callback';

async function startServer() {
  try {
    await client.connect();
    console.log('Connected to MongoDB!');
    const db = client.db('tweet_narrative');
    const usersCollection = db.collection('users');

    app.get('/login', (req, res) => {
      const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${process.env.X_CLIENT_ID}&redirect_uri=${CALLBACK_URL}&scope=tweet.read%20users.read&state=state&code_challenge=challenge&code_challenge_method=plain`;
      res.redirect(authUrl);
    });

    app.get('/auth/callback', async (req, res) => {
      const { code } = req.query;
      try {
        const response = await axios.post('https://api.twitter.com/2/oauth2/token', {
          code,
          grant_type: 'authorization_code',
          client_id: process.env.X_CLIENT_ID,
          redirect_uri: CALLBACK_URL,
          code_verifier: 'challenge',
        }, {
          auth: {
            username: process.env.X_CLIENT_ID,
            password: process.env.X_CLIENT_SECRET,
          },
        });
        const { access_token } = response.data;
        const userResponse = await axios.get('https://api.twitter.com/2/users/me', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const userId = userResponse.data.data.id;
        await usersCollection.updateOne(
          { userId },
          { $set: { access_token, userId } },
          { upsert: true }
        );
        res.redirect(`https://xsummerizer.com/?userId=${userId}`);
      } catch (error) {
        console.error('Login error:', error.response ? error.response.data : error.message);
        res.send('Login failed!');
      }
    });

    app.post('/save-profile', async (req, res) => {
      const { userId, tone, length, guidance } = req.body;
      await usersCollection.updateOne(
        { userId },
        { $set: { tone, length, guidance } },
        { upsert: true }
      );
      res.send('Profile saved!');
    });

    app.get('/tweets/:userId/:count', async (req, res) => {
      const { userId, count } = req.params;
      const user = await usersCollection.findOne({ userId });
      if (!user || !user.access_token) {
        return res.status(401).send('Not authenticated');
      }
      try {
        const response = await axios.get(
          `https://api.twitter.com/2/users/${userId}/tweets?max_results=${count}`,
          { headers: { Authorization: `Bearer ${user.access_token}` } }
        );
        res.json(response.data.data);
      } catch (error) {
        console.error('Tweet fetch error:', error.response ? error.response.data : error.message);
        res.status(500).send('Failed to fetch tweets');
      }
    });

    app.post('/create-checkout-session', async (req, res) => {
      const { userId, plan } = req.body;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan === 'single' ? 'price_1QvkjaEHF0Ss91IDEKoczIOu' : 'price_1Qvkk0EHF0Ss91IDhWUXeh7E',
            quantity: 1,
          },
        ],
        mode: plan === 'single' ? 'payment' : 'subscription',
        success_url: `https://xsummerizer.com/success?userId=${userId}`,
        cancel_url: 'https://xsummerizer.com/create',
      });
      res.json({ id: session.id });
    });

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error);
  }
}

startServer();

module.exports = app;