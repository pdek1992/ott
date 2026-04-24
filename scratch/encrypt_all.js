
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASSPHRASE = "VIGIL_SIDDHI_PROD_2026";
const SOURCE_DIR = path.join('d:', 'Desktop Folders', 'Android app', 'OTT', 'plaintext_keys');
const TARGET_DIR = path.join('d:', 'Desktop Folders', 'Android app', 'OTT', 'keys');

const FILES_TO_ENCRYPT = [
    'allowed_emails.json',
    'allowed_userids.json',
    'description.json',
    'keys.json',
    'mpd_mapping.json'
];

async function encryptData(data, phrase) {
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash('sha256').update(phrase).digest();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    function toBase64Url(buf) {
        return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    return {
        encrypted: true,
        algorithm: "AES-GCM",
        iv: toBase64Url(iv),
        ciphertext: toBase64Url(Buffer.concat([encrypted, tag]))
    };
}

async function run() {
    if (!fs.existsSync(TARGET_DIR)) fs.mkdirSync(TARGET_DIR, { recursive: true });

    for (const fileName of FILES_TO_ENCRYPT) {
        const sourcePath = path.join(SOURCE_DIR, fileName);
        if (!fs.existsSync(sourcePath)) {
            console.log(`Skipping missing file: ${fileName}`);
            continue;
        }

        const content = fs.readFileSync(sourcePath, 'utf8');

        // We no longer hardcode replacements. We just encrypt exactly what is in the plaintext_keys file!
        const wrapped = await encryptData(content, PASSPHRASE);
        const targetPath = path.join(TARGET_DIR, fileName);
        fs.writeFileSync(targetPath, JSON.stringify(wrapped, null, 2));
        console.log(`Encrypted and saved: ${fileName}`);
    }
}

run().catch(console.error);
