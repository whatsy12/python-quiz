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
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Python Quiz</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');

:root {
--primary: #58cc02;
--primary-hover: #46a302;
--secondary: #fff;
--wrong: #ff4b4b;
--correct: #58cc02;
--neutral: #e5e5e5;
--text: #3c3c3c;
--blue: #1cb0f6;
--hearts: #ff7272;
--xp: #ffc800;
--light-bg: #f7f7f7;
}

* {
box-sizing: border-box;
margin: 0;
padding: 0;
}

body {
font-family: 'Nunito', sans-serif;
background: var(--light-bg);
color: var(--text);
display: flex;
flex-direction: column;
align-items: center;
min-height: 100vh;
margin: 0;
padding: 20px;
transition: background 0.5s ease;
}

#top-bar {
display: flex;
justify-content: space-between;
align-items: center;
width: 100%;
max-width: 800px;
margin-bottom: 15px;
padding: 10px 0;
}

.progress-container {
flex-grow: 1;
height: 15px;
background: var(--neutral);
border-radius: 10px;
margin: 0 15px;
overflow: hidden;
}

.progress-bar {
height: 100%;
background: var(--primary);
width: 0%;
transition: width 0.5s ease;
border-radius: 10px;
}

.stats {
display: flex;
gap: 15px;
}

.stat {
display: flex;
align-items: center;
font-weight: bold;
}

.stat-icon {
margin-right: 5px;
font-size: 20px;
}

#lives {
color: var(--hearts);
}

#xp {
color: var(--xp);
}

#score {
color: var(--blue);
}

#quiz-container {
background: white;
padding: 25px;
border-radius: 20px;
box-shadow: 0 10px 30px rgba(0,0,0,0.08);
width: 800px;
max-width: 100%;
position: relative;
margin-bottom: 20px;
}

#question-area {
padding: 15px;
margin-bottom: 20px;
border-radius: 12px;
background: #f9fafc;
}

#question {
font-size: 1.4rem;
font-weight: 700;
margin-bottom: 10px;
line-height: 1.4;
}

#options {
display: grid;
grid-template-columns: 1fr;
gap: 10px;
}

.option {
display: block;
width: 100%;
padding: 15px;
background: var(--secondary);
border: 2px solid var(--neutral);
border-radius: 12px;
cursor: pointer;
color: var(--text);
font-size: 1.1rem;
font-weight: 600;
transition: all 0.2s ease;
text-align: left;
font-family: 'Nunito', sans-serif;
position: relative;
}

.option:hover {
border-color: var(--blue);
background: #f0f8ff;
}

.option:active {
transform: scale(0.98);
}

.option.correct {
background: var(--correct) !important;
color: white;
border-color: var(--correct);
}

.option.incorrect {
background: var(--wrong) !important;
color: white;
border-color: var(--wrong);
}

.option .check {
position: absolute;
right: 15px;
top: 50%;
transform: translateY(-50%);
font-size: 1.2rem;
display: none;
}

.option.correct .check {
display: inline;
}

#next-btn, .action-btn {
width: 100%;
padding: 15px;
background: var(--primary);
color: white;
border: none;
border-radius: 12px;
cursor: pointer;
font-weight: 800;
font-size: 1.1rem;
transition: all 0.2s ease;
font-family: 'Nunito', sans-serif;
box-shadow: 0 4px 0 var(--primary-hover);
margin-top: 15px;
}

#next-btn:hover, .action-btn:hover {
background: var(--primary-hover);
transform: translateY(-2px);
}

#next-btn:active, .action-btn:active {
transform: translateY(2px);
box-shadow: 0 0 0 var(--primary-hover);
}

#back-btn {
background: #f0f0f0;
color: #333;
box-shadow: 0 4px 0 #ccc;
}

#back-btn:hover {
background: #e0e0e0;
}

#level-info {
text-align: center;
margin-bottom: 20px;
width: 100%;
max-width: 800px;
padding: 10px;
border-radius: 12px;
background: white;
box-shadow: 0 5px 15px rgba(0,0,0,0.05);
}

#level-name {
font-weight: 800;
color: var(--blue);
font-size: 1.2rem;
margin-bottom: 5px;
}

#level-description {
font-size: 0.9rem;
color: #666;
}

.level-badge {
display: inline-block;
background: var(--blue);
color: white;
font-weight: bold;
padding: 5px 10px;
border-radius: 15px;
font-size: 0.8rem;
margin-left: 8px;
}

#notification {
position: fixed;
top: 20px;
right: 20px;
background: white;
padding: 15px 20px;
border-radius: 10px;
box-shadow: 0 5px 15px rgba(0,0,0,0.1);
display: none;
z-index: 100;
transition: all 0.3s ease;
transform: translateX(150%);
}

#notification.show {
transform: translateX(0);
display: block;
}

.notification-levelup {
border-left: 4px solid var(--primary);
}

.notification-leveldown {
border-left: 4px solid var(--wrong);
}

.code-example {
background: #f0f3f8;
padding: 12px;
border-radius: 8px;
font-family: monospace;
margin: 10px 0;
white-space: pre-wrap;
}

#stats-display {
background: white;
padding: 12px 20px;
border-radius: 12px;
margin-bottom: 15px;
width: 100%;
max-width: 800px;
display: flex;
justify-content: space-between;
box-shadow: 0 5px 15px rgba(0,0,0,0.05);
}

.questions-counter {
font-size: 0.9rem;
color: #666;
text-align: center;
margin-top: 5px;
}

/* Selection screen styles */
#selection-screen {
background: white;
padding: 25px;
border-radius: 20px;
box-shadow: 0 10px 30px rgba(0,0,0,0.08);
width: 800px;
max-width: 100%;
position: relative;
margin-bottom: 20px;
}

#selection-header {
font-size: 1.4rem;
font-weight: 700;
margin-bottom: 20px;
color: var(--blue);
text-align: center;
}

.selection-group {
max-height: 280px;
overflow-y: auto;
padding: 10px;
border: 1px solid #e0e0e0;
border-radius: 5px;
margin-bottom: 20px;
}

