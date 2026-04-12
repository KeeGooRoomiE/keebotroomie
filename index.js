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

/**
 * Helper to group logs in GitHub Actions
 */
function logGroup(name, callback) {
    console.log(`::group::${name}`);
    callback();
    console.log('::endgroup::');
}

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
        const content = fs.readFileSync(STATE_FILE, 'utf8').trim();
        return content ? parseInt(content) : 0;
    }
    return 0;
}

function saveLastProcessedId(id) {
    fs.writeFileSync(STATE_FILE, id.toString());
}

/**
 * Super-aggressive text cleaning for reliable comparison.
 * Removes all non-alphanumeric characters, emojis, and extra spaces.
 */
function superClean(text) {
    if (!text) return '';
    // Remove HTML tags
    let cleaned = text.replace(/<[^>]*>?/gm, '');
    // Convert to lowercase
    cleaned = cleaned.toLowerCase();
    // Remove all non-alphanumeric characters (including emojis, punctuation, etc.)
    // Keeps only letters and numbers
    cleaned = cleaned.replace(/[^a-z0-9а-яё]/gi, '');
    return cleaned;
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

async function isDuplicateOnLinkedIn(text) {
    if (!text) return false;
    try {
        const response = await axios.get(`https://api.linkedin.com/v2/ugcPosts?q=author&author=${encodeURIComponent(LINKEDIN_PERSON_URN)}&count=20`, {
            headers: {
                'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
                'X-Restli-Protocol-Version': '2.0.0'
            }
        });

        const posts = response.data.elements || [];
        const compareText = superClean(text).substring(0, 100);

        for (const post of posts) {
            const shareContent = post.specificContent['com.linkedin.ugc.ShareContent'];
            if (shareContent && shareContent.shareCommentary && shareContent.shareCommentary.text) {
                const existingText = superClean(shareContent.shareCommentary.text).substring(0, 100);
                if (existingText === compareText) {
                    console.log(`Match found: "${existingText}" === "${compareText}"`);
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking LinkedIn history:', error.message);
        return false;
    }
}

async function createLinkedInPost(text, assetUrns) {
    const media = assetUrns.map(urn => ({
        status: 'READY',
        description: { text: 'Post Image' },
        media: urn,
        title: { text: 'Post Image' }
    }));

    // Clean text for LinkedIn display (remove HTML/Markdown but keep spaces/emojis)
    const displayText = text.replace(/<[^>]*>?/gm, '').replace(/(\*|_|`|\[|\]|\(|\))/g, '').trim();

    const postData = {
        author: LINKEDIN_PERSON_URN,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: displayText || ' ' },
                shareMediaCategory: media.length > 0 ? 'IMAGE' : 'NONE',
                media: media
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
            return 'DUPLICATE';
        }
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
            await sendAdminNotification(`⚠️ <b>LinkedIn Token Expired!</b>\n\nRepo: ${REPO_URL}`);
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
    console.log(`Last processed message ID from file: ${lastId}`);

    try {
        // We use offset = lastId + 1 to get only NEW messages
        const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastId + 1}`);
        const updates = response.data.result;

        if (updates.length === 0) {
            console.log('No new updates found.');
            return;
        }

        // Grouping by media_group_id for albums
        const groups = {};
        for (const update of updates) {
            const post = update.channel_post;
            if (!post) continue;

            // CRITICAL: Strict ID check to prevent off-by-one errors
            if (post.message_id <= lastId) {
                console.log(`Skipping message ${post.message_id} because it is not newer than ${lastId}`);
                continue;
            }

            const chatUsername = post.chat.username ? `@${post.chat.username}` : post.chat.id.toString();
            if (chatUsername !== TARGET_CHANNEL_ID && post.chat.id.toString() !== TARGET_CHANNEL_ID) continue;

            const groupId = post.media_group_id || `single_${post.message_id}`;
            if (!groups[groupId]) {
                groups[groupId] = {
                    message_id: post.message_id,
                    text: post.text || post.caption || '',
                    photos: [],
                    chat_username: post.chat.username
                };
            }
            if (post.photo) {
                groups[groupId].photos.push(post.photo[post.photo.length - 1].file_id);
            }
            if (!groups[groupId].text && (post.text || post.caption)) {
                groups[groupId].text = post.text || post.caption;
            }
        }

        const groupIds = Object.keys(groups).sort((a, b) => groups[a].message_id - groups[b].message_id);

        if (groupIds.length === 0) {
            console.log('No new valid messages to process.');
            return;
        }

        // If this is the FIRST run (lastId is 0), just save the latest ID and exit
        if (lastId === 0) {
            const latestId = groups[groupIds[groupIds.length - 1]].message_id;
            console.log(`First run detected. Initializing state with ID: ${latestId}`);
            saveLastProcessedId(latestId);
            await sendAdminNotification(`🚀 <b>Бот инициализирован!</b>\n\nТочка отсчета установлена на ID: ${latestId}. Следующие посты будут синхронизированы.`);
            return;
        }

        for (const groupId of groupIds) {
            const group = groups[groupId];
            await logGroup(`Processing Post ${group.message_id}`, async () => {
                console.log(`Text: ${group.text.substring(0, 50)}...`);
                
                if (await isDuplicateOnLinkedIn(group.text)) {
                    console.log('Duplicate found on LinkedIn (SuperClean). Skipping.');
                    saveLastProcessedId(group.message_id);
                    return;
                }

                try {
                    const assetUrns = [];
                    for (const fileId of group.photos) {
                        console.log(`Uploading image ${fileId}...`);
                        const imageBuffer = await downloadFile(fileId);
                        const uploadInfo = await registerImageUpload();
                        const uploadUrl = uploadInfo.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
                        await uploadImageBinary(uploadUrl, imageBuffer);
                        assetUrns.push(uploadInfo.asset);
                    }

                    const linkedinPostUrn = await createLinkedInPost(group.text, assetUrns);
                    if (linkedinPostUrn !== 'DUPLICATE') {
                        const tgLink = group.chat_username ? `https://t.me/${group.chat_username}/${group.message_id}` : 'N/A';
                        const liLink = `https://www.linkedin.com/feed/update/urn:li:share:${linkedinPostUrn.split(':').pop()}`;
                        await sendAdminNotification(`✅ <b>Пост опубликован!</b>\n\n🔗 <a href="${tgLink}">Telegram</a>\n🔗 <a href="${liLink}">LinkedIn</a>`);
                    }
                    saveLastProcessedId(group.message_id);
                } catch (err) {
                    console.error('Error:', err.message);
                    await sendAdminNotification(`❌ <b>Error Post ${group.message_id}</b>\n\n<code>${err.message}</code>`);
                }
            });
        }
    } catch (error) {
        console.error('Sync Error:', error.message);
        process.exit(1);
    }
}

run();
