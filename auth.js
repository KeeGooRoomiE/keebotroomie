const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 3000;

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/callback';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

app.get('/', (req, res) => {
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=openid%20profile%20email%20w_member_social`;
    res.send(`
        <h1>LinkedIn Auth Helper</h1>
        <p><a href="${authUrl}" style="padding:10px 20px; background:#0077b5; color:white; text-decoration:none; border-radius:5px;">1. Authorize with LinkedIn</a></p>
        <p><a href="/get_chat_id" style="padding:10px 20px; background:#24A1DE; color:white; text-decoration:none; border-radius:5px;">2. Get my Telegram Chat ID</a></p>
    `);
});

app.get('/get_chat_id', async (req, res) => {
    if (!BOT_TOKEN) return res.send('<h1>Error</h1><p>Please set TELEGRAM_BOT_TOKEN in your .env file first.</p>');
    
    try {
        const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
        const updates = response.data.result;
        
        if (updates.length === 0) {
            res.send(`
                <h1>No messages found</h1>
                <p>1. Open your bot in Telegram: <a href="https://t.me/keegooroomie_posting_bot">@keegooroomie_posting_bot</a></p>
                <p>2. Send any message to it (e.g., "Hello").</p>
                <p>3. <a href="/get_chat_id">Refresh this page</a>.</p>
            `);
        } else {
            const lastMessage = updates[updates.length - 1];
            const chatId = lastMessage.message ? lastMessage.message.from.id : 'Not found';
            const name = lastMessage.message ? lastMessage.message.from.first_name : 'Unknown';
            
            res.send(`
                <h1>Your Telegram Info</h1>
                <p><strong>Chat ID (TELEGRAM_ADMIN_ID):</strong> <code>${chatId}</code></p>
                <p>Name: ${name}</p>
                <p>Copy this ID to your GitHub Secrets.</p>
                <p><a href="/">Back to Home</a></p>
            `);
        }
    } catch (error) {
        res.send(`<h1>Error</h1><p>${error.message}</p>`);
    }
});

app.get('/callback', async (req, res) => {
    const { code, error, error_description } = req.query;
    if (error) return res.status(400).send(`<h1>Auth Error</h1><p>${error_description}</p>`);
    if (!code) return res.status(400).send('<h1>No code provided</h1>');

    try {
        const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', 
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = tokenResponse.data.access_token;
        const expiresIn = tokenResponse.data.expires_in; // Seconds until expiration

        const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const personUrn = `urn:li:person:${profileResponse.data.sub}`;

        res.send(`
            <h1>Success!</h1>
            <p><strong>Access Token:</strong> <br><textarea rows="5" cols="60" readonly>${accessToken}</textarea></p>
            <p><strong>Person URN:</strong> <code>${personUrn}</code></p>
            <p><strong>Expires in:</strong> ${Math.floor(expiresIn / 86400)} days</p>
            <hr>
            <p>1. Copy <b>Access Token</b> and <b>Person URN</b> to your GitHub Secrets.</p>
            <p>2. Don't forget to get your <a href="/get_chat_id">Telegram Chat ID</a> too!</p>
        `);
    } catch (error) {
        res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
    }
});

app.listen(port, () => {
    console.log(`Auth server running at http://localhost:${port}`);
});
