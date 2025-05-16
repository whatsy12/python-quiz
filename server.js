<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Python Quiz - Leaderboard</title>
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
--gold: #FFD700;
--silver: #C0C0C0;
--bronze: #CD7F32;
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

.logo {
margin-bottom: 20px;
text-align: center;
}

.logo h1 {
color: var(--blue);
font-size: 2.5rem;
margin-bottom: 5px;
}

.logo p {
color: var(--text);
font-size: 1.1rem;
}

.container {
background-color: white;
border-radius: 20px;
box-shadow: 0 10px 30px rgba(0,0,0,0.08);
width: 100%;
max-width: 800px;
padding: 25px;
margin-bottom: 20px;
}

h2 {
text-align: center;
color: var(--text);
margin-bottom: 20px;
font-size: 1.5rem;
}

.season-info {
text-align: center;
background-color: #e7f5ff;
padding: 10px;
border-radius: 10px;
margin-bottom: 20px;
}

.season-countdown {
font-weight: bold;
color: var(--blue);
}

.tabs {
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

.user-stats {
background-color: #f0f8ff;
padding: 15px;
border-radius: 10px;
margin-bottom: 20px;
display: flex;
justify-content: space-between;
align-items: center;
}

.user-rank {
font-size: 1.5rem;
font-weight: 800;
color: var(--blue);
}

.user-details {
text-align: right;
}

.stats-label {
font-size: 0.9rem;
color: #666;
}

.stats-value {
font-weight: 700;
font-size: 1.1rem;
}

.rank-badge {
display: inline-block;
padding: 3px 8px;
border-radius: 12px;
font-size: 0.8rem;
font-weight: 700;
margin-left: 5px;
color: white;
}

.rank-badge.master {
background-color: #ff9800;
}

.rank-badge.diamond {
background-color: #00bcd4;
}

.rank-badge.platinum {
background-color: #7e57c2;
}

.rank-badge.gold {
background-color: #ffc107;
}

.rank-badge.silver {
background-color: #9e9e9e;
}

.rank-badge.bronze {
background-color: #8d6e63;
}

.rank-badge.beginner {
background-color: #4caf50;
}

.leaderboard-table {
width: 100%;
border-collapse: collapse;
}

.leaderboard-table th {
text-align: left;
padding: 10px;
border-bottom: 2px solid #e0e0e0;
font-weight: 700;
}

.leaderboard-table td {
padding: 12px 10px;
border-bottom: 1px solid #e0e0e0;
}

.leaderboard-table tr:last-child td {
border-bottom: none;
}

.leaderboard-table tr:nth-child(even) {
background-color: #f9f9f9;
}

.leaderboard-table tr:hover {
background-color: #f0f8ff;
}

.leaderboard-table .rank-number {
font-weight: 800;
width: 40px;
}

.top-rank {
display: flex;
align-items: center;
justify-content: center;
width: 30px;
height: 30px;
border-radius: 50%;
font-weight: 800;
color: white;
}

.rank-1 {
background-color: var(--gold);
}

.rank-2 {
background-color: var(--silver);
}

.rank-3 {
background-color: var(--bronze);
}

.leaderboard-table .user-name {
font-weight: 700;
}

.leaderboard-table .your-row {
background-color: rgba(28, 176, 246, 0.1);
font-weight: 700;
}

.action-buttons {
display: flex;
justify-content: space-between;
margin-top: 20px;
}

.btn {
background-color: var(--primary);
color: white;
padding: 12px 15px;
border: none;
border-radius: 12px;
cursor: pointer;
font-weight: 700;
font-size: 1rem;
transition: all 0.2s ease;
font-family: 'Nunito', sans-serif;
box-shadow: 0 4px 0 var(--primary-hover);
flex: 1;
margin: 0 10px;
text-align: center;
text-decoration: none;
display: inline-block;
}

.btn:first-child {
margin-left: 0;
}

.btn:last-child {
margin-right: 0;
}

.btn:hover {
background-color: var(--primary-hover);
transform: translateY(-2px);
}

.btn:active {
transform: translateY(2px);
box-shadow: 0 0 0 var(--primary-hover);
}

.btn.blue {
background-color: var(--blue);
box-shadow: 0 4px 0 #0e90cf;
}

.btn.blue:hover {
background-color: #0e90cf;
}

.btn.blue:active {
box-shadow: 0 0 0 #0e90cf;
}

.not-logged-in {
text-align: center;
padding: 20px;
}

.not-logged-in h3 {
margin-bottom: 15px;
}

@media (max-width: 600px) {
.user-stats {
flex-direction: column;
text-align: center;
}

.user-details {
text-align: center;
margin-top: 10px;
}

.leaderboard-table .hide-mobile {
display: none;
}

.btn {
padding: 10px;
font-size: 0.9rem;
}
}
</style>
</head>
<body>
<!-- Not logged in message -->
<div id="not-logged-in" class="not-logged-in" style="display: none;">
<h3>Please log in to view the leaderboard</h3>
<a href="login.html" class="btn">Log In</a>
</div>

<!-- Main Content - Only shown when logged in -->
<div id="leaderboard-content" style="display: none;">
<div class="logo">
<h1>Python Quiz</h1>
<p>Competitive Leaderboard</p>
</div>

<div class="container">
<div class="season-info">
<h3>Season <span id="season-number">1</span></h3>
<p>Season ends in <span id="season-countdown" class="season-countdown">30 days</span></p>
</div>

<div id="user-stats" class="user-stats">
<div>
<span class="user-rank">#<span id="user-position">--</span></span>
<span id="username">Username</span>
<span id="rank-badge" class="rank-badge beginner">Beginner</span>
</div>
<div class="user-details">
<div>
<span class="stats-label">Rank Points:</span>
<span id="user-rank-points" class="stats-value">1000</span>
</div>
<div>
<span class="stats-label">Win Rate:</span>
<span id="user-win-rate" class="stats-value">0%</span>
</div>
</div>
</div>

<div class="tabs">
<div class="tab active" data-tab="top">Top Players</div>
<div class="tab" data-tab="history">Your History</div>
</div>

<div id="top-players-tab" class="tab-content">
<table class="leaderboard-table">
<thead>
<tr>
<th>Rank</th>
<th>Player</th>
<th>Points</th>
<th class="hide-mobile">Matches</th>
<th>Win Rate</th>
</tr>
</thead>
<tbody id="leaderboard-body">
<!-- Leaderboard rows will be added here -->
</tbody>
</table>
</div>

<div id="history-tab" class="tab-content" style="display: none;">
<table class="leaderboard-table">
<thead>
<tr>
<th>Date</th>
<th>Result</th>
<th>Old Rank</th>
<th>New Rank</th>
<th>Change</th>
</tr>
</thead>
<tbody id="history-body">
<!-- History rows will be added here -->
</tbody>
</table>
</div>

<div class="action-buttons">
<a href="quiz.html" class="btn">Back to Practice</a>
<a href="#" id="play-ranked-btn" class="btn blue">Play Ranked Match</a>
</div>
</div>
</div>

<script>
// Get current user
const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
const isLoggedIn = currentUser && currentUser.id;

// Display appropriate content based on login status
document.addEventListener('DOMContentLoaded', function() {
if (isLoggedIn) {
document.getElementById('leaderboard-content').style.display = 'block';
document.getElementById('not-logged-in').style.display = 'none';
loadLeaderboard();
} else {
document.getElementById('leaderboard-content').style.display = 'none';
document.getElementById('not-logged-in').style.display = 'block';
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
tab.addEventListener('click', function() {
// Update active tab
document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
this.classList.add('active');

// Show corresponding content
const tabName = this.getAttribute('data-tab');
document.querySelectorAll('.tab-content').forEach(content => {
content.style.display = 'none';
});

if (tabName === 'top') {
document.getElementById('top-players-tab').style.display = 'block';
} else if (tabName === 'history') {
document.getElementById('history-tab').style.display = 'block';
loadUserHistory();
}
});
});

// Play ranked button
document.getElementById('play-ranked-btn').addEventListener('click', function(e) {
e.preventDefault();
localStorage.setItem('playRanked', 'true');
window.location.href = 'quiz.html';
});
});

