from pymongo import MongoClient
import os
from dotenv import load_dotenv
from pathlib import Path

# Load .env from project root (one level above this file)
env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=env_path)

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise ValueError("MONGO_URI is missing in .env file")

client = MongoClient(MONGO_URI)

# Select your database
db = client["my_app_database"]

# Collections
users_collection = db["users"]
test_collection = db["test_collection"]
