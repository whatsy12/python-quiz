// server.js - Node.js backend for Python Quiz with login system
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // For generating secure tokens
const nodemailer = require('nodemailer'); // For sending emails

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Debug info
console.log('Starting server...');
console.log('Current directory:', __dirname);
console.log('Files in current directory:', fs.readdirSync(__dirname));

// Check if public directory exists
const publicPath = path.join(__dirname, 'public');
console.log('Public directory path:', publicPath);
console.log('Public directory exists:', fs.existsSync(publicPath));

// List files in public directory if it exists
if (fs.existsSync(publicPath)) {
console.log('Files in public directory:', fs.readdirSync(publicPath));
}

// Middleware
app.use(bodyParser.json());

// Set correct content types for all responses
app.use((req, res, next) => {
// Log all requests
console.log('Request for:', req.url);

// Set default headers
res.setHeader('X-Content-Type-Options', 'nosniff');
next();
});

// Serve static files with proper content types
app.use(express.static(path.join(__dirname, 'public'), {
setHeaders: (res, filePath) => {
if (filePath.endsWith('.html')) {
res.setHeader('Content-Type', 'text/html; charset=UTF-8');
} else if (filePath.endsWith('.css')) {
res.setHeader('Content-Type', 'text/css');
} else if (filePath.endsWith('.js')) {
res.setHeader('Content-Type', 'application/javascript');
}
}
}));

// Create PostgreSQL connection pool
const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: process.env.NODE_ENV === 'production' ? {
rejectUnauthorized: false // Required for Render PostgreSQL
} : false // Disable SSL for local development
});

// Configure email transporter
// Use environment variables for email configuration
const transporter = nodemailer.createTransport({
service: process.env.EMAIL_SERVICE || 'gmail', // Default to gmail, but can be configured
auth: {
user: process.env.EMAIL_USER || 'default@example.com', // Replace with your actual default
pass: process.env.EMAIL_PASS || 'default_password' // Replace with your actual default
},
// Improve reliability with these settings
tls: {
rejectUnauthorized: false // Helps avoid certificate issues
},
// Timeouts to prevent hanging connections
connectionTimeout: 10000, // 10 seconds
greetingTimeout: 10000 // 10 seconds
});

// Function to send password reset email
async function sendPasswordResetEmail(email, username, resetLink) {
// Create email options
const mailOptions = {
from: `"Python Quiz" <${process.env.EMAIL_USER || 'default@example.com'}>`,
to: email,
subject: 'Password Reset for Python Quiz',
html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e5; border-radius: 10px;">
<h2 style="color: #1cb0f6; text-align: center;">Python Quiz Password Reset</h2>
<p>Hello ${username},</p>
<p>We received a request to reset your password for your Python Quiz account. If you didn't make this request, you can ignore this email.</p>
<p>To reset your password, please click the button below:</p>
<div style="text-align: center; margin: 30px 0;">
<a href="${resetLink}" style="background-color: #58cc02; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
</div>
<p>If the button doesn't work, you can copy and paste this link into your browser:</p>
<p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 5px;">${resetLink}</p>
<p>This link will expire in 1 hour for security reasons.</p>
<p>Best regards,<br>The Python Quiz Team</p>
</div>
`,
text: `Hello ${username},\n\nWe received a request to reset your password for your Python Quiz account. If you didn't make this request, you can ignore this email.\n\nTo reset your password, please visit this link: ${resetLink}\n\nThis link will expire in 1 hour for security reasons.\n\nBest regards,\nThe Python Quiz Team`
};

// Send the email and handle errors properly
try {
console.log(`Attempting to send password reset email to ${email}...`);
const info = await transporter.sendMail(mailOptions);
console.log('Password reset email sent:', info.messageId);
return { success: true, messageId: info.messageId };
} catch (error) {
console.error('Error sending password reset email:', error);
// Also log the full error details for debugging
console.error('Detailed error:', JSON.stringify(error, null, 2));
return { success: false, error: error.message };
}
}

