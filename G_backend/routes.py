from flask import Blueprint, request, jsonify
from database import db
from bson.objectid import ObjectId

from database.db import interviews_collection

from gridfs import GridFS

routes = Blueprint('routes', __name__)

# Ensure we have access to MongoDB client
client = db.client  # db.client should be MongoClient instance
database = client["interviewAssistantDB"]

# Collections
interviews_collection = database["interviews"]

# Initialize GridFS
fs = GridFS(database)

routes = Blueprint('routes', __name__)

@routes.route('/init_interview', methods=['POST'])
def init_interview():
    try:
        resume_file = request.files.get('resume')
        job_desc = request.form.get('job_description', '')
        interview_type = request.form.get('interview_type', '')
        duration = request.form.get('duration', '')

        if not resume_file:
            return jsonify({"error": "Resume file is required"}), 400

        # Validate interview_type
        valid_types = ["technical", "technical advanced", "managerial", "personal"]
        if interview_type not in valid_types:
            return jsonify({"error": f"Invalid interview type. Must be one of {valid_types}"}), 400

        # Validate duration
        valid_durations = ["15 minutes", "30 minutes", "45 minutes", "60 minutes"]
        if duration not in valid_durations:
            return jsonify({"error": f"Invalid duration. Must be one of {valid_durations}"}), 400

        resume_data = resume_file.read()
        resume_filename = resume_file.filename

        # Insert into DB (assuming insert_interview supports extra fields)
        result = db.insert_interview(
            resume_data=resume_data,
            resume_filename=resume_filename,
            job_description=job_desc,
            interview_type=interview_type,
            duration=duration
        )

        return jsonify({"message": "Interview initialized", "inserted_id": str(result.inserted_id)}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@routes.route('/update-interview-questions', methods=['PATCH'])
def patch_questions():
    try:
        data = request.json
        interview_id = data.get('interview_id')
        question = data.get('question')
        answer = data.get('answer')

        if not interview_id or question is None or answer is None:
            return jsonify({"error": "interview_id, question, and answer are required"}), 400

        # Prepare the question entry with dummy review
        question_entry = [question, answer, ""]  # review left empty for now

        # Use your helper function to push to 'questions_asked'
        # First fetch current questions
        interview = interviews_collection.find_one({"_id": ObjectId(interview_id)})
        if not interview:
            return jsonify({"error": "Interview not found"}), 404

        current_questions = interview.get("questions_asked", [])
        current_questions.append(question_entry)

        # Update the document
        result = interviews_collection.update_one(
            {"_id": ObjectId(interview_id)},
            {"$set": {"questions_asked": current_questions}}
        )

        return jsonify({"message": "Question updated successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@routes.route('/end-interview-summary', methods=['PATCH'])
def patch_summary():
    try:
        data = request.json
        interview_id = data.get('interview_id')
        overall_review = data.get('overall_review', "")
        time_taken = data.get('time_taken', "")
        summarized = data.get('summarized', "")

        if not interview_id:
            return jsonify({"error": "interview_id is required"}), 400

        result = db.end_interview(interview_id, overall_review, time_taken, summarized)
        if result.matched_count == 0:
            return jsonify({"error": "Interview not found"}), 404

        return jsonify({"message": "Interview summary updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@routes.route('/fetch-interview/<interview_id>', methods=['GET'])
def fetch_interview(interview_id):
    try:
        interview = interviews_collection.find_one({"_id": ObjectId(interview_id)})
        if not interview:
            return jsonify({"error": "Interview not found"}), 404

        # Convert GridFS reference to filename only
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

@routes.route('/ai-aspect-init', methods=['POST'])
def ai_aspect_init():
    try:
        data = request.json
        interview_id = data.get("interview_id")
        # In future: call AI model here to generate first question
        # For now, mock 4 questions
        initial_questions = [
            {"question": "Tell me about yourself."},
            {"question": "What are your strengths?"},
            {"question": "Describe a challenging project you worked on."},
            {"question": "Where do you see yourself in 5 years?"}
        ]
        return jsonify({"questions": initial_questions, "next_index": 0}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@routes.route('/ai-aspect', methods=['POST'])
def ai_aspect():
    try:
        data = request.json
        interview_id = data.get("interview_id")
        user_transcript = data.get("answer")  # transcript of user speech
        question_index = data.get("question_index", 0)

        # For now: just return next question in the list
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

@routes.route('/store-video', methods=['POST'])
def store_video():
    try:
        interview_id = request.form.get("interview_id")
        video_file = request.files.get("video")

        if not interview_id or not video_file:
            return jsonify({"error": "Interview ID and video file are required"}), 400

        # Save video in GridFS
        file_id = fs.put(video_file.read(), filename=video_file.filename)

        # Update interview document with video reference
        interviews_collection.update_one(
            {"_id": ObjectId(interview_id)},
            {"$set": {"video_file_id": file_id, "video_filename": video_file.filename}}
        )

        return jsonify({"message": "Video stored successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@routes.route("/generate-summary", methods=["POST", "OPTIONS"])
def generate_summary():
    # Handle CORS preflight OPTIONS request
    if request.method == "OPTIONS":
        response = jsonify({"message": "OK"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Headers", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        return response

    data = request.get_json()
    interview_id = data.get("interview_id")

    print(f"[DEBUG] Generating summary for interview: {interview_id}")

    # ---- Dummy summary data ----
    dummy_summary = {
        "interview_id": interview_id,
        "summary": "This is a placeholder summary. The real AI summary will be generated here.",
        "strengths": ["Good communication", "Strong technical foundation"],
        "improvements": ["More concise answers", "Explain reasoning more clearly"]
    }

    # Return a dummy response
    response = jsonify(dummy_summary)
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response


