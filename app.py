from flask import Flask
from flask_cors import CORS
from G_backend.routes import routes

app = Flask(__name__)
CORS(app, origins="http://localhost:5173", supports_credentials=True) # Enable CORS for all domains

app.register_blueprint(routes)

PORT = 5000
print(f"Starting Flask server on port {PORT}...")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)



























# @app.route('/chat', methods=['POST'])
# def chat():
#     try:
#         if not request.is_json:
#             return jsonify({'response': 'Invalid request. Expected JSON body.'}), 400

#         data = request.get_json(force=True)
#         user_msg = data.get('message', '').strip()

#         if not user_msg:
#             return jsonify({'response': 'Empty message'}), 400

#         system_prompt = (
#             "You are a professional job interviewer. "
#             "LIMIT YOUR WORDS TO 50. "
#             "Ask relevant interview questions and evaluate responses thoughtfully."
#         )

#         full_prompt = f"{system_prompt}\n\nCandidate: {user_msg}"

#         response = requests.post(
#             OLLAMA_URL,
#             json={"model": MODEL, "prompt": full_prompt, "stream": False},
#             timeout=60
#         )

#         response.raise_for_status()
#         bot_response = response.json().get('response', '').strip()

#         if not bot_response:
#             bot_response = 'BOT RESPONSE NOT PROVIDED'

#         return jsonify({'response': bot_response})

#     except requests.exceptions.ConnectionError:
#         return jsonify({'response': 'Error: Ollama not running on localhost:11434'}), 500

#     except Exception as e:
#         return jsonify({'response': f'Internal Error: {str(e)}'}), 500
