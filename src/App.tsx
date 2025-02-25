import React, { useEffect, useState } from 'react';
import './App.css';

const stripePromise = import('@stripe/stripe-js').then((module) => module.loadStripe('pk_test_51QuO6NEHF0Ss91IDhLVPUGvLQ3EGfLvJ4mfKSX7MeNw7sT8mWHUcn7VEdvvh4q72aqFp9IX3dIdY2M9K5JkWCRLA001fYDBHT6'));

function App() {
  const [page, setPage] = useState('beta');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userIdFromUrl = urlParams.get('userId');
    if (userIdFromUrl) {
      setUserId(userIdFromUrl);
      setIsLoggedIn(true);
      setPage('create');
    }
  }, []);

  return (
    <div className="App">
      <header>
        <h1>Tweet Narrative App</h1>
        {isLoggedIn && (
          <nav>
            <button onClick={() => setPage('profile')}>Profile</button>
            <button onClick={() => setPage('create')}>Create</button>
            {userId === '14554287' && (
              <button onClick={() => setPage('admin')}>Admin</button>
            )}
          </nav>
        )}
      </header>
      <main>
        {page === 'beta' && <BetaLandingPage setPage={setPage} setIsLoggedIn={setIsLoggedIn} setUserId={setUserId} />}
        {page === 'profile' && isLoggedIn && <ProfilePage userId={userId} />}
        {page === 'create' && isLoggedIn && <CreatePage userId={userId} />}
        {page === 'success' && isLoggedIn && <SuccessPage setPage={setPage} />}
        {page === 'admin' && isLoggedIn && userId === '14554287' && <AdminPage />}
      </main>
    </div>
  );
}

interface BetaLandingPageProps {
  setPage: (page: string) => void;
  setIsLoggedIn: (loggedIn: boolean) => void;
  setUserId: (userId: string) => void;
}

function BetaLandingPage({ setPage, setIsLoggedIn, setUserId }: BetaLandingPageProps) {
  const handleLogin = async () => {
    window.location.href = 'https://xsummerizer.com/api/login';
  };

  const handlePayment = async () => {
    const response = await fetch('https://xsummerizer.com/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'guest', plan: 'single' })
    });
    const { id } = await response.json();
    const stripe = await stripePromise;
    if (stripe) {
      await stripe.redirectToCheckout({ sessionId: id });
    } else {
      alert('Payment failed—Stripe not available');
    }
  };

  return (
    <div>
      <h2>We are in beta mode and are still under development, with features limited to the developers till we are ready to roll out.</h2>
      <button onClick={handleLogin}>Login with X</button>
      <div>
        <p>Beta testers only</p>
        <button onClick={handlePayment}>Pay $5 to join beta testing</button>
      </div>
    </div>
  );
}

interface ProfilePageProps {
  userId: string;
}

function ProfilePage({ userId }: ProfilePageProps) {
  const [tone, setTone] = useState('Welcoming');
  const [length, setLength] = useState('Medium (~500 words)');
  const [guidance, setGuidance] = useState(
    'Create a narrative that reflects my personal voice and insights from these tweets.'
  );

  const saveProfile = async () => {
    try {
      await fetch('https://xsummerizer.com/api/save-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tone, length, guidance }),
      });
      alert('Profile saved!');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save profile');
    }
  };

  return (
    <div>
      <h2>Your Profile</h2>
      <p>Set your default preferences here—how should your stories sound?</p>
      <label>
        Tone:
        <select value={tone} onChange={(e) => setTone(e.target.value)}>
          <option>Welcoming</option>
          <option>Casual</option>
          <option>Witty</option>
          <option>Formal</option>
        </select>
      </label>
      <br />
      <label>
        Length:
        <select value={length} onChange={(e) => setLength(e.target.value)}>
          <option>Short (~300 words)</option>
          <option>Medium (~500 words)</option>
          <option>Long (~800 words)</option>
        </select>
      </label>
      <br />
      <label>
        Guidance:
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
        />
      </label>
      <br />
      <button onClick={saveProfile}>Save Profile</button>
    </div>
  );
}

interface Tweet {
  id: string;
  text: string;
}

interface CreatePageProps {
  userId: string;
}

function CreatePage({ userId }: CreatePageProps) {
  const [tweetCount] = useState('50');
  const [tone, setTone] = useState('Welcoming');
  const [length, setLength] = useState('Medium (~500 words)');
  const [guidance, setGuidance] = useState(
    'Create a narrative that reflects my personal voice and insights from these tweets.'
  );
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [narrative, setNarrative] = useState('');

  const fetchTweets = async () => {
    const response = await fetch(`https://xsummerizer.com/api/tweets/${userId}/${tweetCount}`);
    const data = await response.json();
    setTweets(data || []);
  };

  const handlePayment = async (plan: 'single' | 'monthly') => {
    const response = await fetch('https://xsummerizer.com/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, plan }),
    });
    const { id } = await response.json();
    const stripe = await stripePromise;
    if (stripe) {
      await stripe.redirectToCheckout({ sessionId: id });
    } else {
      console.error('Stripe failed to load');
      alert('Payment failed—Stripe not available');
    }
  };

  const generateNarrative = () => {
    if (tweets.length === 0) {
      alert('Fetch tweets first!');
      return;
    }
    const mockNarrative = `Hey there! What a treat to dive into your ${tweetCount} tweets. Here’s a story: ${tweets.map(t => t.text).join(' ')}`;
    setNarrative(mockNarrative);
  };

  return (
    <div>
      <h2>Create Narrative</h2>
      <p>Pick your tweets and style—let’s make something exciting!</p>
      <label>
        Tweet Count:
        <select value={tweetCount} disabled>
          <option>50</option>
          <option>100</option>
        </select>
      </label>
      <br />
      <button onClick={fetchTweets}>Fetch Tweets</button>
      <br />
      <label>
        Tone:
        <select value={tone} onChange={(e) => setTone(e.target.value)}>
          <option>Welcoming</option>
          <option>Casual</option>
          <option>Witty</option>
          <option>Formal</option>
        </select>
      </label>
      <br />
      <label>
        Length:
        <select value={length} onChange={(e) => setLength(e.target.value)}>
          <option>Short (~300 words)</option>
          <option>Medium (~500 words)</option>
          <option>Long (~800 words)</option>
        </select>
      </label>
      <br />
      <label>
        Guidance:
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
        />
      </label>
      <br />
      <button onClick={() => handlePayment('single')}>Pay $5 (Single)</button>
      <button onClick={() => handlePayment('monthly')}>Subscribe $30/month</button>
      <br />
      <button onClick={generateNarrative}>Generate Narrative</button>
      {narrative && (
        <>
          <h3>Your Narrative:</h3>
          <p>{narrative}</p>
        </>
      )}
      {tweets.length > 0 && (
        <>
          <h3>Your Tweets:</h3>
          <ul>
            {tweets.map((tweet) => (
              <li key={tweet.id}>{tweet.text}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SuccessPage({ setPage }: { setPage: (page: string) => void }) {
  useEffect(() => {
    setPage('create');
  }, [setPage]);

  return <div>Payment successful! Redirecting...</div>;
}

function AdminPage() {
  return (
    <div>
      <h2>Admin Dashboard</h2>
      <p>Admin features coming soon!</p>
    </div>
  );
}

export default App;