const axios = require('axios');
const fs = require('fs');

const CHANNEL = 'keegooroomie';
const FROM_ID = 1;
const TO_ID = 368;
const POSTS_FILE = 'posts.txt';
const DELAY_MS = 300;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function parsePost(html, id) {
    const textMatch = html.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const dateMatch = html.match(/datetime="([^"]+)"/);

    if (!textMatch || !dateMatch) return null;

    const rawHtml = textMatch[1];
    const text = rawHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>/gi, (m) => {
            const emoji = m.match(/<b>([^<]+)<\/b>/);
            return emoji ? emoji[1] : '';
        })
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

    if (!text) return null;

    const timestamp = dateMatch[1].replace('T', ' ').slice(0, 19);
    const tgLink = `https://t.me/${CHANNEL}/${id}`;

    return { id, timestamp, tgLink, text };
}

async function main() {
    const posts = [];

    for (let id = FROM_ID; id <= TO_ID; id++) {
        try {
            const { data } = await axios.get(`https://t.me/${CHANNEL}/${id}?embed=1`, {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const post = parsePost(data, id);
            if (post) {
                posts.push(post);
                process.stdout.write(`✓ ${id} `);
            } else {
                process.stdout.write(`- ${id} `);
            }
        } catch {
            process.stdout.write(`✗ ${id} `);
        }

        await sleep(DELAY_MS);
    }

    console.log(`\n\nFound ${posts.length} posts with text.`);

    const existingContent = fs.existsSync(POSTS_FILE)
        ? fs.readFileSync(POSTS_FILE, 'utf8')
        : '';

    const newEntries = posts
        .map(p => `${p.tgLink} - ${p.timestamp}\n${p.text}`)
        .join('\n\n');

    fs.writeFileSync(POSTS_FILE, newEntries + '\n\n' + existingContent, 'utf8');
    console.log(`Written to ${POSTS_FILE}`);
}

main().catch(console.error);
