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
            parse_mode: 'HTML',
            disable_web_page_preview: false
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

/**
 * Checks if a post with similar text already exists in the user's LinkedIn feed.
 * This is a safety measure against GitHub Actions cache failures.
 */
async function isDuplicateOnLinkedIn(text) {
    if (!text) return false;
    try {
        // Fetch last 10 posts from the user
        const response = await axios.get(`https://api.linkedin.com/v2/ugcPosts?q=author&author=${encodeURIComponent(LINKEDIN_PERSON_URN)}&count=10`, {
            headers: {
                'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
                'X-Restli-Protocol-Version': '2.0.0'
            }
        });

        const posts = response.data.elements || [];
        const cleanText = text.trim().substring(0, 100); // Compare first 100 chars

        for (const post of posts) {
            const shareContent = post.specificContent['com.linkedin.ugc.ShareContent'];
            if (shareContent && shareContent.shareCommentary && shareContent.shareCommentary.text) {
                const existingText = shareContent.shareCommentary.text.trim().substring(0, 100);
                if (existingText === cleanText) {
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking LinkedIn history:', error.message);
        return false; // If check fails, assume not a duplicate to avoid blocking
    }
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
        const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', postData, {
            headers: {
                'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
                'X-Restli-Protocol-Version': '2.0.0'
            }
        });
        return response.data.id;
    } catch (error) {
        const errorData = error.response ? error.response.data : { message: error.message };
        
        if (error.response && error.response.status === 422 && JSON.stringify(errorData).includes('DUPLICATE_POST')) {
            console.log('LinkedIn API detected a duplicate post. Skipping...');
            return 'DUPLICATE';
        }

        console.error('LinkedIn Post Error Details:', JSON.stringify(errorData));
        throw new Error(`LinkedIn API Error: ${JSON.stringify(errorData)}`);
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
            
            // NEW: Check LinkedIn history before doing anything
            console.log('Checking LinkedIn history for duplicates...');
            const isDuplicate = await isDuplicateOnLinkedIn(text);
            if (isDuplicate) {
                console.log(`Post "${text.substring(0, 30)}..." already exists on LinkedIn. Skipping.`);
                saveLastProcessedId(post.message_id);
                continue;
            }

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
                const linkedinPostUrn = await createLinkedInPost(text, assetUrn);
                
                if (linkedinPostUrn === 'DUPLICATE') {
                    console.log('Successfully skipped duplicate (API level)!');
                } else {
                    console.log('Successfully processed message!');
                    
                    const tgLink = post.chat.username ? `https://t.me/${post.chat.username}/${post.message_id}` : 'N/A';
                    const liId = linkedinPostUrn.split(':').pop();
                    const liLink = `https://www.linkedin.com/feed/update/urn:li:share:${liId}`;

                    await sendAdminNotification(`✅ <b>Пост успешно опубликован!</b>\n\n🔗 <a href="${tgLink}">Telegram</a>\n🔗 <a href="${liLink}">LinkedIn</a>`);
                }
                
                saveLastProcessedId(post.message_id);
            } catch (err) {
                console.error(`Failed to process message ${post.message_id}:`, err.message);
                await sendAdminNotification(`❌ <b>Error processing message ${post.message_id}</b>\n\n<code>${err.message}</code>`);
            }
        }
    } catch (error) {
        console.error('Error during sync:', error.message);
        await sendAdminNotification(`❌ <b>Sync Error!</b>\n\n<code>${error.message}</code>`);
        process.exit(1);
    }
}

run();
