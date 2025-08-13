// =================================================================================================
// whatsapp-api-app/index.js
// =================================================================================================
// This is the main file for the Node.js application that provides an API for interacting with WhatsApp.
// It uses Express.js for the server and whatsapp-web.js for WhatsApp automation.
// =================================================================================================

const express = require('express');
const cors = require('cors'); // 
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// --- Basic Setup ---
const app = express();
app.use(cors());
const port = process.env.PORT || 4000;
const JWT_SECRET = 'your-super-secret-jwt-key'; // IMPORTANT: Change this to a strong, secret key

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- In-memory storage for sessions ---
// In a production environment, you would use a persistent store like Redis or a database.
const sessions = {};
const sessionTokens = {};


app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// --- Multer setup for file uploads ---
// This configures multer to store uploaded files in a directory named 'uploads'.
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = 'uploads/';
        // Ensure the directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Append extension
    }
});
const upload = multer({ storage: storage });

// =================================================================================================
// Helper Functions
// =================================================================================================

/**
 * Creates and initializes a new WhatsApp client session.
 * @param {string} sessionId - A unique identifier for the session.
 */
const createSession = (sessionId) => {
    console.log(`[Session] Creating new session: ${sessionId}`);
    
    // We use LocalAuth to keep the session authenticated after the first scan.
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for running on many servers
        },
    });

    // Store the client instance
    sessions[sessionId] = {
        client: client,
        status: 'INITIALIZING',
        qrCodeData: null,
    };

    // --- Client Event Listeners ---

    client.on('qr', (qr) => {
        console.log(`[Session ${sessionId}] QR Code received.`);
        sessions[sessionId].status = 'QR_GENERATED';
        // Convert QR to data URL to be easily sent in the API response
        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error(`[Session ${sessionId}] Error generating QR code`, err);
                sessions[sessionId].status = 'ERROR';
            } else {
                sessions[sessionId].qrCodeData = url;
            }
        });
    });

    client.on('authenticated', () => {
        console.log(`[Session ${sessionId}] Authenticated successfully.`);
        sessions[sessionId].status = 'AUTHENTICATED';
    });
    
    client.on('ready', () => {
        console.log(`[Session ${sessionId}] Client is ready!`);
        sessions[sessionId].status = 'READY';
        // Generate a session token upon successful login
        const token = jwt.sign({ sessionId: sessionId }, JWT_SECRET, { expiresIn: '1d' });
        sessionTokens[sessionId] = token;
    });

    client.on('auth_failure', (msg) => {
        console.error(`[Session ${sessionId}] Authentication failure:`, msg);
        sessions[sessionId].status = 'AUTH_FAILURE';
        // Clean up failed session
        delete sessions[sessionId];
    });

    client.on('disconnected', (reason) => {
        console.log(`[Session ${sessionId}] Client was logged out:`, reason);
        sessions[sessionId].status = 'DISCONNECTED';
        // Clean up on disconnect
        delete sessions[sessionId];
        delete sessionTokens[sessionId];
    });

    // Initialize the client
    client.initialize().catch(err => {
        console.error(`[Session ${sessionId}] Initialization error:`, err);
        sessions[sessionId].status = 'ERROR';
    });

    return client;
};

/**
 * Middleware to verify the JWT token from the Authorization header.
 */
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing.' });
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) {
        return res.status(401).json({ error: 'Token is missing from Authorization header.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        
        // Check if the session from the token still exists
        const { sessionId } = decoded;
        if (!sessions[sessionId] || !sessionTokens[sessionId] || sessionTokens[sessionId] !== token) {
             return res.status(403).json({ error: 'Session is no longer valid. Please re-authenticate.' });
        }
        
        req.sessionId = sessionId; // Add sessionId to the request object
        next();
    });
};


// =================================================================================================
// API Endpoints
// =================================================================================================

/**
 * @api {get} /get_qr
 * @description Generates a new session and returns a QR code for authentication.
 */
app.get('/get_qr', (req, res) => {
    const sessionId = `session-${Date.now()}`;
    createSession(sessionId);

    // Wait for the QR code to be generated
    const interval = setInterval(() => {
        const session = sessions[sessionId];
        if (session && session.status === 'QR_GENERATED' && session.qrCodeData) {
            clearInterval(interval);
            res.json({
                sessionId: sessionId,
                qrCode: session.qrCodeData,
                message: 'Scan this QR code with your WhatsApp app.'
            });
        } else if (session && (session.status === 'ERROR' || session.status === 'AUTH_FAILURE')) {
            clearInterval(interval);
            res.status(500).json({ error: 'Failed to generate QR code.' });
        }
    }, 1000); // Check every second
});

/**
 * @api {get} /check_status
 * @description Checks the status of a given session.
 * @param {string} sessionId - The ID of the session to check.
 */
