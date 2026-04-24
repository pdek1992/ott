import subprocess
import sys
import os

def main():
    print("🎬 Starting Automated Video Processing Service...")
    print("📁 Monitoring folder: /input")
    
    # Launch the transcoder service which handles the loop and triggers the packager
    transcoder_script = os.path.join('transcoder', 'transcode.py')
    
    try:
        subprocess.run([sys.executable, transcoder_script], check=True)
    except KeyboardInterrupt:
        print("\n👋 Service stopped by user.")
    except Exception as e:
        print(f"❌ Service crashed: {e}")

if __name__ == "__main__":
    main()