.selection-title {
font-weight: 700;
margin-bottom: 10px;
font-size: 1.1rem;
color: var(--text);
}

.topic-grid {
display: grid;
grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
gap: 10px;
margin-bottom: 20px;
}

.topic-item {
display: flex;
align-items: center;
padding: 12px;
background: #f0f8ff;
border-radius: 8px;
cursor: pointer;
transition: all 0.2s ease;
}

.topic-item:hover {
background: #e0f0ff;
transform: translateY(-2px);
}

.topic-item.selected {
background: #bbdefb;
border: 2px solid var(--blue);
}

.topic-badge {
display: inline-block;
background: var(--blue);
color: white;
font-size: 0.8rem;
padding: 3px 8px;
border-radius: 10px;
margin-left: auto;
}

.mode-badge {
display: inline-block;
font-size: 0.9rem;
padding: 3px 8px;
border-radius: 10px;
margin-right: 5px;
background: #e0f0ff;
color: var(--blue);
}

#quiz-mode-display {
text-align: center;
margin: 10px 0;
font-weight: 600;
font-size: 0.9rem;
color: var(--blue);
}

.selections-summary {
background: #f9fafc;
padding: 15px;
border-radius: 8px;
margin: 15px 0;
font-size: 0.9rem;
text-align: center;
}

.hidden {
display: none;
}

/* Selection mode tabs */
.mode-tabs {
display: flex;
margin-bottom: 20px;
border-bottom: 2px solid #e0e0e0;
}

.tab {
padding: 10px 20px;
cursor: pointer;
font-weight: 700;
position: relative;
}

.tab.active {
color: var(--blue);
}

.tab.active:after {
content: '';
position: absolute;
bottom: -2px;
left: 0;
width: 100%;
height: 3px;
background: var(--blue);
}

/* Level selection styles */
.level-grid {
display: grid;
grid-template-columns: 1fr;
gap: 15px;
margin-bottom: 20px;
}

.level-card {
background: white;
border-radius: 10px;
overflow: hidden;
box-shadow: 0 3px 10px rgba(0,0,0,0.1);
cursor: pointer;
transition: all 0.2s ease;
}

.level-card:hover {
transform: translateY(-3px);
box-shadow: 0 5px 15px rgba(0,0,0,0.15);
}

.level-card.selected {
border: 2px solid var(--blue);
}

.level-header {
background: #e8f5e9;
padding: 12px 15px;
display: flex;
justify-content: space-between;
align-items: center;
}

.level-card:nth-child(2) .level-header {
background: #e3f2fd;
}

.level-card:nth-child(3) .level-header {
background: #ede7f6;
}

.level-card:nth-child(4) .level-header {
background: #fff8e1;
}

.level-title {
font-weight: 800;
font-size: 1.1rem;
}

.level-count {
background: rgba(0,0,0,0.1);
padding: 3px 8px;
border-radius: 10px;
font-size: 0.8rem;
font-weight: 700;
}

.level-desc {
padding: 12px 15px;
color: #666;
font-size: 0.9rem;
}

.level-topics {
padding: 0 15px 15px;
display: flex;
flex-wrap: wrap;
gap: 5px;
}

.level-topic {
background: #f0f0f0;
padding: 3px 8px;
border-radius: 15px;
font-size: 0.8rem;
}

/* User profile and header styles */
#user-header {
display: flex;
justify-content: space-between;
align-items: center;
width: 100%;
max-width: 800px;
margin-bottom: 15px;
}

#user-info {
display: flex;
align-items: center;
}

#user-avatar {
width: 40px;
height: 40px;
background-color: var(--blue);
color: white;
border-radius: 50%;
display: flex;
align-items: center;
justify-content: center;
font-weight: bold;
font-size: 1.2rem;
margin-right: 10px;
}

#user-name {
font-weight: bold;
font-size: 1.1rem;
}

#logout-btn {
background-color: #f0f0f0;
color: var(--text);
padding: 8px 15px;
border: none;
border-radius: 8px;
cursor: pointer;
font-weight: 600;
font-size: 0.9rem;
transition: all 0.2s ease;
}

#logout-btn:hover {
background-color: #e0e0e0;
}

/* Mobile responsiveness */
@media (max-width: 600px) {
.topic-grid {
grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
gap: 5px;
}
}

/* Ranked Mode Styles */
.ranked-header {
display: flex;
justify-content: center;
margin-bottom: 20px;
}

.user-rank {
background: white;
padding: 15px;
border-radius: 10px;
text-align: center;
box-shadow: 0 3px 10px rgba(0,0,0,0.1);
width: 60%;
}

.rank-title {
font-size: 0.9rem;
color: #666;
margin-bottom: 5px;
}

.rank-badge {
font-weight: 800;
font-size: 1.4rem;
margin-bottom: 5px;
}

/* Different rank colors */
.rank-bronze {
color: #cd7f32;
}

.rank-silver {
color: #c0c0c0;
}

.rank-gold {
color: #ffd700;
}

.rank-platinum {
color: #e5e4e2;
}

.rank-diamond {
color: #b9f2ff;
}

.rank-points {
font-size: 0.9rem;
color: #666;
}

.leaderboard {
background: white;
padding: 15px;
border-radius: 10px;
margin-bottom: 20px;
box-shadow: 0 3px 10px rgba(0,0,0,0.1);
}

.leaderboard h3 {
text-align: center;
margin-bottom: 15px;
color: var(--blue);
}

.leaderboard-list {
max-height: 250px;
overflow-y: auto;
}

.leaderboard-item {
display: flex;
justify-content: space-between;
padding: 8px 10px;
border-bottom: 1px solid #eee;
align-items: center;
}

.leaderboard-item:last-child {
border-bottom: none;
}

.leaderboard-rank {
font-weight: bold;
width: 30px;
}

.leaderboard-username {
flex-grow: 1;
margin-left: 10px;
}

.leaderboard-score {
font-weight: bold;
color: var(--blue);
}

.leaderboard-user-rank {
font-size: 0.8rem;
padding: 2px 6px;
border-radius: 10px;
margin-left: 10px;
color: white;
}

