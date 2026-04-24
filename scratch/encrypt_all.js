
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASSPHRASE = "VIGIL_SIDDHI_PROD_2026";
const SOURCE_DIR = path.join('d:', 'Desktop Folders', 'Android app', 'OTT', 'web-ott', 'keys');
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

    // Browser-compatible Base64Url
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

        let content = fs.readFileSync(sourcePath, 'utf8');
        let data = JSON.parse(content);

        // Special handling for MPD Mapping updates
        if (fileName === 'mpd_mapping.json') {
            // Your original production URLs (OTT.prashant...)
            data["free"] = "https://ott.prashantkadam.in/free/manifest.mpd";
            data["asiacup"] = "https://ott.prashantkadam.in/asiacup/manifest.mpd";
            data["output_02_04"] = "https://ott.prashantkadam.in/output_02_04/manifest.mpd";
            data["output_2min"] = "https://ott.prashantkadam.in/output_2min/manifest.mpd";
            data["tmkoc"] = "https://ott.prashantkadam.in/tmkoc/manifest.mpd";
            data["withlogo"] = "https://ott.prashantkadam.in/withlogo/manifest.mpd";

            // Industry standard reference URLs (Direct)
            data["dash_if_livesim"] = "https://livesim.dashif.org/livesim/chunkdur_1/ato_7/testpic4_8s/Manifest.mpd";
            data["multirate_dash"] = "https://dash.akamaized.net/dash264/TestCases/1b/qualcomm/1/MultiRatePatched.mpd";
            data["hd_multireso"] = "https://dash.akamaized.net/dash264/TestCasesHD/2b/qualcomm/1/MultiResMPEG2.mpd";
            data["bitmovin_demo"] = "https://bitmovin-a.akamaihd.net/content/MI201109210084_1/mpds/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.mpd";
            data["bbb_itec"] = "http://ftp.itec.aau.at/datasets/DASHDataset2014/BigBuckBunny/2sec/BigBuckBunny_2s_onDemand_2014_05_09.mpd";

            content = JSON.stringify(data, null, 2);
        }

        const wrapped = await encryptData(content, PASSPHRASE);
        const targetPath = path.join(TARGET_DIR, fileName);
        fs.writeFileSync(targetPath, JSON.stringify(wrapped, null, 2));
        console.log(`Encrypted and saved: ${fileName}`);
    }
}

run().catch(console.error);
