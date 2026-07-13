const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const http = require('http'); // Added for Socket.io
const { Server } = require('socket.io'); // Added for Socket.io
require('dotenv').config();

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const kbRoutes = require('./routes/kbRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const conversationRoutes = require('./routes/conversationRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// HTTP Server & Socket.io Setup
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || '*' }
});

// Make io accessible on every request via req.app.get('io')
app.set('io', io);

io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Customer / Agent joins a conversation-specific room so that
    // targeted events (e.g. transferred_successfully) only reach
    // the people involved in that chat.
    socket.on('join_room', (conversationId) => {
        socket.join(conversationId);
        console.log(`[SOCKET] ${socket.id} joined room: ${conversationId}`);
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
});

// ==========================================
// 1. GLOBAL ADVANCED SECURITY MIDDLEWARES
// ==========================================
app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { success: false, message: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Body Parsers & Request Logger
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}

// ==========================================
// 2. ROBUST DATABASE CONNECTION ARCHITECTURE
// ==========================================
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`[DATABASE] Daivo Atlas Connected: ${conn.connection.host} ✅`);
    } catch (err) {
        console.error(`[DATABASE ERROR] Connection failed! ❌: ${err.message}`);
        process.exit(1);
    }
};

connectDB();

// ==========================================
// ROUTES INTEGRATION
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/conversations', conversationRoutes);

// ==========================================
// 3. CORE DIAGNOSTIC ROUTES
// ==========================================
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Daivo Support Engine V1 API Core Active.',
        timestamp: new Date()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        dbStatus: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED'
    });
});

// ==========================================
// 4. GLOBAL ERROR HANDLING MIDDLEWARES
// ==========================================
app.use((req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
});

app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        success: false,
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? '' : err.stack
    });
});

// ==========================================
// 5. SERVER BOOTUP & GRACEFUL SHUTDOWN
// ==========================================
httpServer.listen(PORT, () => {
    console.log(`[SERVER] High-level engine running in [${process.env.NODE_ENV || 'development'}] mode on port ${PORT}`);
});

process.on('unhandledRejection', (err) => {
    console.error(`[CRITICAL ERROR] Unhandled Rejection: ${err.message}`);
    httpServer.close(() => process.exit(1));
});