.loading-spinner {
text-align: center;
padding: 20px;
color: #888;
}

.ranked-info {
margin-bottom: 20px;
}

.difficulty-badge {
display: inline-block;
padding: 4px 8px;
border-radius: 8px;
font-size: 0.8rem;
font-weight: bold;
color: white;
}

.difficulty-easy {
background-color: #58cc02;
}

.difficulty-medium {
background-color: #ffc800;
}

.difficulty-hard {
background-color: #ff4b4b;
}

.ranked-test-header {
display: flex;
justify-content: space-between;
margin-bottom: 15px;
background: white;
padding: 10px 15px;
border-radius: 10px;
box-shadow: 0 3px 10px rgba(0,0,0,0.1);
}

#ranked-question-area {
padding: 15px;
margin-bottom: 20px;
border-radius: 12px;
background: #f9fafc;
}

.results-summary {
display: flex;
justify-content: space-around;
margin: 20px 0;
}

.result-score, .result-accuracy {
text-align: center;
padding: 15px;
background: white;
border-radius: 10px;
width: 45%;
box-shadow: 0 3px 10px rgba(0,0,0,0.1);
}

.result-label {
font-size: 0.9rem;
color: #666;
margin-bottom: 5px;
}

.result-value {
font-size: 1.8rem;
font-weight: 800;
color: var(--blue);
}

.rank-change {
background: white;
padding: 15px;
border-radius: 10px;
margin: 20px 0;
text-align: center;
box-shadow: 0 3px 10px rgba(0,0,0,0.1);
}

.rank-label {
font-size: 0.9rem;
color: #666;
margin-bottom: 10px;
}

.rank-change-display {
font-size: 1.3rem;
font-weight: 800;
}

.rank-arrow {
margin: 0 10px;
color: #666;
}

/* Improved Test UI Styles */
#ranked-test-container {
background: white;
padding: 25px;
border-radius: 20px;
box-shadow: 0 10px 30px rgba(0,0,0,0.08);
width: 800px;
max-width: 100%;
position: relative;
margin-bottom: 20px;
}

.ranked-test-header {
background: #f0f8ff;
margin: -25px -25px 20px -25px;
padding: 15px 25px;
border-radius: 20px 20px 0 0;
border-bottom: 2px solid #e0e0ff;
}

.ranked-test-progress {
height: 8px;
background: var(--neutral);
border-radius: 4px;
margin: 10px 0;
overflow: hidden;
}

.ranked-test-progress-bar {
height: 100%;
background: var(--blue);
width: 0%;
transition: width 0.5s ease;
border-radius: 4px;
}

.difficulty-badge {
font-size: 0.9rem;
padding: 4px 10px;
margin-bottom: 8px;
}

#ranked-options {
display: grid;
grid-gap: 12px;
margin: 20px 0;
}

#ranked-options .option {
padding: 15px;
font-size: 1.1rem;
}

.option.correct {
transform: translateY(-2px);
transition: all 0.3s ease;
}

.option.incorrect {
transform: translateY(-2px);
transition: all 0.3s ease;
}

.ranked-controls {
display: flex;
justify-content: space-between;
margin-top: 20px;
}

#ranked-next-btn {
background: var(--blue);
box-shadow: 0 4px 0 #0b91d3;
padding: 15px 25px;
font-size: 1.1rem;
}

#ranked-next-btn:hover {
background: #0b91d3;
}

/* Results screen improvements */
#ranked-results {
background: white;
padding: 30px;
border-radius: 20px;
box-shadow: 0 10px 30px rgba(0,0,0,0.08);
width: 800px;
max-width: 100%;
position: relative;
margin-bottom: 20px;
}

#ranked-results h2 {
color: var(--blue);
font-size: 1.8rem;
margin-bottom: 25px;
}

.results-summary {
gap: 20px;
}

.result-score, .result-accuracy {
padding: 20px;
border-radius: 15px;
box-shadow: 0 5px 15px rgba(0,0,0,0.05);
transition: transform 0.3s ease;
}

.result-score:hover, .result-accuracy:hover {
transform: translateY(-5px);
}

.result-value {
font-size: 2.2rem;
}

