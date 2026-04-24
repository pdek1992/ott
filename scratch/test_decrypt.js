const crypto = require('crypto');

async function decrypt() {
    const passphrase = "VigilSiddhi_Demo_Passphrase_2025";
    const ivBase64 = "ppGWez2foemYopvU";
    const ciphertextBase64 = "b0plF3MQSSesLoyhZYTKuh2J3Tx7ypYoSe_ZAPzFReEXBwpnleBxgQgMgHPNMWV-_12lhsLqCFaOtPmaOFZKO1goYrZT7-A4KxMW8sIS99Do5h6uzPV-AWK-n64PpF8M3toYGm_SEoiLwoFh_cKPGDAKwaM5Y5PObu7c785Ww5MvMDTikZcHTxbyo9oDIR3HmVHSQjJl4QOQFIy1oBdWW2RAqD6yCoX7njXJQxXBMxJZoi2U5dVhKeggRanc0Vh8x7q6qILgTf5j4V-sQKSbqoeRZQotBuL3mQ2wX3Dgf6GRHxUAaqX8sLxlOnM19gMQM2Q9bKocXT4I1yuRhg_WLRmSrreFdVSXmU73wRr8nxMT8Atcr2cYDgFyHqel6fsncE8zVixv493YOpiZzQLZdZWLetdlKEaVOVmHLR_1sdjXkMdeuap53Gyr112VHAOTd_Jm6gwDALDh1KneEVBoLZ3jKBdrOVyyjFyl2xVS9UodezVQX4VsR8-j1ckkWXDly2GfLk8daB0Sn-t1C7Ge20NAPk3kpp89-tp4lPC-Ua8M_BIjzmJ9K2q_bHe-UfijQpg07zuqBuxyn_naX_ONnBH-kK0atnTwGYl88231BQkCjP6VqoOxTQN2E4-xi-3WZUmul7BMLbzSwucnTB1pCsXu0QRJbGcn7ZmLGQD-NG4y0DS6rtmhmuO2LiF5lQRS0hQ5M1Hmgunp01V6sQacsZLMQ4jPbdPyvwEhGSYkAoc8fgtc1PO_0W9vqxW0yJI79tdjBTbxFXYQ8HG-1NT31iqe93QhznN76ZyIytwAa_69zlqqYBf8qY3FlNsIE7B4kiiKF_xc6skFYWAZrlrDzCjdVrb5cn7cyFhZ6_4oMo2D85-AvSRdJk-hUVkDEZYSPKQUiHUyDfQyeMbvTNTWohAuQEEQUmejns2AMyVZnQnzC9JV5nODf0aQzuI5PwQU";

    function fromBase64Url(b64) {
        return b64.replace(/-/g, '+').replace(/_/g, '/');
    }

    const iv = Buffer.from(fromBase64Url(ivBase64), 'base64');
    const ciphertext = Buffer.from(fromBase64Url(ciphertextBase64), 'base64');
    const keySource = crypto.createHash('sha256').update(passphrase).digest();

    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', keySource, iv.length === 12 ? iv : iv.slice(0, 12));
        // Note: IV might be 16 bytes encoded, result 12 bytes.
        // Base64Url "ppGWez2foemYopvU" (16 chars) -> 12 bytes exactly (12 * 4/3 = 16).
        
        const actualIv = iv.length === 12 ? iv : iv.slice(0, 12);
        const tag = ciphertext.slice(-16);
        const data = ciphertext.slice(0, -16);
        
        const decipherX = crypto.createDecipheriv('aes-256-gcm', keySource, actualIv);
        decipherX.setAuthTag(tag);
        const decrypted = Buffer.concat([decipherX.update(data), decipherX.final()]);
        console.log("Success:", decrypted.toString());
    } catch (e) {
        console.log("Failed:", e.message);
    }
}

decrypt();