// Load leaderboard data
async function loadLeaderboard() {
try {
const response = await fetch(`/api/leaderboard?userId=${currentUser.id}`);
const data = await response.json();

if (data.success) {
renderLeaderboard(data.leaderboard);
renderUserStats(data.userRank);
renderSeasonInfo(data.season);
} else {
console.error('Failed to load leaderboard:', data.message);
}
} catch (error) {
console.error('Error loading leaderboard:', error);
}
}

// Load user history
async function loadUserHistory() {
try {
const response = await fetch(`/api/rank-history/${currentUser.id}`);
const data = await response.json();

if (data.success) {
renderUserHistory(data.history);
} else {
console.error('Failed to load rank history:', data.message);
}
} catch (error) {
console.error('Error loading rank history:', error);
// Show placeholder or message if history isn't implemented yet
document.getElementById('history-body').innerHTML = `
<tr>
<td colspan="5" style="text-align: center; padding: 20px;">
No rank history available yet
</td>
</tr>
`;
}
}

// Render leaderboard table
function renderLeaderboard(leaderboardData) {
const tbody = document.getElementById('leaderboard-body');
tbody.innerHTML = '';

if (leaderboardData.length === 0) {
tbody.innerHTML = `
<tr>
<td colspan="5" style="text-align: center; padding: 20px;">
No players on the leaderboard yet. Be the first to play ranked!
</td>
</tr>
`;
return;
}

leaderboardData.forEach((player, index) => {
const rank = index + 1;
const isCurrentUser = player.id === currentUser.id;

const row = document.createElement('tr');
if (isCurrentUser) {
row.classList.add('your-row');
}

// Rank column with special formatting for top 3
let rankDisplay;
if (rank <= 3) {
rankDisplay = `<div class="top-rank rank-${rank}">${rank}</div>`;
} else {
rankDisplay = `<span class="rank-number">${rank}</span>`;
}

row.innerHTML = `
<td>${rankDisplay}</td>
<td class="user-name">${player.username}${isCurrentUser ? ' (You)' : ''}</td>
<td>${player.rank}</td>
<td class="hide-mobile">${player.ranked_matches}</td>
<td>${player.win_rate}%</td>
`;

tbody.appendChild(row);
});
}

