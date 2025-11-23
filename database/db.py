from pymongo import MongoClient
from bson.objectid import ObjectId
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

# Load .env from project root (two levels above this file)
env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=env_path)

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("MONGO_URI is missing in .env file")

# MongoDB client and database
client = MongoClient(MONGO_URI)
db = client["interviewAssistantDB"]
interviews_collection = db["interviews"]  # Main collection
videos_collection = db["videos"]          # Video collection

# Helper functions
def insert_interview(resume_data, resume_filename, job_description, interview_type, duration,
                     name, skills, summarized):

    interview_data = {
        "resume_file": resume_data,
        "resume_filename": resume_filename,
        "name": name,
        "skills": skills,
        "job_description": job_description,
        "interview_type": interview_type,
        "duration": duration,
        "questions_asked": [],
        "overall_review": "",
        "time_taken": "",
        "summarized": summarized,
        "created_at": datetime.utcnow()
    }

    return interviews_collection.insert_one(interview_data)


def update_questions(interview_id, questions):
    return interviews_collection.update_one(
        {"_id": ObjectId(interview_id)},
        {"$set": {"questions_asked": questions}}
    )

def end_interview(interview_id, overall_review, time_taken, summarized):
    return interviews_collection.update_one(
        {"_id": ObjectId(interview_id)},
        {"$set": {
            "overall_review": overall_review,
            "time_taken": time_taken,
            "summarized": summarized
        }}
    )

def store_video(interview_id, video_file):
    doc = {
        "interview_id": ObjectId(interview_id),
        "video": video_file,
        "created_at": datetime.utcnow()
    }
    return videos_collection.insert_one(doc)
