# interviewer.py
import logging
import asyncio

from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Logging
logging.basicConfig(level=logging.INFO)

# Configuration
CHROMA_DB_DIR = "./chroma_db"
EMBEDDING_MODEL = "nomic-embed-text"
LLM_MODEL = "phi3:mini"

# --- Initialize Components ---

# A. Embeddings & Vector Store (Long Term Memory)
embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL)

vectorstore = Chroma(
    collection_name="interview_memory",
    embedding_function=embeddings,
    persist_directory=CHROMA_DB_DIR
)

# B. The LLM
llm = ChatOllama(
    model=LLM_MODEL,
    temperature=0.6,
)

# C. The Prompt
template = """You are an expert Technical Interviewer.
at most 50 words
YOUR GOAL:
Conduct a rigorous behavioral and technical interview.

RULES:
1. Do NOT accept vague answers. Dig deeper.
2. If the candidate mentions a technology, ask a specific technical question about it.
3. Keep your responses concise (under 3 sentences).
4. Ask ONE follow-up question at a time.

RELEVANT CONTEXT FROM PAST CONVERSATION:
{history}

CURRENT CANDIDATE INPUT:
{input}

YOUR RESPONSE:"""

prompt = ChatPromptTemplate.from_template(template)

# D. The Chain
chain = prompt | llm | StrOutputParser()

async def chat_stream(user_input: str):
    try:
        # --- Step 1: Retrieve Context ---
        docs = await vectorstore.asimilarity_search(user_input, k=3)
        
        history_text = "\n---\n".join([d.page_content for d in docs]) if docs else "No prior context."
        logging.info(f"Retrieved {len(docs)} memory snippets.")

        # --- Step 2: Stream Response ---
        full_response = ""
        
        async for chunk in chain.astream({"history": history_text, "input": user_input}):
            full_response += chunk
            yield chunk

        # --- Step 3: Save to Memory ---
        if full_response.strip():
            memory_entry = f"Candidate: {user_input}\nInterviewer: {full_response}"
            await vectorstore.aadd_texts([memory_entry])
            logging.info("Saved interaction to ChromaDB.")

    except Exception as e:
        logging.error(f"AI Engine Error: {e}")
        yield f"[Error: {str(e)}]"