// Test database connection
pool.connect()
.then(client => {
console.log('Connected to PostgreSQL database');
client.release();

// Create tables
setupDatabase();
})
.catch(err => {
console.error('Error connecting to database:', err);
});

// Setup database tables - Updated to include ranked system
async function setupDatabase() {
const client = await pool.connect();

try {
await client.query('BEGIN');

// Create users table with rank_points column
await client.query(`
CREATE TABLE IF NOT EXISTS users (
id SERIAL PRIMARY KEY,
username VARCHAR(50) NOT NULL UNIQUE,
password VARCHAR(255) NOT NULL,
email VARCHAR(100),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
total_score INTEGER DEFAULT 0,
hearts INTEGER DEFAULT 3,
streak INTEGER DEFAULT 0,
level INTEGER DEFAULT 1,
xp INTEGER DEFAULT 0,
rank_points INTEGER DEFAULT 0
)
`);

// Create user_progress table
await client.query(`
CREATE TABLE IF NOT EXISTS user_progress (
id SERIAL PRIMARY KEY,
user_id INTEGER REFERENCES users(id),
question_id VARCHAR(100) NOT NULL,
correct BOOLEAN DEFAULT FALSE,
attempts INTEGER DEFAULT 0,
last_attempted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(user_id, question_id)
)
`);

// Create password_reset_tokens table
await client.query(`
CREATE TABLE IF NOT EXISTS password_reset_tokens (
id SERIAL PRIMARY KEY,
user_id INTEGER REFERENCES users(id),
token VARCHAR(255) NOT NULL UNIQUE,
expires_at TIMESTAMP NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`);

// Create ranked_tests table for the ranked system
await client.query(`
CREATE TABLE IF NOT EXISTS ranked_tests (
id SERIAL PRIMARY KEY,
user_id INTEGER REFERENCES users(id),
score INTEGER NOT NULL,
accuracy INTEGER NOT NULL,
questions_count INTEGER NOT NULL DEFAULT 10,
date_taken TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`);

await client.query('COMMIT');
console.log('Database tables created successfully');
} catch (e) {
await client.query('ROLLBACK');
console.error('Error setting up database:', e);
} finally {
client.release();
}
}

