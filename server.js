// Add these updates to your server.js file

// Update the setupDatabase function to add rank_points column and ranked_tests table
async function setupDatabase() {
const client = await pool.connect();

try {
await client.query('BEGIN');

// Create users table (adding rank_points column)
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

// Create ranked_tests table to store ranked test history
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

// Add these new API endpoints after your existing endpoints

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

// Get ranked questions (adaptive based on difficulty)
app.post('/api/ranked-questions', async (req, res) => {
const { userId, difficulty } = req.body;

try {
// For simplicity, we're just returning questions from the existing levels
// based on the requested difficulty. In a production environment, you would
// have a more sophisticated system for adaptive questions.

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

// In a real implementation, you would query a questions table
// Instead, we'll send a success response that will trigger
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
const { userId, score, accuracy, totalPoints } = req.body;

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
