const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;
const LINKEDIN_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const LINKEDIN_PERSON_URN = process.env.LINKEDIN_PERSON_URN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const REPO_URL = process.env.REPO_URL || 'https://github.com/your-username/your-repo';
const STATE_FILE = 'last_message_id.txt';

async function sendAdminNotification(message) {
    if (!TELEGRAM_ADMIN_ID || !TELEGRAM_BOT_TOKEN) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_ADMIN_ID,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Failed to send admin notification:', error.message);
    }
}

function getLastProcessedId() {
    if (fs.existsSync(STATE_FILE)) {
        return parseInt(fs.readFileSync(STATE_FILE, 'utf8').trim());
    }
    return 0;
}

function saveLastProcessedId(id) {
    fs.writeFileSync(STATE_FILE, id.toString());
}

async function downloadFile(fileId) {
    const fileResponse = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const filePath = fileResponse.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    
    const response = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer'
    });
    return response.data;
}

async function registerImageUpload() {
    const response = await axios.post(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        {
            registerUploadRequest: {
                recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                owner: LINKEDIN_PERSON_URN,
                serviceRelationships: [
                    {
                        relationshipType: 'OWNER',
                        identifier: 'urn:li:userGeneratedContent'
                    }
                ]
            }
        },
        {
            headers: {
                'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
                'X-Restli-Protocol-Version': '2.0.0'
            }
        }
    );
    return response.data.value;
}

async function uploadImageBinary(uploadUrl, imageBuffer) {
    await axios.post(uploadUrl, imageBuffer, {
        headers: {
            'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
            'Content-Type': 'application/octet-stream'
        }
    });
}

async function createLinkedInPost(text, assetUrn) {
    const postData = {
        author: LINKEDIN_PERSON_URN,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: text || ' ' },
                shareMediaCategory: assetUrn ? 'IMAGE' : 'NONE',
                media: assetUrn ? [
                    {
                        status: 'READY',
                        description: { text: 'Post Image' },
                        media: assetUrn,
                        title: { text: 'Post Image' }
                    }
                ] : []
            }
        },
        visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
    };

    try {
        await axios.post('https://api.linkedin.com/v2/ugcPosts', postData, {
            headers: {
                'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
                'X-Restli-Protocol-Version': '2.0.0'
            }
        });
    } catch (error) {
        const errorData = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error('LinkedIn Post Error Details:', errorData);
        throw new Error(`LinkedIn API Error: ${errorData}`);
    }
}

async function checkLinkedInToken() {
    try {
        await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}` }
        });
        return true;
    } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            console.error('LinkedIn Token is invalid or expired!');
            await sendAdminNotification(`⚠️ <b>LinkedIn Token Expired!</b>\n\nYour LinkedIn access token is no longer valid.\n\nRepo: ${REPO_URL}`);
            return false;
        }
        throw error;
    }
}

async function run() {
    console.log('Starting sync process...');
    
    const isTokenValid = await checkLinkedInToken();
    if (!isTokenValid) process.exit(1);

    const lastId = getLastProcessedId();
    console.log(`Last processed message ID: ${lastId}`);

    try {
        const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastId + 1}`);
        const updates = response.data.result;

        if (updates.length === 0) {
            console.log('No new updates found.');
            return;
        }

        for (const update of updates) {
            const post = update.channel_post;
            if (!post) continue;

            const chatUsername = post.chat.username ? `@${post.chat.username}` : post.chat.id.toString();
            if (chatUsername !== TARGET_CHANNEL_ID && post.chat.id.toString() !== TARGET_CHANNEL_ID) {
                console.log(`Skipping post from unauthorized channel: ${chatUsername}`);
                continue;
            }

            console.log(`Processing message ID: ${post.message_id}`);
            
            let text = post.text || post.caption || '';
            let assetUrn = null;

            try {
                if (post.photo) {
                    const photo = post.photo[post.photo.length - 1];
                    const imageBuffer = await downloadFile(photo.file_id);
                    
                    console.log('Registering LinkedIn image...');
                    const uploadInfo = await registerImageUpload();
                    const uploadUrl = uploadInfo.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
                    assetUrn = uploadInfo.asset;

                    console.log('Uploading image binary...');
                    await uploadImageBinary(uploadUrl, imageBuffer);
                }

                console.log('Creating LinkedIn post...');
                await createLinkedInPost(text, assetUrn);
                console.log('Successfully posted to LinkedIn!');
                
                saveLastProcessedId(post.message_id);
            } catch (err) {
                console.error(`Failed to process message ${post.message_id}:`, err.message);
                await sendAdminNotification(`❌ <b>Error processing message ${post.message_id}</b>\n\n<code>${err.message}</code>`);
                // We don't save ID here so it can be retried next time
            }
        }
    } catch (error) {
        console.error('Error during sync:', error.message);
        await sendAdminNotification(`❌ <b>Sync Error!</b>\n\n<code>${error.message}</code>`);
        process.exit(1);
    }
}

run();