// API Routes
// Login endpoint
app.post('/api/login', async (req, res) => {
const { username, password } = req.body;

if (!username || !password) {
return res.status(400).json({
success: false,
message: 'Username and password are required'
});
}

try {
// Query to find user
const result = await pool.query(
'SELECT * FROM users WHERE username = $1',
[username]
);

// Check if user exists
if (result.rows.length === 0) {
return res.status(401).json({
success: false,
message: 'Invalid username or password'
});
}

const user = result.rows[0];

// Compare passwords
const match = await bcrypt.compare(password, user.password);

if (match) {
// Password is correct
return res.status(200).json({
success: true,
message: 'Login successful',
user: {
id: user.id,
username: user.username,
email: user.email,
total_score: user.total_score,
hearts: user.hearts,
streak: user.streak,
level: user.level,
xp: user.xp
}
});
} else {
// Password is incorrect
return res.status(401).json({
success: false,
message: 'Invalid username or password'
});
}
} catch (error) {
console.error('Database error:', error);
return res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Register endpoint
app.post('/api/register', async (req, res) => {
const { username, password, email } = req.body;

if (!username || !password) {
return res.status(400).json({
success: false,
message: 'Username and password are required'
});
}

try {
// Hash the password
const hashedPassword = await bcrypt.hash(password, 10);

// Insert new user
const result = await pool.query(
'INSERT INTO users (username, password, email, total_score, hearts, streak, level, xp) VALUES ($1, $2, $3, 0, 3, 0, 1, 0) RETURNING id',
[username, hashedPassword, email]
);

// Return success
return res.status(201).json({
success: true,
message: 'Registration successful',
userId: result.rows[0].id
});
} catch (error) {
// Check for duplicate username
if (error.code === '23505') { // PostgreSQL unique violation code
return res.status(409).json({
success: false,
message: 'Username already exists'
});
}

console.error('Database error:', error);
return res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Request password reset
app.post('/api/request-password-reset', async (req, res) => {
const { email } = req.body;

if (!email) {
return res.status(400).json({
success: false,
message: 'Email is required'
});
}

try {
// Check if user exists
const userResult = await pool.query(
'SELECT id, username, email FROM users WHERE email = $1',
[email]
);

if (userResult.rows.length === 0) {
// For security reasons, don't tell the user that email doesn't exist
// But log it server-side for debugging
console.log(`Password reset requested for non-existent email: ${email}`);
return res.status(200).json({
success: true,
message: 'If an account with that email exists, a password reset link has been sent.'
});
}

const user = userResult.rows[0];

// Generate a random token
const token = crypto.randomBytes(32).toString('hex');

// Set token expiration (1 hour from now)
const expiresAt = new Date();
expiresAt.setHours(expiresAt.getHours() + 1);

// Delete any existing tokens for this user
await pool.query(
'DELETE FROM password_reset_tokens WHERE user_id = $1',
[user.id]
);

// Store the new token
await pool.query(
'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
[user.id, token, expiresAt]
);

// Create reset link
// Use RENDER_EXTERNAL_URL if available (for Render deployments)
const baseUrl = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
const resetLink = `${baseUrl}/reset-password.html?token=${token}`;

// Always log the reset link for debugging
console.log('Generated password reset link:', resetLink);

// Send the reset email
const emailResult = await sendPasswordResetEmail(user.email, user.username, resetLink);

if (emailResult.success) {
// Return success
return res.status(200).json({
success: true,
message: 'Password reset link sent to your email'
});
} else {
// Log the error server-side but don't expose details to the client
console.error('Failed to send email but token was created:', emailResult.error);
// For security, still tell the client it succeeded
return res.status(200).json({
success: true,
message: 'If an account with that email exists, a password reset link has been sent.'
});
}
} catch (error) {
console.error('Error requesting password reset:', error);
return res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Reset password with token
app.post('/api/reset-password', async (req, res) => {
const { token, password } = req.body;

if (!token || !password) {
return res.status(400).json({
success: false,
message: 'Token and password are required'
});
}

try {
// Find the token
const tokenResult = await pool.query(
'SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()',
[token]
);

if (tokenResult.rows.length === 0) {
return res.status(400).json({
success: false,
message: 'Invalid or expired reset token'
});
}

const resetToken = tokenResult.rows[0];

// Hash the new password
const hashedPassword = await bcrypt.hash(password, 10);

// Update the user's password
await pool.query(
'UPDATE users SET password = $1 WHERE id = $2',
[hashedPassword, resetToken.user_id]
);

// Delete the used token
await pool.query(
'DELETE FROM password_reset_tokens WHERE id = $1',
[resetToken.id]
);

// Return success
return res.status(200).json({
success: true,
message: 'Password reset successful'
});
} catch (error) {
console.error('Error resetting password:', error);
return res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Update user progress
app.post('/api/progress', async (req, res) => {
const { userId, questionId, correct, score, hearts, streak, xp } = req.body;

if (!userId || !questionId) {
return res.status(400).json({
success: false,
message: 'User ID and question ID are required'
});
}

try {
// Begin transaction
const client = await pool.connect();

try {
await client.query('BEGIN');

// Update or insert progress record
await client.query(
`INSERT INTO user_progress (user_id, question_id, correct, attempts)
VALUES ($1, $2, $3, 1)
ON CONFLICT (user_id, question_id)
DO UPDATE SET
correct = $3,
attempts = user_progress.attempts + 1,
last_attempted = CURRENT_TIMESTAMP`,
[userId, questionId, correct]
);

// Update user stats
await client.query(
`UPDATE users SET
total_score = $1,
hearts = $2,
streak = $3,
xp = $4
WHERE id = $5`,
[score, hearts, streak, xp, userId]
);

await client.query('COMMIT');

res.status(200).json({
success: true,
message: 'Progress updated successfully'
});
} catch (e) {
await client.query('ROLLBACK');
throw e;
} finally {
client.release();
}
} catch (error) {
console.error('Error updating progress:', error);
res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Get user stats
app.get('/api/user/:id', async (req, res) => {
const userId = req.params.id;

try {
const result = await pool.query(
'SELECT id, username, email, total_score, hearts, streak, level, xp FROM users WHERE id = $1',
[userId]
);

if (result.rows.length === 0) {
return res.status(404).json({
success: false,
message: 'User not found'
});
}

res.status(200).json({
success: true,
user: result.rows[0]
});
} catch (error) {
console.error('Error fetching user:', error);
res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Status endpoint
app.get('/api/status', (req, res) => {
res.json({ status: 'ok', message: 'Server is running' });
});

// Debugging endpoint for password reset links
app.get('/api/admin/reset-links', async (req, res) => {
const adminToken = process.env.ADMIN_SECRET;
const tokenFromRequest = req.headers.authorization?.split(' ')[1];

// Verify admin token
if (!adminToken || tokenFromRequest !== adminToken) {
return res.status(403).json({
success: false,
message: 'Unauthorized access'
});
}

try {
// Get the last 5 reset tokens
const result = await pool.query(
`SELECT t.token, t.expires_at, u.username, u.email
FROM password_reset_tokens t
JOIN users u ON t.user_id = u.id
ORDER BY t.created_at DESC
LIMIT 5`
);

// Format the data
const links = result.rows.map(row => {
// Use Render's external URL if available, otherwise fall back to host
const baseUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const resetLink = `${baseUrl}/reset-password.html?token=${row.token}`;

return {
username: row.username,
email: row.email,
expiresAt: row.expires_at,
resetLink
};
});

// Log tokens to console for debugging
console.log('Reset links:', JSON.stringify(links, null, 2));

return res.status(200).json({
success: true,
links
});
} catch (error) {
console.error('Error fetching reset links:', error);
return res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Email test endpoint (for checking email configuration)
app.get('/api/admin/test-email', async (req, res) => {
// Only allow with admin authentication
const adminToken = process.env.ADMIN_SECRET;
const tokenFromRequest = req.headers.authorization?.split(' ')[1];

if (!adminToken || tokenFromRequest !== adminToken) {
return res.status(403).json({
success: false,
message: 'Unauthorized access'
});
}

const testEmail = req.query.email;
if (!testEmail) {
return res.status(400).json({
success: false,
message: 'Email parameter is required'
});
}

try {
// Test email configuration
const emailResult = await sendPasswordResetEmail(
testEmail,
'Test User',
'https://example.com/test-reset-link'
);

if (emailResult.success) {
return res.status(200).json({
success: true,
message: 'Test email sent successfully',
messageId: emailResult.messageId
});
} else {
return res.status(500).json({
success: false,
message: 'Failed to send test email',
error: emailResult.error
});
}
} catch (error) {
console.error('Error sending test email:', error);
return res.status(500).json({
success: false,
message: 'Server error',
error: error.message
});
}
});

// Ranked System API Endpoints

// Get user's rank
app.get('/api/rank/:id', async (req, res) => {
const userId = req.params.id;

try {
const result = await pool.query(
'SELECT rank_points FROM users WHERE id = $1',
[userId]
);

if (result.rows.length === 0) {
return res.status(404).json({
success: false,
message: 'User not found'
});
}

res.status(200).json({
success: true,
rankPoints: result.rows[0].rank_points
});
} catch (error) {
console.error('Error fetching user rank:', error);
res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
try {
const result = await pool.query(
'SELECT id, username, rank_points FROM users WHERE rank_points > 0 ORDER BY rank_points DESC LIMIT 20'
);

res.status(200).json({
success: true,
leaderboard: result.rows
});
} catch (error) {
console.error('Error fetching leaderboard:', error);
res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Get ranked questions
app.post('/api/ranked-questions', async (req, res) => {
const { userId, difficulty } = req.body;

try {
let difficultyLevel;

// Map difficulty string to level
switch (difficulty.toLowerCase()) {
case 'easy':
difficultyLevel = 1;
break;
case 'medium':
difficultyLevel = 2;
break;
case 'hard':
difficultyLevel = 3;
break;
default:
difficultyLevel = 2; // Default to medium
}

// Get questions based on difficulty
let questions = [];

// If user is logged in, try to get personalized questions
// based on their previous performance
if (userId) {
// First check if there are questions the user has never seen
const unseenResult = await pool.query(`
SELECT q.question, q.options, q.answer, q.level, q.topics
FROM questions q
LEFT JOIN user_progress up ON up.question_id = q.id AND up.user_id = $1
WHERE up.id IS NULL AND q.level = $2
ORDER BY RANDOM()
LIMIT 5
`, [userId, difficultyLevel]);

// If user has seen all questions at this level, get a mix of ones they've gotten wrong and right
if (unseenResult.rows.length < 5) {
const mixedResult = await pool.query(`
SELECT q.question, q.options, q.answer, q.level, q.topics
FROM questions q
JOIN user_progress up ON up.question_id = q.id
WHERE up.user_id = $1 AND q.level = $2
ORDER BY up.correct ASC, RANDOM()
LIMIT ${5 - unseenResult.rows.length}
`, [userId, difficultyLevel]);

questions = [...unseenResult.rows, ...mixedResult.rows];
} else {
questions = unseenResult.rows;
}
}

// In a real implementation, you would query a questions table
// For this implementation, we'll return a response that will trigger
// the client-side fallback
res.status(200).json({
success: false,
message: 'Questions not available in database yet'
});

} catch (error) {
console.error('Error getting ranked questions:', error);
res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Submit ranked test results
app.post('/api/submit-ranked', async (req, res) => {
const { userId, score, accuracy, totalPoints } = res.body;

if (!userId) {
return req.status(400).json({
success: false,
message: 'User ID is required'
});
}

try {
// Begin transaction
const client = await pool.connect();

try {
await client.query('BEGIN');

// Update user's rank points
await client.query(
'UPDATE users SET rank_points = $1 WHERE id = $2',
[totalPoints, userId]
);

// Record the ranked test
await client.query(
'INSERT INTO ranked_tests (user_id, score, accuracy, questions_count) VALUES ($1, $2, $3, 10)',
[userId, score, accuracy]
);

await client.query('COMMIT');

res.status(200).json({
success: true,
message: 'Ranked test results submitted successfully'
});
} catch (e) {
await client.query('ROLLBACK');
throw e;
} finally {
client.release();
}
} catch (error) {
console.error('Error submitting ranked test:', error);
res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

// Explicit route handlers for HTML files
app.get('/', (req, res) => {
res.set('Content-Type', 'text/html; charset=UTF-8');
res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register.html', (req, res) => {
res.set('Content-Type', 'text/html; charset=UTF-8');
res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login.html', (req, res) => {
res.set('Content-Type', 'text/html; charset=UTF-8');
res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/quiz.html', (req, res) => {
res.set('Content-Type', 'text/html; charset=UTF-8');
res.sendFile(path.join(__dirname, 'public', 'quiz.html'));
});

app.get('/forgot-password.html', (req, res) => {
res.set('Content-Type', 'text/html; charset=UTF-8');
res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password.html', (req, res) => {
res.set('Content-Type', 'text/html; charset=UTF-8');
res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// Catch all route (keep this last)
app.get('*', (req, res) => {
// First check if the requested file exists in public
const requestedPath = path.join(__dirname, 'public', req.path);

if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
res.sendFile(requestedPath);
} else {
// Fall back to index.html
res.set('Content-Type', 'text/html; charset=UTF-8');
res.sendFile(path.join(__dirname, 'public', 'index.html'));
}
});

// Start server
app.listen(port, () => {
console.log(`Server running on port ${port}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Email configuration: ${process.env.EMAIL_USER ? 'Set' : 'Not set'}`);
});
