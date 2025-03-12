
// Import necessary modules
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const redis = require('redis');
const { check, validationResult } = require('express-validator');

const app = express();
const port = process.env.PORT || 5000;

// Redis client setup
const client = redis.createClient();
client.on('error', (err) => console.error('Redis Error:', err));

app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.once('open', () => console.log('Connected to MongoDB'));

db.on('error', (err) => console.error('MongoDB Error:', err));

// Define Schema without Index (Before Optimization)
const userSchema = new mongoose.Schema({
  name: String,
  email: String, // No index initially
});

// After Optimization - Add Index (Uncomment when demonstrating indexing improvement)
// userSchema.index({ email: 1 });

const User = mongoose.model('User', userSchema);

// Middleware for Redis caching
const cacheMiddleware = (req, res, next) => {
  const { email } = req.params;
  client.get(email, (err, data) => {
    if (err) throw err;
    if (data) {
      return res.json(JSON.parse(data));
    }
    next();
  });
};

// Create User (Before - No Validation)
// app.post('/users', async (req, res) => {
//   const user = new User(req.body);
//   await user.save();
//   res.status(201).json(user);
// });

// After - Add Validation
app.post(
  '/users',
  [
    check('name').not().isEmpty().withMessage('Name is required'),
    check('email').isEmail().withMessage('Invalid email format'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = new User(req.body);
      await user.save();
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Get User (Before - No Caching)
// app.get('/users/:email', async (req, res) => {
//   try {
//     const user = await User.findOne({ email: req.params.email });
//     if (!user) return res.status(404).json({ message: 'User not found' });
//     res.json(user);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// After - With Caching
app.get('/users/:email', cacheMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    client.setex(req.params.email, 3600, JSON.stringify(user)); // Cache for 1 hour
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
