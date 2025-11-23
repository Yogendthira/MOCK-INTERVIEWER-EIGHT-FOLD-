from flask import Flask, request, jsonify
from flask_cors import CORS
import chromadb
import requests
import uuid

app = Flask(__name__)
CORS(app)

client = chromadb.PersistentClient(path="./chroma_data")
collection = client.get_or_create_collection(name="chats")
counter = 0

@app.route('/api/send-message', methods=['POST'])
def send_message():
    msg = request.json.get('message', '').strip()
    if not msg:
        return jsonify({'error': 'Empty'}), 400
    
    try:
        import time
        
        res = requests.post("http://localhost:11434/api/generate", json={
            "model": "phi3:3.8b",
            "prompt": msg,
            "stream": False
        })
        bot_msg = res.json().get('response', 'Error').strip()
        
        timestamp_user = str(time.time())
        timestamp_bot = str(float(timestamp_user) + 0.1)
        
        collection.add(
            ids=[timestamp_user + "_user", timestamp_bot + "_bot"],
            documents=[msg, bot_msg],
            metadatas=[{"role": "user", "ts": timestamp_user}, {"role": "bot", "ts": timestamp_bot}]
        )
        print(f"✓ Stored: {msg[:30]}... -> {bot_msg[:30]}...")
        return jsonify({'user_message': msg, 'bot_response': bot_msg})
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/get-history', methods=['GET'])
def get_history():
    r = collection.get()
    msgs = [{'text': d, 'role': m['role'], 'ts': float(m.get('ts', 0))} for d, m in zip(r['documents'], r['metadatas'])]
    msgs.sort(key=lambda x: x['ts'])
    return jsonify({'messages': msgs})

@app.route('/api/clear-history', methods=['POST'])
def clear_history():
    r = collection.get()
    if r['ids']:
        collection.delete(ids=r['ids'])
    return jsonify({'status': 'ok'})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    r = collection.get()
    return jsonify({
        'total_messages': len(r['ids']),
        'user_messages': sum(1 for m in r['metadatas'] if m['role'] == 'user'),
        'bot_messages': sum(1 for m in r['metadatas'] if m['role'] == 'bot')
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)