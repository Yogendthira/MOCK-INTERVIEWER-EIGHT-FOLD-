from flask import Blueprint, request, jsonify
from database import db
from database.db import interviews_collection
from bson.objectid import ObjectId
from gridfs import GridFS
import base64
import os
import json
import requests
from datetime import datetime

# ============================
# RESUME EXTRACTION MODULE
# ============================

OLLAMA_API = "http://localhost:11434/v1/generate"
MODEL = "phi3:mini"

def extract_name_from_resume(resume_text):
    lines = resume_text.split('\n')
    for line in lines[:10]:
        line = line.strip()
        if 2 < len(line) < 100:
            if not any(x in line.lower() for x in ['email', 'phone', 'address', 'linkedin', 'github', 'portfolio', '@', '|']):
                if not any(char.isdigit() for char in line) and any(char.isupper() for char in line):
                    name = line.replace('•', '').replace('-', '').replace('*', '').strip()
                    if 2 < len(name) < 60:
                        return name
    return "Unknown"

def extract_resume_text(file_storage):
    filename = file_storage.filename
    file_storage.stream.seek(0)
    data = file_storage.read()

    if filename.endswith('.txt'):
        return data.decode("utf-8", errors="ignore")
    if filename.endswith('.pdf'):
        try:
            import PyPDF2
            from io import BytesIO
            pdf_reader = PyPDF2.PdfReader(BytesIO(data))
            text = ""
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text
            return text
        except Exception as e:
            print("PDF extraction error:", e)
            return ""
    return ""

def extract_structured_keywords(resume_text):
    prompt = f"""
Extract ONLY keywords from this resume. Return ONLY in this EXACT format:

USERNAME: ...
PROGRAMMING_LANGUAGES: ...
FRAMEWORKS_LIBRARIES: ...
DATABASES: ...
TECHNICAL_SKILLS: ...
TOOLS_SOFTWARE: ...
ACHIEVEMENTS: ...
SOFT_SKILLS: ...
CERTIFICATIONS: ...
LANGUAGES: ...
PROJECTS: ...

Resume:
{resume_text}
"""
    try:
        response = requests.post(
            OLLAMA_API,
            json={
                "model": MODEL,
                "prompt": prompt,
                "max_tokens": 500,
                "temperature": 0
            },
            timeout=300
        )

        response.raise_for_status()  # <-- will raise error if HTTP not 200
        raw = response.json().get("completion", "")
        categories = { ... }  # keep your parsing logic here
        # parse 'raw' as before
        return categories

    except requests.exceptions.RequestException as e:
        print("Ollama request failed:", e)
        return None

# ============================
# FLASK ROUTES
# ============================

routes = Blueprint("routes", __name__)
client = db.client
database = client["interviewAssistantDB"]
interviews_collection = database["interviews"]
fs = GridFS(database)