app.get('/check_status', (req, res) => {
    const { sessionId } = req.query;

    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId query parameter is required.' });
    }

    const session = sessions[sessionId];

    if (!session) {
        return res.status(404).json({ status: 'NOT_FOUND', message: 'Session not found. Please request a new QR code.' });
    }
    
    const response = {
        sessionId: sessionId,
        status: session.status,
        session_token: null
    };
    
    // If the session is ready, provide the token
    if (session.status === 'READY') {
        response.session_token = sessionTokens[sessionId];
        response.message = 'Session is active and ready to send messages.';
    } else {
        // Provide a descriptive message based on the status
        switch(session.status) {
            case 'INITIALIZING':
                response.message = 'Session is initializing. Please wait.';
                break;
            case 'QR_GENERATED':
                response.message = 'QR code has been generated. Please scan it.';
                break;
            case 'AUTHENTICATED':
                response.message = 'User authenticated. Client is getting ready.';
                break;
            case 'DISCONNECTED':
                response.message = 'User has disconnected. Please request a new QR code.';
                break;
            case 'AUTH_FAILURE':
                 response.message = 'Authentication failed. Please try again.';
                 break;
            default:
                response.message = 'Unknown status.';
        }
    }

    res.json(response);
});

/**
 * POST /send_message
 * Send text + 0–N media items (file upload, URL, or base64)
 *
 * Body (JSON):
 * {
 *   "phoneNumber": "911234567890",
 *   "message": "optional caption",
 *   "media": [
 *     { "url": "https://example.com/cat.jpg" },
 *     {
 *       "data": "<base64…>",
 *       "mimetype": "application/pdf",
 *       "filename": "doc.pdf"
 *     }
 *   ]
 * }
 *
 * OR multipart/form-data with fields:
 *   phoneNumber, message (optional), media (file)
 */
app.post('/send_message',
  verifyToken,
  upload.single('media'),              // keeps multipart support
  async (req, res) => {

    const { phoneNumber, message } = req.body;
    const { sessionId } = req;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required.' });
    }

    // Collect media objects from either source
    const mediaPayload = [];
    // 1. Multipart upload
    if (req.file) {
      mediaPayload.push({ path: req.file.path });
    }
    // 2. Inline JSON (could be object or array)
    if (req.body.media) {
      let bodyMedia = req.body.media;
      if (typeof bodyMedia === 'string') {
        try { bodyMedia = JSON.parse(bodyMedia); } catch { /* ignore */ }
      }
      (Array.isArray(bodyMedia) ? bodyMedia : [bodyMedia])
        .forEach(item => mediaPayload.push(item));
    }

    if (!message && mediaPayload.length === 0) {
      return res.status(400).json({ error: 'Either a message or media is required.' });
    }

    const session = sessions[sessionId];
    if (!session || session.status !== 'READY') {
      return res.status(400).json({ error: 'Session is not active or ready.' });
    }
    const client = session.client;
    const chatId = `${phoneNumber.replace(/\D/g, '')}@c.us`;

    try {
      const sentIds = [];

      // helper to materialise any payload item -> MessageMedia
      const toMessageMedia = async (item) => {
        if (item.path) {
          return MessageMedia.fromFilePath(item.path);
        }
        if (item.url) {
          return await MessageMedia.fromUrl(item.url);
        }
        if (item.data && item.mimetype) {
          return new MessageMedia(item.mimetype, item.data, item.filename || 'file');
        }
        throw new Error('Unsupported media descriptor');
      };

      if (mediaPayload.length > 0) {
        // send first media with optional caption
        const first = await toMessageMedia(mediaPayload[0]);
        const resp = await client.sendMessage(chatId, first, { caption: message || '' });
        sentIds.push(resp.id.id);

        // send remaining media without caption
        for (let i = 1; i < mediaPayload.length; i++) {
          const mediaObj = await toMessageMedia(mediaPayload[i]);
          const r = await client.sendMessage(chatId, mediaObj);
          sentIds.push(r.id.id);
        }
      } else {
        // text-only path
        const r = await client.sendMessage(chatId, message);
        sentIds.push(r.id.id);
      }

      // clean up local upload if used
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      console.log(`[Session ${sessionId}] Sent to ${phoneNumber}`);
      return res.json({ success: true, messageIds: sentIds });
    } catch (err) {
      console.error(`[Session ${sessionId}] Send error:`, err);
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'Failed to send message.', details: err.message });
    }
});

// =================================================================================================
// Server Start
// =================================================================================================

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log('Endpoints:');
    console.log('  GET  /get_qr         - Get a new session QR code');
    console.log('  GET  /check_status?sessionId=<id> - Check session status');
    console.log('  POST /send_message    - Send a message (requires auth token)');
});
