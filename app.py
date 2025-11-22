from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json

app = Flask(__name__)
CORS(app)

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "phi3:3.8b"

@app.route('/', methods=['GET'])
def home():
    return 'Server running'

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        user_msg = data.get('message', '')
        
        if not user_msg:
            return jsonify({'response': 'Empty message'})
        
        system_prompt = "You are a professional job interviewer.LIIMIT YOUR WORDS TO 50 WORDS . Ask relevant interview questions and evaluate candidate responses thoughtfully."
        full_prompt = system_prompt + "\n\nCandidate: " + user_msg
        
        response = requests.post(OLLAMA_URL, json={
            'model': MODEL,
            'prompt': full_prompt,
            'stream': False
        }, timeout=60)
        
        response.raise_for_status()
        bot_response = response.json().get('response')
        
        if not bot_response or bot_response.strip() == '':
            bot_response = 'BOT RESPOND RESPONSE PROVIDED'
        
        return jsonify({'response': bot_response})
    
    except requests.exceptions.ConnectionError:
        return jsonify({'response': 'Error: Ollama not running on localhost:11434'}), 500
    except Exception as e:
        return jsonify({'response': f'Error: {str(e)}'}), 500

if __name__ == '__main__':
    print("Starting server on http://localhost:5000")
    print("Make sure Ollama is running on http://localhost:11434")
    app.run(debug=True, port=5000, host='0.0.0.0')