// Render user stats
function renderUserStats(userRank) {
if (!userRank) {
document.getElementById('user-position').textContent = '--';
document.getElementById('username').textContent = currentUser.username || 'User';
document.getElementById('user-rank-points').textContent = '1000';
document.getElementById('user-win-rate').textContent = '0%';
return;
}

document.getElementById('user-position').textContent = userRank.position || '--';
document.getElementById('username').textContent = userRank.username;
document.getElementById('user-rank-points').textContent = userRank.rank;
document.getElementById('user-win-rate').textContent = `${userRank.win_rate}%`;

// Set rank badge
const rankBadge = document.getElementById('rank-badge');
const rank = userRank.rank;

if (rank >= 2500) {
rankBadge.textContent = 'Master';
rankBadge.className = 'rank-badge master';
} else if (rank >= 2000) {
rankBadge.textContent = 'Diamond';
rankBadge.className = 'rank-badge diamond';
} else if (rank >= 1500) {
rankBadge.textContent = 'Platinum';
rankBadge.className = 'rank-badge platinum';
} else if (rank >= 1200) {
rankBadge.textContent = 'Gold';
rankBadge.className = 'rank-badge gold';
} else if (rank >= 900) {
rankBadge.textContent = 'Silver';
rankBadge.className = 'rank-badge silver';
} else if (rank >= 600) {
rankBadge.textContent = 'Bronze';
rankBadge.className = 'rank-badge bronze';
} else {
rankBadge.textContent = 'Beginner';
rankBadge.className = 'rank-badge beginner';
}
}

// Render season info
function renderSeasonInfo(seasonData) {
if (!seasonData) return;

document.getElementById('season-number').textContent = seasonData.season;

// Calculate days remaining
const endDate = new Date(seasonData.season_end);
const now = new Date();
const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

document.getElementById('season-countdown').textContent = `${daysRemaining} days`;
}

// Render user history
function renderUserHistory(historyData) {
const tbody = document.getElementById('history-body');
tbody.innerHTML = '';

if (!historyData || historyData.length === 0) {
tbody.innerHTML = `
<tr>
<td colspan="5" style="text-align: center; padding: 20px;">
No match history yet. Play some ranked matches!
</td>
</tr>
`;
return;
}

historyData.forEach(entry => {
const row = document.createElement('tr');
const date = new Date(entry.created_at);
const formattedDate = date.toLocaleString();
const changeValue = entry.new_rank - entry.old_rank;

row.innerHTML = `
<td>${formattedDate}</td>
<td style="color: ${entry.correct ? 'var(--correct)' : 'var(--wrong)'}">
${entry.correct ? 'Win' : 'Loss'}
</td>
<td>${entry.old_rank}</td>
<td>${entry.new_rank}</td>
<td style="color: ${changeValue >= 0 ? 'var(--correct)' : 'var(--wrong)'}">
${changeValue >= 0 ? '+' : ''}${changeValue}
</td>
`;

tbody.appendChild(row);
});
}
</script>
</body>
</html>
