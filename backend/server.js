require('dotenv').config();
const express     = require('express');
const mongoose    = require('mongoose');
const session     = require('express-session');
const MongoStore  = require('connect-mongo');
const path        = require('path');

const authRoutes    = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminRoutes   = require('./routes/admin');
const { requireStudent, requireAdmin } = require('./middleware/auth');

const app = express();

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log('MongoDB Connected'))
  .catch(err=>console.error(err));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session with proper cookie settings
// Session with proper cookie settings
// Session configuration in server.js
app.use(session({
  secret: process.env.SESSION_SECRET || 'computech-secret-key',
  resave: true,              // CRITICAL: Changed to true
  saveUninitialized: true,   // CRITICAL: Changed to true
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGO_URI,
    touchAfter: 24 * 3600    // Reduces unnecessary DB writes
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: false,           // Must be false for HTTP
    httpOnly: true,
    path: '/'
  }
}));


// Add this middleware to debug session issues
app.use((req, res, next) => {
  console.log('Session ID:', req.sessionID);
  console.log('Session contains role:', req.session?.role);
  next();
});

// Uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);

// Static assets
app.use('/css',    express.static(path.join(__dirname, '..', 'public/css')));
app.use('/js',     express.static(path.join(__dirname, '..', 'public/js')));
app.use('/images', express.static(path.join(__dirname, '..', 'public/images')));

// Page routes
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, '..', 'public/pages/index.html')));
app.get('/signup.html', (req, res) => res.sendFile(path.join(__dirname, '..', 'public/pages/signup.html')));
app.get('/login.html',  (req, res) => res.sendFile(path.join(__dirname, '..', 'public/pages/login.html')));
app.get('/dashboard.html', requireStudent, (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public/pages/dashboard.html'))
);
app.get('/admin.html', requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public/pages/admin.html'))
);

// 404 handler
app.use((req, res) => res.status(404).send('Not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server on port ${PORT}`));
