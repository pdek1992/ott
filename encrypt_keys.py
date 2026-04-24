import os
import json
import hashlib
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ── Configuration ──────────────────────────────────────────────
SOURCE_DIR = 'plaintext_keys'
TARGET_DIR = 'keys'
PASSPHRASE = "VIGIL_SIDDHI_PROD_2026"

FILES_TO_PROCESS = [
    'allowed_emails.json',
    'allowed_userids.json',
    'description.json',
    'keys.json',
    'mpd_mapping.json',
    'observability.json'
]

def to_base64_url(data):
    """Browser-compatible Base64Url encoding."""
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def encrypt_data(data_str, phrase):
    """Encrypts data string using AES-GCM (SHA-256 derived key)."""
    # 1. Derive 256-bit key using SHA-256
    key = hashlib.sha256(phrase.encode('utf-8')).digest()
    
    # 2. Generate random 12-byte IV
    iv = os.urandom(12)
    
    # 3. Encrypt using AES-GCM
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(iv, data_str.encode('utf-8'), None)
    
    return {
        "encrypted": True,
        "algorithm": "AES-GCM",
        "iv": to_base64_url(iv),
        "ciphertext": to_base64_url(ciphertext_with_tag)
    }

def main():
    if not os.path.exists(TARGET_DIR):
        os.makedirs(TARGET_DIR)
    
    if not os.path.exists(SOURCE_DIR):
        print(f"ERROR: Source directory '{SOURCE_DIR}' not found. Please create it and add your JSON files.")
        return

    print(f"Starting batch encryption from '{SOURCE_DIR}' to '{TARGET_DIR}'...")
    
    for filename in FILES_TO_PROCESS:
        src_path = os.path.join(SOURCE_DIR, filename)
        if not os.path.exists(src_path):
            print(f"   WARNING: Skipping missing file: {filename}")
            continue
            
        with open(src_path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
                # Ensure bbb_dark_truths is correctly mapped if processing mpd_mapping
                if filename == 'mpd_mapping.json':
                    # Fix bbb_dark_truths as per user request
                    data["bbb_dark_truths"] = "http://ftp.itec.aau.at/datasets/DASHDataset2014/BigBuckBunny/2sec/BigBuckBunny_2s_onDemand_2014_05_09.mpd"
                    print(f"   OK: Corrected bbb_dark_truths mapping in {filename}")
                
                content_str = json.dumps(data, indent=2)
                encrypted_blob = encrypt_data(content_str, PASSPHRASE)
                
                dest_path = os.path.join(TARGET_DIR, filename)
                with open(dest_path, 'w', encoding='utf-8') as df:
                    json.dump(encrypted_blob, df, indent=2)
                
                print(f"   SUCCESS: Encrypted and saved: {filename}")
                
            except Exception as e:
                print(f"   ERROR processing {filename}: {e}")

    print("\nDONE. Current encrypted files in 'keys/' are now optimized and secure.")

if __name__ == "__main__":
    main()
