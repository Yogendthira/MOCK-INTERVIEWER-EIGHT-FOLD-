from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json
from dotenv import load_dotenv

# Load .env before anything else
load_dotenv()

# Import after .env is loaded
from database.db import users_collection
from G_backend.routes import routes


app = Flask(__name__)
CORS(app)

# Register Blueprint
app.register_blueprint(routes)

# Ollama
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "phi3:3.8b"


@app.route('/', methods=['GET'])
def home():
    return 'Server running'


@app.route('/chat', methods=['POST'])
def chat():
    try:
        if not request.is_json:
            return jsonify({'response': 'Invalid request. Expected JSON body.'}), 400

        data = request.get_json(force=True)
        user_msg = data.get('message', '').strip()

        if not user_msg:
            return jsonify({'response': 'Empty message'}), 400

        system_prompt = (
            "You are a professional job interviewer. "
            "LIMIT YOUR WORDS TO 50. "
            "Ask relevant interview questions and evaluate responses thoughtfully."
        )

        full_prompt = f"{system_prompt}\n\nCandidate: {user_msg}"

        response = requests.post(
            OLLAMA_URL,
            json={"model": MODEL, "prompt": full_prompt, "stream": False},
            timeout=60
        )

        response.raise_for_status()
        bot_response = response.json().get('response', '').strip()

        if not bot_response:
            bot_response = 'BOT RESPONSE NOT PROVIDED'

        return jsonify({'response': bot_response})

    except requests.exceptions.ConnectionError:
        return jsonify({'response': 'Error: Ollama not running on localhost:11434'}), 500

    except Exception as e:
        return jsonify({'response': f'Internal Error: {str(e)}'}), 500


if __name__ == '__main__':
    print("Starting server at http://localhost:5000")
    print("Ensure Ollama is running: http://localhost:11434")
    app.run(debug=True, port=5000, host='0.0.0.0')