# ---------------------------
# INIT INTERVIEW
# ---------------------------
@routes.route('/init_interview', methods=['POST'])
def init_interview():
    try:
        resume_file = request.files.get('resume')
        job_desc = request.form.get('job_description', '')
        interview_type = request.form.get('interview_type', '')
        duration = request.form.get('duration', '')

        if not resume_file:
            return jsonify({"error": "Resume file is required"}), 400

        valid_types = ["technical", "technical advanced", "managerial", "personal"]
        if interview_type not in valid_types:
            return jsonify({"error": f"Invalid interview type. Must be {valid_types}"}), 400

        valid_durations = ["15 minutes", "30 minutes", "45 minutes", "60 minutes"]
        if duration not in valid_durations:
            return jsonify({"error": f"Invalid duration. Must be {valid_durations}"}), 400

        # Extract resume text, name, and keywords
        resume_text = extract_resume_text(resume_file)
        extracted_name = extract_name_from_resume(resume_text)
        keyword_data = extract_structured_keywords(resume_text)
        print ("resume text : " + resume_text)
        print (keyword_data)

        # Rewind file for storage
        resume_file.stream.seek(0)
        resume_data = resume_file.read()

        result = interviews_collection.insert_one({
            "resume_filename": resume_file.filename,
            "resume_file": resume_data,
            "name": extracted_name,
            "skills": keyword_data,
            "job_description": job_desc,
            "interview_type": interview_type,
            "duration": duration,
            "questions_asked": [],
            "created_at": datetime.utcnow()
        })

        return jsonify({
            "message": "Interview initialized",
            "interview_id": str(result.inserted_id),
            "name": extracted_name,
            "skills": keyword_data
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------------
# UPDATE INTERVIEW QUESTIONS
# ---------------------------
@routes.route('/update-interview-questions', methods=['PATCH'])
def patch_questions():
    try:
        data = request.json
        interview_id = data.get('interview_id')
        question = data.get('question')
        answer = data.get('answer')

        if not interview_id or question is None or answer is None:
            return jsonify({"error": "interview_id, question, and answer are required"}), 400

        interview = interviews_collection.find_one({"_id": ObjectId(interview_id)})
        if not interview:
            return jsonify({"error": "Interview not found"}), 404

        current_questions = interview.get("questions_asked", [])
        current_questions.append([question, answer, ""])

        interviews_collection.update_one(
            {"_id": ObjectId(interview_id)},
            {"$set": {"questions_asked": current_questions}}
        )

        return jsonify({"message": "Question updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------------
# FETCH INTERVIEW
# ---------------------------
@routes.route('/fetch-interview/<interview_id>', methods=['GET'])
def fetch_interview(interview_id):
    try:
        interview = interviews_collection.find_one({"_id": ObjectId(interview_id)})
        if not interview:
            return jsonify({"error": "Interview not found"}), 404

        interview_data = {
            "name": interview.get("name"),
            "skills": interview.get("skills"),
            "job_description": interview.get("job_description"),
            "interview_type": interview.get("interview_type"),
            "duration": interview.get("duration"),
            "questions_asked": interview.get("questions_asked", []),
        }
        return jsonify(interview_data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------------
# AI ASPECT INIT
# ---------------------------
@routes.route('/ai-aspect-init', methods=['POST'])
def ai_aspect_init():
    try:
        initial_questions = [
            {"question": "Tell me about yourself."},
            {"question": "What are your strengths?"},
            {"question": "Describe a challenging project you worked on."},
            {"question": "Where do you see yourself in 5 years?"}
        ]
        return jsonify({"questions": initial_questions, "next_index": 0}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------------
# AI ASPECT NEXT QUESTION
# ---------------------------
@routes.route('/ai-aspect', methods=['POST'])
def ai_aspect():
    try:
        data = request.json
        question_index = data.get("question_index", 0)
        mock_questions = [
            "Tell me about yourself.",
            "What are your strengths?",
            "Describe a challenging project you worked on.",
            "Where do you see yourself in 5 years?"
        ]
        if question_index >= len(mock_questions):
            return jsonify({"question": None, "finished": False}), 200
        return jsonify({"question": mock_questions[question_index], "next_index": question_index + 1}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------------
# STORE VIDEO
# ---------------------------
@routes.route('/store-video', methods=['POST'])
def store_video():
    try:
        interview_id = request.form.get("interview_id")
        video_file = request.files.get("video")

        if not interview_id or not video_file:
            return jsonify({"error": "Interview ID and video file are required"}), 400

        file_id = fs.put(video_file.read(), filename=video_file.filename)
        interviews_collection.update_one(
            {"_id": ObjectId(interview_id)},
            {"$set": {"video_file_id": file_id, "video_filename": video_file.filename}}
        )

        return jsonify({"message": "Video stored successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------------
# GENERATE SUMMARY
# ---------------------------
@routes.route("/generate-summary", methods=["POST", "OPTIONS"])
def generate_summary():
    if request.method == "OPTIONS":
        response = jsonify({"message": "OK"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Headers", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        return response

    data = request.get_json()
    interview_id = data.get("interview_id")
    dummy_summary = {
        "interview_id": interview_id,
        "summary": "This is a placeholder summary. The real AI summary will be generated here.",
        "strengths": ["Good communication", "Strong technical foundation"],
        "improvements": ["More concise answers", "Explain reasoning more clearly"]
    }
    response = jsonify(dummy_summary)
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response

# ---------------------------
# GET INTERVIEW (WITH RESUME + VIDEO BASE64)
# ---------------------------
@routes.route('/get_interview', methods=['GET'])
def get_interview():
    try:
        interview_id = request.args.get("interview_id")
        if not interview_id:
            return jsonify({"error": "interview_id is required"}), 400
        if not ObjectId.is_valid(interview_id):
            return jsonify({"error": "Invalid interview_id"}), 400

        interview = interviews_collection.find_one({"_id": ObjectId(interview_id)})
        if not interview:
            return jsonify({"error": "Interview not found"}), 404

        resume_data = interview.get("resume_file")
        resume_base64 = base64.b64encode(resume_data).decode("utf-8") if resume_data else None

        video_file_id = interview.get("video_file_id")
        video_filename = interview.get("video_filename")
        video_base64 = None
        if video_file_id:
            try:
                grid_out = fs.get(video_file_id)
                video_base64 = base64.b64encode(grid_out.read()).decode("utf-8")
            except Exception:
                video_base64 = None

        response_data = {
            "_id": str(interview["_id"]),
            "resume_filename": interview.get("resume_filename"),
            "resume_file": resume_base64,
            "name": interview.get("name"),
            "skills": interview.get("skills", []),
            "job_description": interview.get("job_description"),
            "interview_type": interview.get("interview_type"),
            "duration": interview.get("duration"),
            "questions_asked": interview.get("questions_asked", []),
            "overall_review": interview.get("overall_review", ""),
            "time_taken": interview.get("time_taken", ""),
            "summarized": interview.get("summarized"),
            "created_at": interview.get("created_at").isoformat() if interview.get("created_at") else None,
            "video_filename": video_filename,
            "video_file": video_base64
        }

        return jsonify(response_data), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
