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
// Fix any issues with rank_points in the database
fixRankDatabase();
})
.catch(err => {
console.error('Error connecting to database:', err);
});

// Function to fix rank-related issues in the database
async function fixRankDatabase() {
console.log('Checking and fixing rank points in database...');
const client = await pool.connect();

try {
// Update any NULL rank_points to 0
const result = await client.query(
'UPDATE users SET rank_points = 0 WHERE rank_points IS NULL RETURNING id, username'
);

if (result.rows.length > 0) {
console.log(`Fixed rank_points for ${result.rows.length} users`);
result.rows.forEach(user => {
console.log(`- Fixed user ${user.username} (ID: ${user.id})`);
});
} else {
console.log('No users with NULL rank_points found');
}
} catch (error) {
console.error('Error fixing rank database:', error);
} finally {
client.release();
}
}

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
'INSERT INTO users (username, password, email, total_score, hearts, streak, level, xp, rank_points) VALUES ($1, $2, $3, 0, 3, 0, 1, 0, 0) RETURNING id',
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

// Get user's rank - FIXED
app.get('/api/rank/:id', async (req, res) => {
const userId = req.params.id;
console.log(`Fetching rank for user ID: ${userId}`);

try {
const result = await pool.query(
'SELECT id, username, rank_points FROM users WHERE id = $1',
[userId]
);

if (result.rows.length === 0) {
console.log(`User ID ${userId} not found`);
return res.status(404).json({
success: false,
message: 'User not found'
});
}

const user = result.rows[0];
console.log(`Found user ${user.username} with ${user.rank_points || 0} rank points`);

// Fix: Ensure rank_points is a number and not null
const rankPoints = Number(user.rank_points) || 0;

res.status(200).json({
success: true,
rankPoints: rankPoints
});
} catch (error) {
console.error('Database error when fetching rank:', error);
res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});
// Get leaderboard - FIXED
app.get('/api/leaderboard', async (req, res) => {
console.log('Fetching leaderboard data');

try {
// More robust query that handles null rank_points
const result = await pool.query(
'SELECT id, username, COALESCE(rank_points, 0) as rank_points FROM users ORDER BY rank_points DESC NULLS LAST LIMIT 20'
);

console.log(`Leaderboard query returned ${result.rows.length} users`);

// Make sure we don't return null values for rank_points
const leaderboard = result.rows.map(user => ({
id: user.id,
username: user.username,
rank_points: Number(user.rank_points) || 0 // Ensure rank_points is never null
}));

res.status(200).json({
success: true,
leaderboard: leaderboard
});
} catch (error) {
console.error('Database error when fetching leaderboard:', error);
res.status(500).json({
success: false,
message: 'Server error, please try again'
});
}
});

async function fixRankDatabase() {
console.log('Checking and fixing rank points in database...');
const client = await pool.connect();

try {
// Update any NULL rank_points to 0
const result = await client.query(
'UPDATE users SET rank_points = 0 WHERE rank_points IS NULL RETURNING id, username'
);

if (result.rows.length > 0) {
console.log(`Fixed rank_points for ${result.rows.length} users`);
result.rows.forEach(user => {
console.log(`- Fixed user ${user.username} (ID: ${user.id})`);
});
} else {
console.log('No users with NULL rank_points found');
}
} catch (error) {
console.error('Error fixing rank database:', error);
} finally {
client.release();
}
}

app.get('/api/admin/set-rank/:userId/:points', async (req, res) => {
const { userId, points } = req.params;

// Convert points to a number and validate
const rankPoints = parseInt(points, 10);
if (isNaN(rankPoints)) {
return res.status(400).json({
success: false,
message: 'Points must be a valid number'
});
}

try {
const result = await pool.query(
'UPDATE users SET rank_points = $1 WHERE id = $2 RETURNING username',
[rankPoints, userId]
);

if (result.rows.length === 0) {
return res.status(404).json({
success: false,
message: 'User not found'
});
}

return res.status(200).json({
success: true,
message: `Rank points for ${result.rows[0].username} set to ${rankPoints}`
});
} catch (error) {
console.error('Error setting rank:', error);
return res.status(500).json({
success: false,
message: 'Server error'
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

// Submit ranked test results - FIXED
app.post('/api/submit-ranked', async (req, res) => {
const { userId, score, accuracy, totalPoints } = req.body;
console.log(`Submitting ranked results for user ${userId}: score=${score}, accuracy=${accuracy}, totalPoints=${totalPoints}`);

if (!userId) {
return res.status(400).json({
success: false,
message: 'User ID is required'
});
}

try {
// Begin transaction
const client = await pool.connect();

try {
await client.query('BEGIN');

// Check if user exists and get current rank points
const userResult = await client.query(
'SELECT rank_points FROM users WHERE id = $1',
[userId]
);

if (userResult.rows.length === 0) {
await client.query('ROLLBACK');
return res.status(404).json({
success: false,
message: 'User not found'
});
}

const currentRankPoints = Number(userResult.rows[0].rank_points) || 0;
console.log(`Current rank points: ${currentRankPoints}, new total: ${totalPoints}`);

// Update user's rank points - ensure it's not null
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

// Verify the update
const verifyResult = await pool.query(
'SELECT rank_points FROM users WHERE id = $1',
[userId]
);
console.log(`Verified rank points after update: ${verifyResult.rows[0].rank_points}`);

res.status(200).json({
success: true,
message: 'Ranked test results submitted successfully',
updatedPoints: totalPoints
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

// New utility endpoint for manually setting a user's rank
app.get('/api/admin/set-rank/:userId/:points', async (req, res) => {
const { userId, points } = req.params;

// Convert points to a number and validate
const rankPoints = parseInt(points, 10);
if (isNaN(rankPoints)) {
return res.status(400).json({
success: false,
message: 'Points must be a valid number'
});
}

try {
const result = await pool.query(
'UPDATE users SET rank_points = $1 WHERE id = $2 RETURNING username',
[rankPoints, userId]
);

if (result.rows.length === 0) {
return res.status(404).json({
success: false,
message: 'User not found'
});
}

return res.status(200).json({
success: true,
message: `Rank points for ${result.rows[0].username} set to ${rankPoints}`
});
} catch (error) {
console.error('Error setting rank:', error);
return res.status(500).json({
success: false,
message: 'Server error'
});
}
});

// Utility endpoint to find a user by username
app.get('/api/find-user/:username', async (req, res) => {
try {
const result = await pool.query(
'SELECT id, username, rank_points FROM users WHERE username = $1',
[req.params.username]
);

if (result.rows.length === 0) {
return res.status(404).json({
success: false,
message: 'User not found'
});
}

return res.status(200).json({
success: true,
user: result.rows[0]
});
} catch (error) {
console.error('Error finding user:', error);
return res.status(500).json({
success: false,
message: 'Server error'
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


// Update user progress in the database
function updateUserProgress(question, isCorrect) {
if (!currentUser) return;

// Create a unique ID for the question
const questionId = btoa(question.question).substring(0, 20); // Simple encoding for unique ID

// Send progress to server
fetch('/api/progress', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
},
body: JSON.stringify({
userId: currentUser.id,
questionId: questionId,
correct: isCorrect,
score: score,
hearts: lives,
streak: streak,
xp: xp
}),
})
.then(response => response.json())
.then(data => {
if (data.success) {
// Update local user data
currentUser.total_score = score;
currentUser.hearts = lives;
currentUser.streak = streak;
currentUser.xp = xp;
localStorage.setItem('user', JSON.stringify(currentUser));
}
})
.catch(error => {
console.error('Error updating progress:', error);
});
}

// Helper functions
function showNotification(message, type) {
notificationEl.textContent = message;
notificationEl.className = `notification-${type}`;
notificationEl.classList.add('show');

setTimeout(() => {
notificationEl.classList.remove('show');
}, 3000);
}

// Get unique topics categorized by type
function getCategorizedTopics() {
const functionTopics = new Set();
const conceptTopics = new Set();

allQuestions.forEach(question => {
question.topics.forEach(topic => {
if (topic === 'function' || topic.includes('()')) {
// This is a function
} else if (question.topics.includes('function') && topic !== 'function') {
functionTopics.add(topic);
} else {
conceptTopics.add(topic);
}
});
});

return {
functions: Array.from(functionTopics).sort(),
concepts: Array.from(conceptTopics).sort()
};
}

// Count questions for each topic
function countQuestionsPerTopic() {
const topicCounts = {};

allQuestions.forEach(question => {
question.topics.forEach(topic => {
if (!topicCounts[topic]) {
topicCounts[topic] = 0;
}
topicCounts[topic]++;
});
});

return topicCounts;
}

// Count questions for each level
function countQuestionsPerLevel() {
const levelCounts = {};

Object.keys(questionsByLevel).forEach(level => {
levelCounts[level] = questionsByLevel[level].length;
});

return levelCounts;
}

// Initialize selection screen for topics
function initTopicSelection() {
const categorizedTopics = getCategorizedTopics();
const topicCounts = countQuestionsPerTopic();

// Add function topics
functionsGrid.innerHTML = '';
categorizedTopics.functions.forEach(topic => {
const count = topicCounts[topic] || 0;
const topicElement = document.createElement('div');
topicElement.className = 'topic-item';
topicElement.dataset.topic = topic;
topicElement.innerHTML = `
${topic}()
<span class="topic-badge">${count}</span>
`;

topicElement.addEventListener('click', () => {
topicElement.classList.toggle('selected');

if (topicElement.classList.contains('selected')) {
if (!selectedTopics.includes(topic)) {
selectedTopics.push(topic);
}
} else {
selectedTopics = selectedTopics.filter(t => t !== topic);
}

updateSelectionSummary();
});

functionsGrid.appendChild(topicElement);
});

// Add concept topics
conceptsGrid.innerHTML = '';
categorizedTopics.concepts.forEach(topic => {
const count = topicCounts[topic] || 0;
const topicElement = document.createElement('div');
topicElement.className = 'topic-item';
topicElement.dataset.topic = topic;
topicElement.innerHTML = `
${topic.charAt(0).toUpperCase() + topic.slice(1)}
<span class="topic-badge">${count}</span>
`;

topicElement.addEventListener('click', () => {
topicElement.classList.toggle('selected');

if (topicElement.classList.contains('selected')) {
if (!selectedTopics.includes(topic)) {
selectedTopics.push(topic);
}
} else {
selectedTopics = selectedTopics.filter(t => t !== topic);
}

updateSelectionSummary();
});

conceptsGrid.appendChild(topicElement);
});
}

// Initialize selection screen for levels
function initLevelSelection() {
const levelCounts = countQuestionsPerLevel();

levelsGrid.innerHTML = '';

levels.forEach(level => {
const count = levelCounts[level.id] || 0;

const levelCard = document.createElement('div');
levelCard.className = 'level-card';
levelCard.dataset.level = level.id;

// Create header
const header = document.createElement('div');
header.className = 'level-header';
header.style.background = level.color;
header.innerHTML = `
<div class="level-title">${level.title}</div>
<div class="level-count">${count} Questions</div>
`;

// Create description
const desc = document.createElement('div');
desc.className = 'level-desc';
desc.textContent = level.description;

// Create topics list
const topicsList = document.createElement('div');
topicsList.className = 'level-topics';

level.topics.forEach(topic => {
const topicEl = document.createElement('div');
topicEl.className = 'level-topic';
topicEl.textContent = topic;
topicsList.appendChild(topicEl);
});

// Append all to card
levelCard.appendChild(header);
levelCard.appendChild(desc);
levelCard.appendChild(topicsList);

// Add click handler
levelCard.addEventListener('click', () => {
// Toggle selection
levelCard.classList.toggle('selected');

const levelId = parseInt(levelCard.dataset.level);

if (levelCard.classList.contains('selected')) {
// Add to selected levels if not already there
if (!selectedLevels.includes(levelId)) {
selectedLevels.push(levelId);
}
} else {
// Remove from selected levels
selectedLevels = selectedLevels.filter(l => l !== levelId);
}

updateSelectionSummary();
});

levelsGrid.appendChild(levelCard);
});
}

// Update selection summary
function updateSelectionSummary() {
if (selectedMode === 'topics') {
if (selectedTopics.length === 0) {
selectionsText.textContent = "Select at least one topic to practice";
} else {
const formattedTopics = selectedTopics.map(t =>
t.includes('()') ? t : t.charAt(0).toUpperCase() + t.slice(1)
).join(', ');

selectionsText.textContent = `Selected topics: ${formattedTopics}`;
}
} else if (selectedMode === 'levels') { // levels mode
if (selectedLevels.length === 0) {
selectionsText.textContent = "Select at least one level to practice";
} else {
const levelNames = selectedLevels
.sort((a, b) => a - b)
.map(id => {
const level = levels.find(l => l.id === id);
return level ? level.title.split(':')[0] : `Level ${id}`;
})
.join(', ');

selectionsText.textContent = `Selected levels: ${levelNames}`;
}
} else if (selectedMode === 'ranked') {
selectionsText.textContent = "Test your skills in ranked mode";
}
}

// Filter questions based on selected topics
function filterQuestionsByTopics() {
if (selectedTopics.length === 0) {
return allQuestions.slice(); // Return all questions if no topics selected
}

const filtered = allQuestions.filter(question =>
question.topics.some(topic => selectedTopics.includes(topic))
);

// Remove duplicates
const uniqueQuestions = [];
const seenQuestions = new Set();

filtered.forEach(question => {
if (!seenQuestions.has(question.question)) {
seenQuestions.add(question.question);
uniqueQuestions.push(question);
}
});

return uniqueQuestions;
}

// Filter questions based on selected levels
function filterQuestionsByLevels() {
if (selectedLevels.length === 0) {
return allQuestions.slice(); // Return all questions if no levels selected
}

const filtered = [];

selectedLevels.forEach(levelId => {
if (questionsByLevel[levelId]) {
filtered.push(...questionsByLevel[levelId]);
}
});

return filtered;
}

// Update quiz mode display
function updateQuizModeDisplay() {
quizModeDisplay.innerHTML = "";

if (selectedMode === 'topics') {
if (selectedTopics.length === 0) {
quizModeDisplay.innerHTML = "<span class='mode-badge'>All Topics</span>";
} else {
const topicBadges = selectedTopics.map(topic =>
`<span class='mode-badge'>${topic}</span>`
).join(" ");

quizModeDisplay.innerHTML = topicBadges;
}
} else if (selectedMode === 'levels') { // levels mode
if (selectedLevels.length === 0) {
quizModeDisplay.innerHTML = "<span class='mode-badge'>All Levels</span>";
} else {
const levelBadges = selectedLevels
.sort((a, b) => a - b)
.map(id => {
const level = levels.find(l => l.id === id);
return `<span class='mode-badge'>${level ? level.title.split(':')[0] : `Level ${id}`}</span>`;
})
.join(" ");

quizModeDisplay.innerHTML = levelBadges;
}
} else if (selectedMode === 'ranked') {
quizModeDisplay.innerHTML = "<span class='mode-badge'>Ranked Test</span>";
}
}

// Load current question
function loadQuestion() {
if (currentQuestionIndex >= filteredQuestions.length) {
// Reset to beginning if we've gone through all questions
filteredQuestions.sort(() => Math.random() - 0.5);
currentQuestionIndex = 0;
showNotification("Great job! Starting a new set of questions.", "levelup");
}

const question = filteredQuestions[currentQuestionIndex];
questionEl.textContent = question.question;

// Update question count
questionNumberEl.textContent = currentQuestionIndex + 1;
totalQuestionsEl.textContent = filteredQuestions.length;

// Update progress bar
const progress = ((currentQuestionIndex) / filteredQuestions.length) * 100;
progressBarEl.style.width = `${progress}%`;

// Clear previous options
optionsEl.innerHTML = '';

// Shuffle options
const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5);

// Create option buttons
shuffledOptions.forEach(option => {
const btn = document.createElement('button');
btn.className = 'option';
btn.textContent = option;
btn.dataset.answer = option; // Store original answer for comparison

btn.addEventListener('click', () => {
if (questionsAnswered) return; // Prevent multiple answers

questionsAnswered = true;

const allButtons = optionsEl.querySelectorAll('.option');
// Disable all buttons to prevent multiple selections
allButtons.forEach(b => b.disabled = true);

if (option === question.answer) {
// Correct answer
btn.classList.add('correct');
btn.innerHTML += '<span class="check">✓</span>';

// Update stats
correctCount++;
streak++;
wrongCount = Math.max(0, wrongCount - 1); // Reduce wrong count on correct answers

// Reward player
score += 10;
xp += 5;
scoreEl.textContent = score;
xpEl.textContent = xp;
} else {
// Wrong answer
btn.classList.add('incorrect');

// Show correct answer
allButtons.forEach(b => {
if (b.dataset.answer === question.answer) {
b.classList.add('correct');
b.innerHTML += '<span class="check">✓</span>';
}
});

// Update stats
wrongCount++;
streak = 0;

// Lose life
lives--;
if (lives < 0) lives = 0;
livesEl.textContent = lives;

// Check if out of lives
if (lives === 0) {
setTimeout(() => {
showNotification("You've run out of hearts! Let's give you more to continue learning.", "leveldown");
lives = 3;
livesEl.textContent = lives;
}, 500);
}
}

// Update stats display
correctCountEl.textContent = correctCount;
wrongCountEl.textContent = wrongCount;
streakCountEl.textContent = streak;

// Update user progress in database if logged in
if (currentUser) {
updateUserProgress(question, option === question.answer);
}
});

optionsEl.appendChild(btn);
});

questionsAnswered = false;
}

// Start quiz with selected topics/levels
function startQuiz() {
// Filter questions based on selected mode
if (selectedMode === 'topics') {
filteredQuestions = filterQuestionsByTopics();
} else { // levels mode
filteredQuestions = filterQuestionsByLevels();
}

if (filteredQuestions.length === 0) {
showNotification(`No questions match your selection. Please try different ${selectedMode}.`, "leveldown");
return;
}

// Shuffle questions
filteredQuestions.sort(() => Math.random() - 0.5);

// Reset quiz state
currentQuestionIndex = 0;

updateQuizModeDisplay();

// Update quiz description
if (selectedMode === 'topics') {
if (selectedTopics.length === 0) {
levelNameEl.innerHTML = 'Python Practice <span class="level-badge">All Topics</span>';
levelDescEl.textContent = "Practice all Python topics";
} else {
levelNameEl.innerHTML = 'Custom Practice <span class="level-badge">Selected Topics</span>';
levelDescEl.textContent = `Practice your selected Python topics`;
}
} else { // levels mode
if (selectedLevels.length === 0) {
levelNameEl.innerHTML = 'Python Practice <span class="level-badge">All Levels</span>';
levelDescEl.textContent = "Practice questions from all levels";
} else if (selectedLevels.length === 1) {
const level = levels.find(l => l.id === selectedLevels[0]);
levelNameEl.innerHTML = `${level.title} <span class="level-badge">Level ${level.id}</span>`;
levelDescEl.textContent = level.description;
} else {
levelNameEl.innerHTML = 'Mixed Levels <span class="level-badge">Multiple</span>';
levelDescEl.textContent = "Practice questions from your selected levels";
}
}

// Show quiz container
selectionScreen.classList.add('hidden');
quizContainer.classList.remove('hidden');

// Load first question
loadQuestion();
}

// Switch between topic and level selection modes
function switchMode(mode) {
selectedMode = mode;

// Update UI
modeTabs.forEach(tab => {
if (tab.dataset.mode === mode) {
tab.classList.add('active');
} else {
tab.classList.remove('active');
}
});

// Show/hide appropriate panels
if (mode === 'topics') {
topicsPanel.classList.remove('hidden');
levelsPanel.classList.add('hidden');
rankedPanel.classList.add('hidden');
startBtn.classList.remove('hidden');
startRankedBtn.classList.add('hidden');

// Clear selected levels
document.querySelectorAll('#levels-grid .level-card').forEach(card => {
card.classList.remove('selected');
});
selectedLevels = [];
} else if (mode === 'levels') {
topicsPanel.classList.add('hidden');
levelsPanel.classList.remove('hidden');
rankedPanel.classList.add('hidden');
startBtn.classList.remove('hidden');
startRankedBtn.classList.add('hidden');

// Clear selected topics
document.querySelectorAll('.topic-item').forEach(item => {
item.classList.remove('selected');
});
selectedTopics = [];
} else if (mode === 'ranked') {
topicsPanel.classList.add('hidden');
levelsPanel.classList.add('hidden');
rankedPanel.classList.remove('hidden');
startBtn.classList.add('hidden');
startRankedBtn.classList.remove('hidden');

// Clear selections
selectedTopics = [];
selectedLevels = [];

// Fetch user rank and leaderboard
fetchUserRank();
fetchLeaderboard();
}

updateSelectionSummary();
}

// Handle logout
function handleLogout() {
localStorage.removeItem('user');
window.location.href = '/login.html';
}

// Fetch user's current rank from server
function fetchUserRank() {
if (!currentUser) return;

// Show loading state
const rankBadge = document.getElementById('user-rank-badge');
rankBadge.textContent = 'Loading...';

fetch(`/api/rank/${currentUser.id}`)
.then(response => {
if (!response.ok) {
throw new Error(`HTTP error! Status: ${response.status}`);
}
return response.json();
})
.then(data => {
if (data.success) {
userRankPoints = data.rankPoints || 0;
console.log('Fetched user rank points:', userRankPoints);
updateUserRankDisplay(userRankPoints);
} else {
console.error('Error in rank response:', data.message);
// Fall back to default rank display
updateUserRankDisplay(0);
}
})
.catch(error => {
console.error('Error fetching user rank:', error);
// Fall back to default rank display in case of errors
updateUserRankDisplay(0);
});
}

// Update the user's rank display based on points
function updateUserRankDisplay(points) {
const rankBadge = document.getElementById('user-rank-badge');
const rankPoints = document.getElementById('rank-points');

// Ensure points is a number
points = Number(points) || 0;

// Determine user's rank based on points
let currentRank = ranks[0]; // Default to lowest rank

for (let i = ranks.length - 1; i >= 0; i--) {
if (points >= ranks[i].threshold) {
currentRank = ranks[i];
break;
}
}

userRank = currentRank.name;

// Update UI
rankBadge.textContent = currentRank.name;
rankBadge.className = 'rank-badge ' + currentRank.color;
rankPoints.textContent = points + ' points';

// Debug log to verify the rank is being set correctly
console.log(`User rank updated: ${currentRank.name} (${points} points)`);
}

// Fetch leaderboard data from server
function fetchLeaderboard() {
const leaderboardList = document.getElementById('leaderboard-list');
leaderboardList.innerHTML = '<div class="loading-spinner">Loading...</div>';

fetch('/api/leaderboard')
.then(response => {
if (!response.ok) {
throw new Error(`HTTP error! Status: ${response.status}`);
}
return response.json();
})
.then(data => {
if (data.success) {
console.log('Leaderboard data received:', data);
displayLeaderboard(data.leaderboard);
} else {
console.error('Error in leaderboard response:', data.message);
leaderboardList.innerHTML = 'Failed to load leaderboard: ' + data.message;
}
})
.catch(error => {
console.error('Error fetching leaderboard:', error);
leaderboardList.innerHTML = 'Failed to load leaderboard. Please try again.';
});
}

// Display leaderboard data
function displayLeaderboard(leaderboard) {
const leaderboardList = document.getElementById('leaderboard-list');
leaderboardList.innerHTML = '';

if (!leaderboard || leaderboard.length === 0) {
leaderboardList.innerHTML = '<div class="loading-spinner">No ranked data available yet.</div>';
return;
}

// Debug log to check leaderboard data
console.log('Leaderboard data:', leaderboard);

leaderboard.forEach((user, index) => {
// Make sure rank_points exists and is a number
const rankPoints = Number(user.rank_points) || 0;
const userRank = getRankByPoints(rankPoints);

const item = document.createElement('div');
item.className = 'leaderboard-item';

// Highlight current user
if (currentUser && user.id === currentUser.id) {
item.style.backgroundColor = '#f0f8ff';
item.style.fontWeight = '600';
}

item.innerHTML = `
<div class="leaderboard-rank">${index + 1}</div>
<div class="leaderboard-username">${user.username}</div>
<div class="leaderboard-score">${rankPoints}</div>
<div class="leaderboard-user-rank ${userRank.color}" style="background-color: #333;">${userRank.name}</div>
`;

leaderboardList.appendChild(item);
});
}

// Get rank object by points
function getRankByPoints(points) {
// Ensure points is a number
points = Number(points) || 0;

for (let i = ranks.length - 1; i >= 0; i--) {
if (points >= ranks[i].threshold) {
return ranks[i];
}
}
return ranks[0]; // Default to lowest rank
}

// Start a ranked test
function startRankedTest() {
// Hide ranked panel
selectionScreen.classList.add('hidden');

// Show ranked test container
rankedTestContainer.classList.remove('hidden');

// Reset test variables
currentRankedQuestion = 0;
rankedScore = 0;
correctAnswers = 0;
currentDifficulty = "Medium"; // Start with medium difficulty
questionAnswered = false;

// Load adaptive questions
loadAdaptiveQuestions();
}

// Load questions for adaptive test
function loadAdaptiveQuestions() {
// Request adaptive questions from server based on user's rank
fetch('/api/ranked-questions', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
userId: currentUser ? currentUser.id : null,
difficulty: currentDifficulty
})
})
.then(response => response.json())
.then(data => {
if (data.success) {
rankedQuestions = data.questions;
loadRankedQuestion();
} else {
// If API fails, fallback to locally selecting questions
selectFallbackQuestions();
}
})
.catch(error => {
console.error('Error loading ranked questions:', error);
// Fallback
selectFallbackQuestions();
});
}

// Fallback function to select questions locally
function selectFallbackQuestions() {
// Filter questions by difficulty
rankedQuestions = [];

// Combine all questions
const allQuestions = [].concat(...Object.values(questionsByLevel));

// Assign difficulty based on level
const easyQuestions = questionsByLevel[1] || [];
const mediumQuestions = questionsByLevel[2] || [];
const hardQuestions = [].concat(
questionsByLevel[3] || [],
questionsByLevel[4] || []
);

// Start with medium questions
let selectedQuestions = [...mediumQuestions];

// Shuffle and take required number
selectedQuestions = selectedQuestions
.sort(() => Math.random() - 0.5)
.slice(0, rankedQuestionCount);

// Set difficulty property for each question
selectedQuestions.forEach(question => {
question.difficulty = 'medium';
});

rankedQuestions = selectedQuestions;
loadRankedQuestion();
}

// Load the current ranked question
function loadRankedQuestion() {
if (currentRankedQuestion >= rankedQuestions.length || currentRankedQuestion >= rankedQuestionCount) {
// Test is complete
finishRankedTest();
return;
}

const question = rankedQuestions[currentRankedQuestion];
const questionEl = document.getElementById('ranked-question');
const optionsEl = document.getElementById('ranked-options');
const counterEl = document.getElementById('ranked-question-counter');
const difficultyEl = document.getElementById('ranked-question-difficulty');

// Update question text
questionEl.textContent = question.question;

// Update counter
counterEl.textContent = `Question ${currentRankedQuestion + 1} of ${rankedQuestionCount}`;

// Update difficulty badge
difficultyEl.textContent = question.difficulty ? question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1) : 'Medium';
difficultyEl.className = 'difficulty-badge difficulty-' + (question.difficulty || 'medium');

// Update progress bar
const progressPercent = (currentRankedQuestion / rankedQuestionCount) * 100;
document.getElementById('ranked-progress-bar').style.width = `${progressPercent}%`;

// Clear previous options
optionsEl.innerHTML = '';

// Shuffle options
const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5);

// Create option buttons
shuffledOptions.forEach(option => {
const btn = document.createElement('button');
btn.className = 'option';
btn.textContent = option;
btn.dataset.answer = option;

btn.addEventListener('click', () => {
if (questionAnswered) return;

questionAnswered = true;

const allButtons = optionsEl.querySelectorAll('.option');
// Disable all buttons to prevent multiple selections
allButtons.forEach(b => b.disabled = true);

let pointsEarned = 0;

if (option === question.answer) {
// Correct answer
btn.classList.add('correct');
btn.innerHTML += '<span class="check">✓</span>';

// Award points based on difficulty
if (question.difficulty === 'easy') pointsEarned = 10;
else if (question.difficulty === 'medium' || !question.difficulty) pointsEarned = 20;
else if (question.difficulty === 'hard') pointsEarned = 30;

rankedScore += pointsEarned;
correctAnswers++;

// Increase difficulty if doing well
if (currentRankedQuestion > 0 && correctAnswers / (currentRankedQuestion + 1) >= 0.7) {
currentDifficulty = "Hard";
}
} else {
// Wrong answer
btn.classList.add('incorrect');

// Show correct answer
allButtons.forEach(b => {
if (b.dataset.answer === question.answer) {
b.classList.add('correct');
b.innerHTML += '<span class="check">✓</span>';
}
});

// Decrease difficulty if struggling
if (currentRankedQuestion > 1 && correctAnswers / (currentRankedQuestion + 1) <= 0.3) {
currentDifficulty = "Easy";
}
}

// Update score display
document.getElementById('ranked-current-score').textContent = rankedScore;
});

optionsEl.appendChild(btn);
});

questionAnswered = false;
}

// Animate counter for results display
function animateCounter(element, start, end, duration, suffix = '') {
const startTime = performance.now();

function updateCounter(currentTime) {
const elapsedTime = currentTime - startTime;
if (elapsedTime > duration) {
element.textContent = end + suffix;
return;
}

const value = Math.round(start + (end - start) * (elapsedTime / duration));
element.textContent = value + suffix;
requestAnimationFrame(updateCounter);
}

requestAnimationFrame(updateCounter);
}

// Finish the ranked test and show results
function finishRankedTest() {
// Hide test container
rankedTestContainer.classList.add('hidden');

// Show results
rankedResultsContainer.classList.remove('hidden');

// Calculate accuracy
const accuracy = Math.round((correctAnswers / rankedQuestionCount) * 100);

// Update results UI
const finalScoreEl = document.getElementById('ranked-final-score');
const accuracyEl = document.getElementById('ranked-accuracy');
finalScoreEl.textContent = rankedScore;
accuracyEl.textContent = accuracy + '%';

// Animate the counters
animateCounter(finalScoreEl, 0, rankedScore, 1500);
animateCounter(accuracyEl, 0, accuracy, 1500, '%');

// Previous rank
const previousRank = getRankByPoints(userRankPoints);
document.getElementById('previous-rank').textContent = previousRank.name;
document.getElementById('previous-rank').className = previousRank.color;

// Calculate new points and rank
const newPoints = userRankPoints + rankedScore;
const newRank = getRankByPoints(newPoints);

document.getElementById('new-rank').textContent = newRank.name;
document.getElementById('new-rank').className = newRank.color;

// Submit results to server
submitRankedResults(rankedScore, accuracy, newPoints);
}

// Submit ranked test results to server
function submitRankedResults(score, accuracy, newTotalPoints) {
if (!currentUser) return;

fetch('/api/submit-ranked', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
userId: currentUser.id,
score: score,
accuracy: accuracy,
totalPoints: newTotalPoints
})
})
.then(response => response.json())
.then(data => {
if (data.success) {
// Update stored user rank
userRankPoints = newTotalPoints;

// If rank changed, show notification
const previousRank = getRankByPoints(userRankPoints - score);
const newRank = getRankByPoints(userRankPoints);

if (newRank.name !== previousRank.name) {
showNotification(`Congratulations! You've reached ${newRank.name} rank!`, 'levelup');
}
}
})
.catch(error => {
console.error('Error submitting ranked results:', error);
});
}

// Return to ranked panel from results
document.getElementById('back-to-ranked-btn').addEventListener('click', () => {
rankedResultsContainer.classList.add('hidden');
selectionScreen.classList.remove('hidden');
switchMode('ranked'); // Refresh ranked panel and leaderboard
});

// Move to the next ranked question
document.getElementById('ranked-next-btn').addEventListener('click', () => {
if (!questionAnswered && currentRankedQuestion < rankedQuestions.length) {
// If not answered, show warning
showNotification('Please select an answer before continuing', 'leveldown');
return;
}

currentRankedQuestion++;
questionAnswered = false;
loadRankedQuestion();
});

// Event Listeners
// Mode tabs
modeTabs.forEach(tab => {
tab.addEventListener('click', () => {
switchMode(tab.dataset.mode);
});
});

// Start buttons
startBtn.addEventListener('click', () => {
startQuiz();
});

startRankedBtn.addEventListener('click', () => {
startRankedTest();
});

// Next button
nextBtn.addEventListener('click', () => {
currentQuestionIndex++;
loadQuestion();
});

// Back button
backBtn.addEventListener('click', () => {
quizContainer.classList.add('hidden');
selectionScreen.classList.remove('hidden');
});

// Logout button
logoutBtn.addEventListener('click', handleLogout);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
checkLoginStatus();
initTopicSelection();
initLevelSelection();
updateSelectionSummary();
});
