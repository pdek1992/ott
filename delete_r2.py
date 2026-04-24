import boto3

s3 = boto3.client(
    's3',
    endpoint_url='https://e63579be88693f2808e148ec66d99bb4.r2.cloudflarestorage.com',
    aws_access_key_id='bedad63e7d77b0333f1919b3e1108de3',
    aws_secret_access_key='8221fc741872946cc48a5d03bc84960f85693d9f44208113c6c508488901f5b9'
)

bucket = 'ott'
prefix = 'free'  # folder name

# List objects
objects = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)

# Delete them
if 'Contents' in objects:
    delete_keys = [{'Key': obj['Key']} for obj in objects['Contents']]
    
    s3.delete_objects(
        Bucket=bucket,
        Delete={'Objects': delete_keys}
    )

    print("✅ Folder deleted successfully")
else:
    print("⚠️ No objects found")