from flask import Blueprint, jsonify
import os

from database.db import users_collection
from database.db import test_collection
import bcrypt

from PyPDF2 import PdfReader
import uuid
from flask import Blueprint, request, jsonify


routes = Blueprint('G_backend', __name__)

@routes.route('/test', methods=['GET'])
def test():
    return jsonify({'response': 'Test route is working!'})

@routes.route('/test-db', methods=['GET'])
def test_db():
    try:
        # Insert sample document
        result = test_collection.insert_one({
            "message": "Hello from test-db route",
            "status": "working"
        })

        return jsonify({
            "message": "Blueprint route works",
            "inserted_id": str(result.inserted_id)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@routes.route('/get-and-process-resume', methods=['POST'])
def get_and_process_resume():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']

        if file.filename == '':
            return jsonify({"error": "Empty filename"}), 400
        
        if not file.filename.lower().endswith('.pdf'):
            return jsonify({"error": "Only PDF files are allowed"}), 400

        # Step 1: Extract text from PDF
        reader = PdfReader(file)
        extracted_text = ""

        for page in reader.pages:
            extracted_text += page.extract_text() or ""

        extracted_text = extracted_text.strip()

        if not extracted_text:
            return jsonify({"error": "Unable to extract text from PDF"}), 500

        # Step 2: Process the extracted text (Placeholder for your logic)
        # Example processing — you can replace this with LLM call, NLP, etc.
        processed_json = {
            "resume_id": str(uuid.uuid4()),
            "raw_text": extracted_text,
            "summary": extracted_text[:300],  # sample "processing"
            "skills_detected": [],            # fill with NLP later
            "status": "processed"
        }

        # Step 3: Store in MongoDB
        inserted = users_collection.insert_one(processed_json)

        return jsonify({
            "message": "Resume processed successfully",
            "resume_id": processed_json["resume_id"],
            "inserted_id": str(inserted.inserted_id),
            "data": processed_json
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

