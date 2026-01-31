require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
const videoRoutes = require('./routes/video');
const authRoutes = require('./routes/auth');
const { initializeQueues } = require('./services/queue');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Initialize background job queues
initializeQueues();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
