const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const Event = require('./models/Event');

// Load env variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Socket.IO setup for real-time forum
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Connect to MongoDB
connectDB().then(() => {
  // Drop any legacy unique compound index on registrations collection
  // (Schema changed to non-unique to support merchandise multiple purchases)
  const Registration = require('./models/Registration');
  Registration.collection.indexes().then(indexes => {
    indexes.forEach(idx => {
      if (idx.key && idx.key.event && idx.key.participant && idx.unique) {
        Registration.collection.dropIndex(idx.name).then(() => {
          console.log('Dropped legacy unique index on registrations:', idx.name);
        }).catch(() => {}); // Index might already be gone
      }
    });
  }).catch(() => {});
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/registrations', require('./routes/registrations'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/organizer', require('./routes/organizer'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/forum', require('./routes/forum'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Felicity Event Management System API' });
});

// Socket.IO for real-time forum
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join an event's forum room
  socket.on('joinForum', (eventId) => {
    socket.join(`forum-${eventId}`);
    console.log(`User ${socket.id} joined forum for event ${eventId}`);
  });

  // Leave forum room
  socket.on('leaveForum', (eventId) => {
    socket.leave(`forum-${eventId}`);
  });

  // New message - broadcast to room
  socket.on('newMessage', (data) => {
    io.to(`forum-${data.eventId}`).emit('messageReceived', data.message);
  });

  // Typing indicator
  socket.on('typing', (data) => {
    socket.to(`forum-${data.eventId}`).emit('userTyping', {
      userId: data.userId,
      userName: data.userName
    });
  });

  socket.on('stopTyping', (data) => {
    socket.to(`forum-${data.eventId}`).emit('userStopTyping', {
      userId: data.userId
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// Auto-update event statuses based on dates
const updateEventStatuses = async () => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return; // Skip if not connected

    const Registration = require('./models/Registration');
    const now = new Date();

    // Published events whose start date has passed → ongoing (skip closed events)
    await Event.updateMany(
      { status: 'published', startDate: { $lte: now }, endDate: { $gt: now } },
      { $set: { status: 'ongoing' } }
    );

    // Closed events whose start date has passed → ongoing
    await Event.updateMany(
      { status: 'closed', startDate: { $lte: now }, endDate: { $gt: now } },
      { $set: { status: 'ongoing' } }
    );

    // Find ongoing/published events whose end date has passed → mark as completed
    const completingEvents = await Event.find({
      status: { $in: ['ongoing', 'published'] },
      endDate: { $lte: now }
    }).select('_id');

    if (completingEvents.length > 0) {
      const completingIds = completingEvents.map(e => e._id);

      // Mark those events as completed
      await Event.updateMany(
        { _id: { $in: completingIds } },
        { $set: { status: 'completed' } }
      );

      // Also mark their active registrations as completed
      await Registration.updateMany(
        { event: { $in: completingIds }, status: 'registered' },
        { $set: { status: 'completed' } }
      );
    }
  } catch (err) {
    console.error('Event status update error:', err);
  }
};

// Run status update every 60 seconds
setInterval(updateEventStatuses, 60 * 1000);
// Also run once on startup after DB connection is likely established
setTimeout(updateEventStatuses, 15000);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Felicity Event Management System`);
  console.log(`   Server running on http://localhost:${PORT}`);
  console.log(`   API base: http://localhost:${PORT}/api`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});

module.exports = { app, server, io };
