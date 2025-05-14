// server.js - Node.js backend for login system with Render PostgreSQL
const express = require('express');
const { Pool } = require('pg'); // PostgreSQL client
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const path = require('path');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create PostgreSQL connection pool
// Render automatically provides this environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render PostgreSQL
  }
});

// Test database connection and create tables if needed
pool.connect()
  .then(client => {
    console.log('Connected to PostgreSQL database');
    
    // Create users table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    client.query(createTableQuery)
      .then(() => {
        console.log('Users table created or already exists');
        client.release();
      })
      .catch(err => {
        console.error('Error creating table:', err);
        client.release();
      });
  })
  .catch(err => {
    console.error('Error connecting to database:', err);
  });

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
        user: { id: user.id, username: user.username, email: user.email }
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
      'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id',
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

// Simple route to test if server is running
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
