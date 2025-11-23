# ai_fastapi_full.py
import json
import logging
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from interviewer import chat_stream  

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="AI Interview API")

# ----------------------- CORS -----------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------- Schemas -----------------------
class AIInitRequest(BaseModel):
    interview_id: str

class AIAspectRequest(BaseModel):
    interview_id: str
    answer: Optional[str] = ""
    question_index: int = 0  # Optional, for tracking

# ----------------------- REST Endpoints -----------------------
@app.post("/ai-aspect-init")
async def ai_aspect_init(req: AIInitRequest):
    """
    Initialize AI interview: generate first set of questions
    """
    try:
        initial_questions = [
            {"question": "Tell me about yourself."},
            {"question": "What are your strengths?"},
            {"question": "Describe a challenging project you worked on."},
            {"question": "Where do you see yourself in 5 years?"}
        ]
        return {"questions": initial_questions, "next_index": 0}
    except Exception as e:
        logging.error(f"AI Init Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai-aspect")
async def ai_aspect(req: AIAspectRequest):
    """
    Polling endpoint.
    Returns AI-generated next question based on candidate's answer.
    """
    try:
        # Use LLM to generate next question dynamically
        ai_response = ""
        async for token in chat_stream(req.answer):
            ai_response += token

        return {
            "question": ai_response.strip(),
            "next_index": req.question_index + 1,
            "finished": False,
            "ai_response": ai_response
        }

    except Exception as e:
        logging.error(f"AI Aspect Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------- WebSocket Streaming Endpoint -----------------------
@app.websocket("/ws/ai-aspect")
async def ai_aspect_ws(websocket: WebSocket):
    """
    Real-time AI interaction. Sends AI response token by token.
    Expects a JSON:
    {
        "interview_id": "...",
        "answer": "...",
        "question_index": 0
    }
    """
    await websocket.accept()
    logging.info("Client connected to AI WebSocket")
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg_json = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "Invalid JSON"}))
                continue

            user_answer = msg_json.get("answer", "")
            question_index = msg_json.get("question_index", 0)

            # Stream AI response token by token using chat_stream
            ai_response = ""
            async for token in chat_stream(user_answer):
                ai_response += token
                await websocket.send_text(json.dumps({
                    "type": "chunk",
                    "data": token
                }))

            # Send next question & metadata
            await websocket.send_text(json.dumps({
                "type": "end",
                "question": ai_response.strip(),
                "next_index": question_index + 1,
                "ai_response": ai_response,
                "finished": False
            }))

    except WebSocketDisconnect:
        logging.info("Client disconnected from AI WebSocket")
    except Exception as e:
        logging.error(f"WebSocket AI Error: {e}")
        await websocket.send_text(json.dumps({"error": str(e)}))


# ----------------------- Run server -----------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
