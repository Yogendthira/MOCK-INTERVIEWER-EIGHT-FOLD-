# server.py
import json
import logging
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Import our AI logic
from interviewer import chat_stream

app = FastAPI()
logging.basicConfig(level=logging.INFO)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logging.info("Client connected")

    try:
        while True:
            # 1. Receive Text
            data = await websocket.receive_text()
            
            try:
                msg_json = json.loads(data)
            except json.JSONDecodeError:
                continue

            if msg_json.get("type") == "ask":
                user_text = msg_json.get("text", "")
                
                if user_text:
                    logging.info(f"User said: {user_text}")
                    
                    # 2. Stream AI Response
                    async for token in chat_stream(user_text):
                        await websocket.send_text(json.dumps({
                            "type": "chunk",
                            "data": token
                        }))

                    # 3. End Signal
                    await websocket.send_text(json.dumps({"type": "end"}))

    except WebSocketDisconnect:
        logging.info("Client disconnected cleanly")
    except Exception as e:
        logging.error(f"Server Error: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)