.rank-change {
margin: 30px 0;
padding: 25px;
border-radius: 15px;
background: linear-gradient(to right, #f9f9f9, #f0f8ff);
}

.rank-change-display {
font-size: 1.5rem;
margin-top: 10px;
}

.rank-arrow {
display: inline-block;
margin: 0 15px;
font-size: 1.8rem;
color: #999;
animation: pulse 1.5s infinite;
}

@keyframes pulse {
0% { transform: scale(1); }
50% { transform: scale(1.1); }
100% { transform: scale(1); }
}

.info-box {
background-color: #e7f5ff;
padding: 15px;
border-radius: 10px;
margin-bottom: 20px;
font-size: 0.95rem;
line-height: 1.5;
}
</style>
</head>
<body>
<!-- Not logged in message -->
<div id="not-logged-in" class="hidden">
<h2>Please log in to access the quiz</h2>
<a href="login.html" class="action-btn">Log In</a>
</div>

<!-- Main Quiz App - Only shown when logged in -->
<div id="quiz-app" class="hidden">
<!-- User Profile Header -->
<div id="user-header">
<div id="user-info">
<div id="user-avatar">U</div>
<span id="user-name">Username</span>
</div>
<button id="logout-btn">Logout</button>
</div>

<div id="top-bar">
<div class="stat" id="lives">
<span class="stat-icon">❤️</span>
<span class="stat-value">3</span>
</div>
<div class="progress-container">
<div class="progress-bar" id="progress-bar"></div>
</div>
<div class="stat" id="score">
<span class="stat-icon">🏆</span>
<span class="stat-value">0</span>
</div>
<div class="stat" id="xp">
<span class="stat-icon">⭐</span>
<span class="stat-value">0</span>
</div>
</div>

<div id="level-info">
<div id="level-name">Python Practice <span class="level-badge">Custom</span></div>
<div id="level-description">Practice your Python knowledge with selected topics</div>
<div class="questions-counter">Question <span id="question-number">1</span> of <span id="total-questions">0</span></div>
</div>

<div id="stats-display">
<div>Correct: <span id="correct-count">0</span></div>
<div>Streak: <span id="streak-count">0</span></div>
<div>Wrong: <span id="wrong-count">0</span></div>
</div>

<!-- Selection Screen -->
<div id="selection-screen">
<div id="selection-header">Choose How You Want to Practice</div>

<div class="mode-tabs">
<div class="tab active" data-mode="topics">Practice by Topics</div>
<div class="tab" data-mode="levels">Practice by Levels</div>
<div class="tab" data-mode="ranked">Ranked Mode</div>
</div>

<!-- Topics Selection -->
<div id="topics-panel">
<div class="selection-group">
<div class="selection-title">Python Functions</div>
<div class="topic-grid" id="functions-grid">
<!-- Function topics will be added here -->
</div>

<div class="selection-title">Python Concepts</div>
<div class="topic-grid" id="concepts-grid">
<!-- Concept topics will be added here -->
</div>
</div>
</div>

<!-- Levels Selection -->
<div id="levels-panel" class="hidden">
<div class="level-grid" id="levels-grid">
<!-- Level cards will be added here -->
</div>
</div>

<!-- Ranked Mode Panel -->
<div id="ranked-panel" class="hidden">
<div class="ranked-header">
<div class="user-rank">
<div class="rank-title">Your Rank</div>
<div class="rank-badge" id="user-rank-badge">Unranked</div>
<div class="rank-points" id="rank-points">0 points</div>
</div>
</div>

<div class="leaderboard">
<h3>Leaderboard</h3>
<div class="leaderboard-list" id="leaderboard-list">
<div class="loading-spinner">Loading...</div>
</div>
</div>

<div class="ranked-info">
<div class="info-box">
<p>Ranked mode tests your Python knowledge with adaptive questions. Your performance will determine your rank on the leaderboard.</p>
<p>A ranked test consists of 10 questions of varying difficulty.</p>
</div>
</div>
</div>

<div class="selections-summary" id="selections-summary">
Select topics or levels to practice
</div>

<button class="action-btn" id="start-btn">START PRACTICING</button>
<button class="action-btn hidden" id="start-ranked-btn">START RANKED TEST</button>
</div>

<!-- Quiz Container -->
<div id="quiz-container" class="hidden">
<div id="quiz-mode-display"></div>
<div id="question-area">
<h2 id="question">Loading your question...</h2>
</div>

<div id="options"></div>
<button id="next-btn">NEXT QUESTION</button>
<button class="action-btn" id="back-btn">CHANGE SELECTION</button>
</div>

<!-- Ranked Test Container -->
<div id="ranked-test-container" class="hidden">
<div class="ranked-test-header">
<div class="ranked-test-info">
<div id="ranked-question-difficulty" class="difficulty-badge difficulty-medium">Medium</div>
<div id="ranked-question-counter">Question 1 of 10</div>
</div>
<div class="ranked-test-score">
Score: <span id="ranked-current-score">0</span>
</div>
</div>

<div class="ranked-test-progress">
<div class="ranked-test-progress-bar" id="ranked-progress-bar"></div>
</div>

<div id="ranked-question-area">
<h2 id="ranked-question">Loading question...</h2>
</div>

<div id="ranked-options"></div>

<div class="ranked-controls">
<button id="ranked-next-btn" class="btn">NEXT QUESTION</button>
</div>
</div>

<!-- Ranked Results Screen -->
<div id="ranked-results" class="hidden">
<h2>Ranked Test Results</h2>

<div class="results-summary">
<div class="result-score">
<div class="result-label">Score</div>
<div class="result-value" id="ranked-final-score">0</div>
</div>
<div class="result-accuracy">
<div class="result-label">Accuracy</div>
<div class="result-value" id="ranked-accuracy">0%</div>
</div>
</div>

<div class="rank-change">
<div class="rank-label">Your Rank</div>
<div class="rank-change-display">
<span id="previous-rank">Unranked</span>
<span class="rank-arrow">→</span>
<span id="new-rank">Bronze</span>
</div>
</div>

<button class="action-btn" id="back-to-ranked-btn">BACK TO RANKED</button>
</div>

<div id="notification"></div>
</div>

<script>
// DOM Elements
const notLoggedInEl = document.getElementById('not-logged-in');
const quizAppEl = document.getElementById('quiz-app');
const selectionScreen = document.getElementById('selection-screen');
const quizContainer = document.getElementById('quiz-container');
const topicsPanel = document.getElementById('topics-panel');
const levelsPanel = document.getElementById('levels-panel');
const rankedPanel = document.getElementById('ranked-panel');
const functionsGrid = document.getElementById('functions-grid');
const conceptsGrid = document.getElementById('concepts-grid');
const levelsGrid = document.getElementById('levels-grid');
const modeTabs = document.querySelectorAll('.tab');
const startBtn = document.getElementById('start-btn');
const startRankedBtn = document.getElementById('start-ranked-btn');
const nextBtn = document.getElementById('next-btn');
const backBtn = document.getElementById('back-btn');
const selectionsText = document.getElementById('selections-summary');
const quizModeDisplay = document.getElementById('quiz-mode-display');
const levelNameEl = document.getElementById('level-name');
const levelDescEl = document.getElementById('level-description');
const questionEl = document.getElementById('question');
const optionsEl = document.getElementById('options');
const progressBarEl = document.getElementById('progress-bar');
const scoreEl = document.querySelector('#score .stat-value');
const xpEl = document.querySelector('#xp .stat-value');
const livesEl = document.querySelector('#lives .stat-value');
const correctCountEl = document.getElementById('correct-count');
const wrongCountEl = document.getElementById('wrong-count');
const streakCountEl = document.getElementById('streak-count');
const questionNumberEl = document.getElementById('question-number');
const totalQuestionsEl = document.getElementById('total-questions');
const notificationEl = document.getElementById('notification');
const userAvatarEl = document.getElementById('user-avatar');
const userNameEl = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');
const rankedTestContainer = document.getElementById('ranked-test-container');
const rankedResultsContainer = document.getElementById('ranked-results');

// Level definitions
const levels = [
{
id: 1,
title: "Level 1: Basics",
description: "Learn the fundamental concepts of Python",
topics: ["function", "list", "string", "types", "len", "print"],
color: "#e8f5e9"
},
{
id: 2,
title: "Level 2: Data Structures",
description: "Learn about lists, tuples, and operations",
topics: ["list", "tuple", "function", "max", "min", "sorted", "sum"],
color: "#e3f2fd"
},
{
id: 3,
title: "Level 3: Advanced Functions",
description: "Master more complex Python functions",
topics: ["all", "any", "zip", "function", "map"],
color: "#ede7f6"
},
{
id: 4,
title: "Level 4: Expert Concepts",
description: "Learn about references and complex structures",
topics: ["references", "list", "function"],
color: "#fff8e1"
}
];

// Quiz data - Questions are categorized by level
const questionsByLevel = {
1: [
{
question: "What does the len() function return?",
options: ["The type of a variable", "The number of items in an object", "The last item of a list", "The largest value"],
answer: "The number of items in an object",
topics: ["len", "function"]
},
{
question: "Which function returns the largest item from an iterable?",
options: ["min()", "sum()", "max()", "top()"],
answer: "max()",
topics: ["max", "function"]
},
{
question: "Which function returns the smallest item from an iterable?",
options: ["min()", "lowest()", "smallest()", "reduce()"],
answer: "min()",
topics: ["min", "function"]
},
{
question: "Which function returns the total of all items in a list of numbers?",
options: ["sum()", "total()", "add()", "combine()"],
answer: "sum()",
topics: ["sum", "list", "function"]
},
{
question: "What does the all() function return?",
options: ["True if any element is true", "True if all elements are true", "Sum of all elements", "List of all elements"],
answer: "True if all elements are true",
topics: ["all", "function"]
},
{
question: "What does the any() function return?",
options: ["True if all elements are true", "True if any element is true", "List of all true elements", "False if list is empty"],
answer: "True if any element is true",
topics: ["any", "function"]
},
{
question: "What does the zip() function return?",
options: ["A combined list", "A merged copy of the list", "The first element", "An iterator object"],
answer: "An iterator object",
topics: ["zip", "function"]
},
{
question: "Select the output for this code: print(list(range(5)))",
options: ["[0, 1, 2, 3, 4]", "[1, 2, 3, 4, 5]", "[0, 1, 2, 3, 4, 5]", "[5, 4, 3, 2, 1]"],
answer: "[0, 1, 2, 3, 4]",
topics: ["range", "list", "function"]
},
{
question: "What does sorted([3, 1, 2]) return?",
options: ["[1, 2, 3]", "[3, 1, 2]", "[3, 2, 1]", "An iterator that can be changed into a list"],
answer: "[1, 2, 3]",
topics: ["sorted", "list", "function"]
},
{
question: "What is the purpose of the zip() function?",
options: ["Combine two lists element-wise", "Sort a list", "Compress a file", "Split a string"],
answer: "Combine two lists element-wise",
topics: ["zip", "list", "function"]
},
{
question: "What is the keyword used to start a loop in Python?",
options: ["loop", "repeat", "for", "iterate"],
answer: "for",
topics: ["loop"]
},
{
question: "What does type(5) return?",
options: ["'int'", "'float'", "'str'", "'bool'"],
answer: "'int'",
topics: ["type", "function"]
},
{
question: "Which of these is a Python datatype?",
options: ["number", "character", "list", "letter"],
answer: "list",
topics: ["list"]
},
{
question: "How do you define a list in Python?",
options: ["{}", "()", "[]", "<>"],
answer: "[]",
topics: ["list"]
},
{
question: "What is a double list?",
options: ["A list with duplicate values", "A list of lists", "A list multiplied by 2", "A sorted list"],
answer: "A list of lists",
topics: ["list"]
},
{
question: "Which of these is a string in Python?",
options: ["123", "'hello'", "True", "False"],
answer: "'hello'",
topics: ["string"]
},
{
question: "How do you take input from the user in Python?",
options: ["scan()", "input()", "get()", "read()"],
answer: "input()",
topics: ["input", "function"]
},
{
question: "What does print('Hello') do?",
options: ["Returns Hello", "Prints Hello to console", "Stores Hello", "Saves Hello to a file"],
answer: "Prints Hello to console",
topics: ["print", "function", "string"]
},
{
question: "Which function gives the number of characters in a string?",
options: ["count()", "charcount()", "len()", "strcount()"],
answer: "len()",
topics: ["len", "string", "function"]
},
{
question: "Which of the following loops through a list?",
options: ["for item in list:", "loop item in list:", "iterate list for item:", "item in list.for():"],
answer: "for item in list:",
topics: ["loop", "list"]
},
{
question: "What will len([1, 2, [3, 4]]) return?",
options: ["4", "3", "2", "5"],
answer: "3",
topics: ["len", "list", "function"]
},
{
question: "What is the output of sum([1, 2, 3])?",
options: ["6", "123", "1", "Error"],
answer: "6",
topics: ["sum", "list", "function"]
},
{
question: "Which function will sort a list in descending order?",
options: ["sorted(l, reverse=True)", "sorted(l, reverse=False)", "reversed(sorted(l))", "sort_desc(l)"],
answer: "sorted(l, reverse=True)",
topics: ["sorted", "list", "function"]
},
{
question: "How do you join two lists element-wise in Python?",
options: ["merge()", "zip()", "join()", "combine()"],
answer: "zip()",
topics: ["zip", "list", "function"]
},
{
question: "What does type('123') return?",
options: ["int", "float", "str", "list"],
answer: "str",
topics: ["type", "string", "function"]
},
{
question: "Which of the following is a list?",
options: ["(1, 2, 3)", "[1, 2, 3]", "'1, 2, 3'", "{1, 2, 3}"],
answer: "[1, 2, 3]",
topics: ["list"]
},
{
question: "How do you access the second item in a list 'my_list'?",
options: ["my_list[1]", "my_list(2)", "my_list{1}", "my_list.2"],
answer: "my_list[1]",
topics: ["list"]
},
{
question: "What is the output of max([3, 6, 1])?",
options: ["3", "6", "1", "Error"],
answer: "6",
topics: ["max", "list", "function"]
},
{
question: "What is the result of any([False, True, False])?",
options: ["False", "True", "None", "Error"],
answer: "True",
topics: ["any", "function"]
},
{
question: "What is the result of all([True, True, False])?",
options: ["True", "False", "None", "Error"],
answer: "False",
topics: ["all", "function"]
},
{
question: "How do you define a tuple in Python?",
options: ["[]", "()", "{}", "<>"],
answer: "()",
topics: ["tuple"]
},
{
question: "What does range(3) return?",
options: ["[1, 2, 3]", "[0, 1, 2]", "[0, 1, 2, 3]", "None of the answers"],
answer: "None of the answers",
topics: ["range", "function"]
},
{
question: "How do you convert a string '123' to an integer?",
options: ["str('123')", "int('123')", "float('123')", "eval('123')"],
answer: "int('123')",
topics: ["int", "string", "function"]
},
{
question: "What is the result of reversed([1, 2, 3])?",
options: ["[3, 2, 1]", "reversed iterator object", "Error", "None"],
answer: "reversed iterator object",
topics: ["reversed", "list", "function"]
},
{
question: "Which method would you use to get the last character of a string?",
options: ["str[-1]", "str[len(str)]", "str.last()", "str.end()"],
answer: "str[-1]",
topics: ["string"]
},
{
question: "Which function helps you identify the data type of a value?",
options: ["what()", "typeof()", "type()", "gettype()"],
answer: "type()",
topics: ["type", "function"]
},
{
question: "What is the result of 'hello' + 'world'?",
options: ["'helloworld'", "'hello world'", "'hello+world'", "Error"],
answer: "'helloworld'",
topics: ["string"]
},
{
question: "What is a correct way to loop through a list called 'items'?",
options: ["for i in items", "foreach i in items", "loop items", "items.forEach()"],
answer: "for i in items",
topics: ["loop", "list"]
},
{
question: "How do you print each element in a list on a new line?",
options: [
"print(list)",
"for i in list: print(i)",
"print(*list)",
"print(list, sep='\\n')"
],
answer: "for i in list: print(i)",
topics: ["print", "list", "loop", "function"]
},
{
question: "Which of the following creates a list with numbers 0 to 4?",
options: ["sorted(1, 2, 4, 0, 3)", "[0, 1, 2, 3, 4]", "list(range(5))", "All of the above"],
answer: "All of the above",
topics: ["list", "range", "sorted", "function"]
}
],
2: [
{
question: "What is the result of: all([0, 1, 2])?",
options: ["True", "False", "Error", "None"],
answer: "False",
topics: ["all", "list", "function"]
},
{
question: "Which of the following will NOT cause a TypeError?",
options: ["sum([1, 2, '3'])", "'5' + 5", "'a' * 3", "max([1, '2'])"],
answer: "'a' * 3",
topics: ["string", "type"]
},
{
question: "What is the output of len([[]])?",
options: ["0", "1", "2", "Error"],
answer: "1",
topics: ["len", "list", "function"]
},
{
question: "Which of the following expressions is valid?",
options: ["sum(reversed([1, 2]))", "sorted(reversed([1, '2']))", "len(reversed([1, 2]))", "list(reversed([1, 2]))[0]"],
answer: "list(reversed([1, 2]))[0]",
topics: ["reversed", "list", "function"]
},
{
question: "What is the output of sorted(['100', '2', '10'])?",
options: ["['2', '10', '100']", "['10', '100', '2']", "['100', '10', '2']", "['10', '2', '100']"],
answer: "['10', '100', '2']",
topics: ["sorted", "string", "function"]
},
{
question: "What does list(zip([[1, 2], [3, 4]])) return?",
options: ["[(1, 3), (2, 4)]", "[([1, 3]), ([2, 4])]", "[([1, 2]), ([3, 4])]", "[([1, 2],), ([3, 4],)]"],
answer: "[([1, 2],), ([3, 4],)]",
topics: ["zip", "list", "function"]
},
{
question: "What is the output of sum([])?",
options: ["0", "None", "Error", "False"],
answer: "0",
topics: ["sum", "list", "function"]
},
{
question: "What does this return: any([[], '', 0])?",
options: ["True", "False", "Error", "None"],
answer: "False",
topics: ["any", "list", "function"]
},
{
question: "What is the output of: len('hello\\nworld')?",
options: ["10", "11", "9", "12"],
answer: "11",
topics: ["len", "string", "function"]
},
{
question: "What is the result of: max([])?",
options: ["None", "0", "Error", "[]"],
answer: "Error",
topics: ["max", "list", "function"]
},
{
question: "Which line of code creates a list of 5 elements, all 0?",
options: ["[0] * 5", "[0 for _ in range(5)]", "list(0 * 5)", "Both A and B"],
answer: "Both A and B",
topics: ["list"]
},
{
question: "What will print(type(type(5))) output?",
options: ["<class 'type'>", "<type 'int'>", "<class 'int'>", "<type 'type'>"],
answer: "<class 'type'>",
topics: ["type", "function"]
},
{
question: "How many iterations does this run: for i in range(1, 10, 2)?",
options: ["10", "5", "9", "4"],
answer: "5",
topics: ["range", "loop"]
},
{
question: "What will this return: list(range(5, 1, -1))?",
options: ["[5, 4, 3, 2, 1]", "[1, 2, 3, 4, 5]", "[5, 4, 3, 2]", "[5, 4, 3, 2, 1, 0]"],
answer: "[5, 4, 3, 2]",
topics: ["range", "list", "function"]
},
{
question: "Which of these will give the correct number of elements in a 2D list?",
options: ["len(list)", "len(list[0])", "sum([len(row) for row in list])", "len(list) * len(list[0])"],
answer: "sum([len(row) for row in list])",
topics: ["len", "list", "function"]
},
{
question: "What is the output of list(zip(range(3), range(100)))?",
options: ["[(0,0), (1,1), ..., (99,99)]", "Error", "[(0, 0), (1, 1), (2, 2)]", "[range(3), range(100)]"],
answer: "[(0, 0), (1, 1), (2, 2)]",
topics: ["zip", "range", "list", "function"]
},
{
question: "What will sorted([True, False, True]) return?",
options: ["[False, True, True]", "[True, False, True]", "Error", "[0, 1, 1]"],
answer: "[False, True, True]",
topics: ["sorted", "list", "function"]
},
{
question: "What is the result of: list(zip('abc', [1, 2]))?",
options: ["[('a', 1), ('b', 2)]", "[('a', 1), ('b', 2), ('c', None)]", "Error", "[('a', 1), ('b', 2), ('c', '')]"],
answer: "[('a', 1), ('b', 2)]",
topics: ["zip", "list", "string", "function"]
},
{
question: "What is returned by sum([True, False, True])?",
options: ["2", "1", "3", "Error"],
answer: "2",
topics: ["sum", "list", "function"]
},
{
question: "Which will throw an error?",
options: ["max([])", "sum([])", "min([1])", "all([False])"],
answer: "max([])",
topics: ["max", "function"]
},
{
question: "What is len(' ')?",
options: ["0", "1", "2", "Error"],
answer: "1",
topics: ["len", "string", "function"]
},
{
question: "Which of the following are valid Python types?",
options: ["int, list, str", "integer, array, string", "float, zip", "Both A and C"],
answer: "Both A and C",
topics: ["type"]
},
{
question: "What does type(len) return?",
options: ["function", "builtin_function_or_method", "method", "type"],
answer: "builtin_function_or_method",
topics: ["type", "function"]
},
{
question: "What is the result of list('1234')[-2]?",
options: ["'3'", "'2'", "3", "Error"],
answer: "'3'",
topics: ["list", "string"]
},
{
question: "What does this return: [i for i in range(5) if i%2==0]?",
options: ["[1, 3, 5]", "[0, 1, 2, 3, 4]", "[0, 2, 4]", "[2, 4]"],
answer: "[0, 2, 4]",
topics: ["list", "range"]
},
{
question: "What is the type of the object returned by input()?",
options: ["str", "int", "depends on input", "None"],
answer: "str",
topics: ["input", "string", "function"]
},
{
question: "Which of these would raise an error?",
options: ["int('10')", "int('10.0')", "float('10')", "str(10.5)"],
answer: "int('10.0')",
topics: ["int", "function"]
},
{
question: "What does list('') return?",
options: ["['']", "[]", "None", "Error"],
answer: "[]",
topics: ["list", "string", "function"]
},
{
question: "Which function flattens a 2D list into 1D?",
options: [
"[x for row in mat for x in row]",
"sum(mat)",
"mat.flatten()",
"list(mat)"
],
answer: "[x for row in mat for x in row]",
topics: ["list"]
},
{
question: "What is the result of type(zip([1], [2]))?",
options: ["zip", "list", "<class 'zip'>", "<class 'list'>"],
answer: "<class 'zip'>",
topics: ["zip", "type", "function"]
},
{
question: "What does range(5) == [0,1,2,3,4] return?",
options: ["True", "False", "Error", "None"],
answer: "False",
topics: ["range", "list"]
},
{
question: "What's wrong with this code? _ar = (1, 2, 3)",
options: ["Cannot store int in tuple", "Cannot make tuple name start with _", "Both A and B", "There is no problem in the code"],
answer: "There is no problem in the code",
topics: ["tuple"]
},
{
question: "What's wrong with this code? _ar = [1, 2, 3]",
options: ["Cannot store int in list", "Cannot make list name start with _", "Both A and B", "There is no problem in the code"],
answer: "There is no problem in the code",
topics: ["list"]
},
{
question: "What is returned by len(range(10, 0, -2))?",
options: ["5", "10", "4", "6"],
answer: "5",
topics: ["len", "range", "function"]
},
{
question: "What does type(reversed([1, 2, 3])) return?",
options: ["class 'list'>", "<class 'iterator'>", "<class 'list_reverseiterator'>", "None"],
answer: "<class 'list_reverseiterator'>",
topics: ["type", "reversed", "function"]
},
{
question: "Which would raise an error: min('abc', 2)?",
options: ["Yes", "No", "Depends on Python version", "Returns 'a'"],
answer: "Yes",
topics: ["min", "function"]
},
{
question: "What does print('5' * 3) output?",
options: ["555", "15", "'555'", "Error"],
answer: "555",
topics: ["print", "string"]
}
],
3: [
{
question: "What is the result of: all([[]])?",
options: ["True", "False", "Error", "None"],
answer: "False",
topics: ["all", "list", "function"]
},
{
question: "Given: x = [1, 2]; y = x; y.append(3). What is x now?",
options: ["[1, 2]", "[1, 2, 3]", "[3]", "[]"],
answer: "[1, 2, 3]",
topics: ["list"]
},
{
question: "What is the output of: len(''.join(['a', 'b']) + 'cd')?",
options: ["2", "3", "4", "5"],
answer: "4",
topics: ["len", "string", "function"]
},
{
question: "What does list(zip(*[[1, 2, 3], [4, 5, 6]])) produce?",
options: [
"[(1, 2, 3), (4, 5, 6)]",
"[(1, 4), (2, 5), (3, 6)]",
"[(1, 2), (3, 4), (5, 6)]",
"[[1, 2, 3], [4, 5, 6]]"
],
answer: "[(1, 4), (2, 5), (3, 6)]",
topics: ["zip", "list", "function"]
},
{
question: "Which expression returns the number of non-empty sublists in [[1], [], [0], []]?",
options: [
"len([x for x in lst if x])",
"sum([bool(x) for x in lst])",
"all(lst)",
"Both A and B"
],
answer: "Both A and B",
topics: ["list", "function"]
},
{
question: "What does reversed(range(3)) == reversed([0, 1, 2]) return?",
options: ["True", "False", "Error", "None"],
answer: "False",
topics: ["reversed", "range", "function"]
},
{
question: "Which of these expressions creates a list of individual characters from 'abc'?",
options: [
"list('abc')",
"[*'abc']",
"[char for char in 'abc']",
"All of the above"
],
answer: "All of the above",
topics: ["list", "string"]
},
{
question: "What is the result of: len([list(range(3))] * 2)?",
options: ["3", "6", "2", "1"],
answer: "2",
topics: ["len", "list", "range", "function"]
},
{
question: "Given x = [[0]*2]*2; x[0][0] = 1. What is x now?",
options: [
"[[1, 0], [0, 0]]",
"[[1, 0], [1, 0]]",
"[[1], [0]]",
"[[1, 1], [1, 1]]"
],
answer: "[[1, 0], [1, 0]]",
topics: ["list"]
},
{
question: "What is the output of sum([i for i in range(5) if i % 2 == 0])?",
options: ["6", "4", "10", "0"],
answer: "6",
topics: ["sum", "list", "range", "function"]
}
],
4: [
{
question: "What is the output of the following code?\n\nx = [[0]*3]*3\nx[0][0] = 1\nprint(x)",
options: [
"[[1, 0, 0], [0, 0, 0], [0, 0, 0]]",
"[[1, 0, 0], [1, 0, 0], [1, 0, 0]]",
"[[1, 1, 1], [0, 0, 0], [0, 0, 0]]",
"[[1, 0, 0]] * 3"
],
answer: "[[1, 0, 0], [1, 0, 0], [1, 0, 0]]",
topics: ["list", "print"]
},
{
question: "What does this print?\n\nprint(sum(map(len, zip(*[['a', 'b'], ['c']]))))",
options: ["2", "1", "3", "Error"],
answer: "1",
topics: ["zip", "len", "function"]
},
{
question: "What does this print?\n\nprint(any(['', [], {}, 0, False, 'False']))",
options: ["True", "False", "Error", "None"],
answer: "True",
topics: ["any", "function"]
},
{
question: "What is the output of:\n\nprint(len([i for i in range(1000) if str(i) == str(i)[::-1]]))",
options: ["100", "109", "199", "None of the above"],
answer: "109",
topics: ["list", "string", "range"]
},
{
question: "What does this return?\n\nlist(reversed(reversed([1, 2, 3]))) == [1, 2, 3]",
options: ["True", "False", "Error", "None"],
answer: "True",
topics: ["reversed", "list", "function"]
},
{
question: "Given: a = [[], [], []] print(len(set(map(tuple, a))))",
options: ["3", "1", "0", "Error"],
answer: "1",
topics: ["map", "set", "tuple", "len", "function"]
},
{
question: "Which of these are true about `zip`?\n\nlist(zip(range(3), range(5)))",
options: [
"Returns 5 pairs, missing elements filled with None",
"Returns a zip object that produces 3 pairs",
"Throws an error due to uneven lengths",
"Returns [(0,0), (1,1), (2,2), (None, 3), (None, 4)]"
],
answer: "Returns a zip object that produces 3 pairs",
topics: ["zip", "range", "function"]
},
{
question: "What is printed?\n\nprint(sorted(['10', '2', '1'], key=int))",
options: [
"['1', '2', '10']",
"['10', '2', '1']",
"['1', '10', '2']",
"['2', '10', '1']"
],
answer: "['1', '2', '10']",
topics: ["sorted", "function"]
},
{
question: "What is the output of:\n\nsum([[1, 2], [3, 4]], [])",
options: ["[1, 2, 3, 4]", "[[1, 2], [3, 4]]", "10", "Error"],
answer: "[1, 2, 3, 4]",
topics: ["sum", "list", "function"]
},
{
question: "What does this code print?\n\nx = [1, 2]; y = x[:]; y[0] = 0; print(x)",
options: [
"[0, 2]",
"[1, 2]",
"[0, 1, 2]",
"Error"
],
answer: "[1, 2]",
topics: ["list", "print"]
}
]
};

// Flatten all questions into a single array for topic filtering
const allQuestions = [].concat(...Object.values(questionsByLevel));

// Quiz state
let selectedMode = "topics"; // "topics" or "levels" or "ranked"
let selectedTopics = [];
let selectedLevels = [];
let filteredQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let xp = 0;
let lives = 3;
let streak = 0;
let correctCount = 0;
let wrongCount = 0;
let questionsAnswered = false;
let currentUser = null;

// Ranked Mode Variables
let rankedQuestions = [];
let currentRankedQuestion = 0;
let rankedScore = 0;
let correctAnswers = 0;
let rankedQuestionCount = 10; // Number of questions in a ranked test
let userRank = "Unranked";
let userRankPoints = 0;
let currentDifficulty = "Medium"; // Start with medium difficulty
let questionAnswered = false;

// Ranks in order from lowest to highest
const ranks = [
{ name: "Bronze", threshold: 0, color: "rank-bronze" },
{ name: "Silver", threshold: 100, color: "rank-silver" },
{ name: "Gold", threshold: 250, color: "rank-gold" },
{ name: "Platinum", threshold: 500, color: "rank-platinum" },
{ name: "Diamond", threshold: 1000, color: "rank-diamond" }
];

// Check login status
function checkLoginStatus() {
const userStr = localStorage.getItem('user');
if (!userStr) {
notLoggedInEl.classList.remove('hidden');
quizAppEl.classList.add('hidden');
return false;
}

try {
currentUser = JSON.parse(userStr);

// Update user info
userNameEl.textContent = currentUser.username;
userAvatarEl.textContent = currentUser.username.charAt(0).toUpperCase();

// Initialize stats from user data
score = currentUser.total_score || 0;
lives = currentUser.hearts || 3;
streak = currentUser.streak || 0;
xp = currentUser.xp || 0;

// Update UI
scoreEl.textContent = score;
livesEl.textContent = lives;
streakCountEl.textContent = streak;
xpEl.textContent = xp;

notLoggedInEl.classList.add('hidden');
quizAppEl.classList.remove('hidden');
return true;
} catch (error) {
console.error('Error parsing user data:', error);
notLoggedInEl.classList.remove('hidden');
quizAppEl.classList.add('hidden');
return false;
}
}

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
</script>
</body>
</html>
