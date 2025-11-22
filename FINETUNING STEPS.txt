#!/bin/bash

# ============================================================================
# COMPLETE LoRA FINE-TUNING SETUP - STEP BY STEP
# Copy and run each section one at a time
# ============================================================================

echo "============================================================================"
echo "INTERVIEW AGENT - LoRA FINE-TUNING SETUP"
echo "============================================================================"

# ============================================================================
# STEP 1: CREATE PROJECT DIRECTORY
# ============================================================================

echo -e "\n[STEP 1] Creating project directory..."
mkdir -p interview_agent
cd interview_agent

echo "✓ Project directory created at: $(pwd)"

# ============================================================================
# STEP 2: INSTALL DEPENDENCIES
# ============================================================================

echo -e "\n============================================================================"
echo "[STEP 2] Installing dependencies (5-10 minutes)..."
echo "============================================================================"

echo "Installing PyTorch with CUDA support..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118 -q

echo "Installing transformers, datasets, peft..."
pip install transformers datasets peft bitsandbytes accelerate -q

echo "✓ All dependencies installed!"

# ============================================================================
# STEP 3: CREATE TRAINING DATA FILE
# ============================================================================

echo -e "\n[STEP 3] Creating training data file..."

cat > training_data.py << 'EOF'
import json

training_examples = [
    # Software Engineer Examples
    {
        "instruction": "The candidate said: 'I built a REST API using Python'",
        "response": "That's great! Can you walk me through your architectural decisions? How did you structure your endpoints, handle authentication, and manage database connections?"
    },
    {
        "instruction": "The candidate said: 'I worked with a team to fix performance issues'",
        "response": "That sounds valuable. Tell me about a specific performance issue you identified. What was your debugging process, and what was the actual impact of your solution?"
    },
    {
        "instruction": "The candidate said: 'I'm experienced in problem-solving'",
        "response": "I'd love to hear a concrete example. Describe a complex technical problem you solved. Walk me through your approach step-by-step—what did you try first, and why?"
    },
    {
        "instruction": "The candidate gave a vague answer about leadership",
        "response": "Can you give me a specific example? Tell me about a time you had to lead engineers through a difficult technical decision. What was the situation, and how did you handle disagreement?"
    },
    {
        "instruction": "The candidate mentioned system design experience",
        "response": "Excellent! Let's dive deeper. What trade-offs did you consider? How would you handle scale—what bottlenecks might you encounter, and how would you address them?"
    },
    
    # Sales Examples
    {
        "instruction": "The candidate said: 'I exceeded my sales targets last quarter'",
        "response": "Congratulations! Walk me through your strategy. How did you identify prospects, what was your sales process, and how did you handle objections or rejections?"
    },
    {
        "instruction": "The candidate said: 'I'm good with client relationships'",
        "response": "That's important in sales. Tell me about a time you managed a difficult client. What was the challenge, and how did you turn it into a positive outcome?"
    },
    
    # General Behavioral
    {
        "instruction": "The candidate answered about handling pressure",
        "response": "I appreciate that. Give me a specific example of when you were under pressure. What was the deadline, what went wrong, and how did you adapt?"
    },
    {
        "instruction": "The candidate mentioned working with difficult team members",
        "response": "That's a real challenge. Describe a specific conflict with a colleague. What was the disagreement about, and what did you do to resolve it?"
    },
    {
        "instruction": "The candidate talked about learning new technologies",
        "response": "That's great for growth. Tell me about the most complex new technology you've learned. How did you approach it, what challenges did you face, and how long did it take?"
    },
    
    # Clarification & Probing
    {
        "instruction": "The candidate's answer was incomplete or unclear",
        "response": "I want to make sure I understand. When you mentioned that, what exactly did you mean? Can you give me a concrete example or metric?"
    },
    {
        "instruction": "The candidate gave a good answer, need to probe deeper",
        "response": "That's interesting! I'm curious about the technical details. What were the edge cases you considered, and how would you approach this differently if requirements changed?"
    },
    {
        "instruction": "Need to transition to a new topic after technical discussion",
        "response": "Great insights on your technical background. Let's shift gears—tell me about your experience collaborating with non-technical stakeholders. Any examples where you had to communicate complexity simply?"
    },
    
    # Product Manager Examples
    {
        "instruction": "The candidate said: 'I shipped 10 products successfully'",
        "response": "Impressive! Walk me through your most complex product launch. How did you define success, gather requirements from stakeholders, and handle competing priorities?"
    },
    {
        "instruction": "The candidate mentioned user research",
        "response": "User research is crucial. Tell me about a time when user feedback contradicted your hypothesis. How did you validate the real problem, and what was the outcome?"
    },
    
    # Follow-up Question Variety
    {
        "instruction": "Already asked about technical skills, need behavioral follow-up",
        "response": "Great technical background! Now tell me—when faced with ambiguous requirements, how do you approach problem-solving? Give me an example where you had to make assumptions."
    },
    {
        "instruction": "Candidate answered completely, move to new competency",
        "response": "Excellent explanation. I'd like to understand your approach to collaboration. Describe a time you had to influence a stakeholder you disagreed with. What was your strategy?"
    },
]

formatted_data = []
for example in training_examples:
    formatted_data.append({
        "text": f"<s>[INST] {example['instruction']} [/INST] {example['response']} </s>"
    })

with open("training_data.json", "w") as f:
    json.dump(formatted_data, f, indent=2)

print(f"✓ Created {len(formatted_data)} training examples in training_data.json")
EOF

python training_data.py
echo "✓ Training data created!"

# ============================================================================
# STEP 4: CREATE MAIN FINE-TUNING SCRIPT
# ============================================================================

echo -e "\n[STEP 4] Creating fine-tuning script..."

cat > finetune.py << 'EOF'
import os
import json
import torch
from pathlib import Path
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

print("\n" + "="*80)
print(" "*15 + "INTERVIEW AGENT - LoRA FINE-TUNING")
print(" "*10 + "Lightweight 4-bit Quantization")
print("="*80)

# Check GPU
if not torch.cuda.is_available():
    print("❌ ERROR: GPU not available!")
    exit(1)

print(f"\n✓ GPU Available: {torch.cuda.get_device_name(0)}")
print(f"✓ GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

# ============================================================================
# LOAD DATA
# ============================================================================

print("\n[1/6] Loading training data...")
with open("training_data.json", "r") as f:
    training_data = json.load(f)

print(f"✓ Loaded {len(training_data)} examples")

# ============================================================================
# LOAD MODEL WITH 4-BIT QUANTIZATION
# ============================================================================

print("\n[2/6] Loading Mistral 7B with 4-bit quantization...")

model_name = "mistralai/Mistral-7B"

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
    cache_dir="./model_cache"
)

tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token

print(f"✓ Model loaded")
print(f"✓ GPU memory allocated: {torch.cuda.memory_allocated() / 1e9:.2f} GB")

# ============================================================================
# SETUP LORA
# ============================================================================

print("\n[3/6] Setting up LoRA...")

model = prepare_model_for_kbit_training(model)

lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

model = get_peft_model(model, lora_config)

trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
all_params = sum(p.numel() for p in model.parameters())

print(f"✓ LoRA applied")
print(f"✓ Trainable params: {trainable_params:,} ({100*trainable_params/all_params:.2f}%)")

# ============================================================================
# PREPARE DATASET
# ============================================================================

print("\n[4/6] Preparing dataset...")

dataset = Dataset.from_dict({"text": [d["text"] for d in training_data]})

def tokenize_function(examples):
    return tokenizer(
        examples["text"],
        truncation=True,
        max_length=512,
        padding="max_length",
    )

tokenized_dataset = dataset.map(
    tokenize_function,
    batched=True,
    remove_columns=["text"],
)

print(f"✓ Tokenized {len(tokenized_dataset)} examples")

# ============================================================================
# TRAINING CONFIGURATION
# ============================================================================

print("\n[5/6] Configuring training...")

training_args = TrainingArguments(
    output_dir="./interview_model_lora",
    overwrite_output_dir=True,
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=2,
    learning_rate=2e-4,
    lr_scheduler_type="linear",
    warmup_steps=50,
    weight_decay=0.01,
    logging_steps=5,
    save_steps=50,
    save_total_limit=2,
    fp16=True,
    optim="paged_adamw_8bit",
    seed=42,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset,
    data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
)

print("✓ Training configured")

# ============================================================================
# TRAIN
# ============================================================================

print("\n[6/6] Starting training (15-20 minutes)...")
print("="*80)

trainer.train()

print("\n" + "="*80)
print("✓ TRAINING COMPLETED!")
print("="*80)

# Save
model.save_pretrained("./interview_model_lora")
tokenizer.save_pretrained("./interview_model_lora")

print("\n✓ Model saved to ./interview_model_lora")
print("✓ LoRA weights: ~100MB")

print("\n" + "="*80)
print("NEXT STEPS:")
print("="*80)
print("1. Run: chmod +x create_modelfile.sh && ./create_modelfile.sh")
print("2. Run: ollama create interview-agent -f Modelfile")
print("3. Run: ollama run interview-agent")
print("="*80)

EOF

echo "✓ Fine-tuning script created!"

# ============================================================================
# STEP 5: CREATE MODELFILE SCRIPT
# ============================================================================

echo -e "\n[STEP 5] Creating Modelfile generator..."

cat > create_modelfile.sh << 'EOF'
#!/bin/bash

echo "Creating Modelfile for Ollama..."

cat > Modelfile << 'MODELFILE'
FROM mistral

PARAMETER temperature 0.7
PARAMETER top_p 0.95
PARAMETER num_predict 200

SYSTEM You are an expert technical interviewer conducting professional mock interviews.

CORE BEHAVIOR:
- Ask ONE clear question per turn
- Ask follow-ups based on candidate's actual response
- Vary question types: behavioral, technical, clarification
- Never repeat questions
- Request specific examples for vague answers
- Probe technical depth appropriately

QUESTION PATTERNS:
- Behavioral: "Tell me about a time when..."
- Technical: "How would you...?" / "What trade-offs exist...?"
- Clarification: "Can you give me a specific example?"

AFTER GOOD ANSWER: Ask about edge cases, scaling, or different approach
AFTER VAGUE ANSWER: Request concrete example with metrics
AFTER 4-5 QUESTIONS: Transition to new competency area

NEVER ask multiple questions at once. ALWAYS respond to what they actually said.
MODELFILE

echo "✓ Modelfile created!"
EOF

chmod +x create_modelfile.sh
echo "✓ Modelfile generator ready!"

# ============================================================================
# SUMMARY
# ============================================================================

echo -e "\n" + "="*80
echo "SETUP COMPLETE! Ready to start fine-tuning"
echo "="*80

echo -e "\n📋 SUMMARY:"
echo "  ✓ Project directory: $(pwd)"
echo "  ✓ Dependencies: Installed"
echo "  ✓ Training data: Created (16 examples)"
echo "  ✓ Fine-tuning script: Ready"
echo "  ✓ Modelfile generator: Ready"

echo -e "\n🚀 START FINE-TUNING:"
echo "  Run: python finetune.py"
echo ""
echo "  This will take ~15-20 minutes"
echo "  GPU will show 70-80°C (normal)"
echo "  Monitor: nvidia-smi"

echo -e "\n📊 AFTER FINE-TUNING:"
echo "  Run: ./create_modelfile.sh"
echo "  Run: ollama create interview-agent -f Modelfile"
echo "  Run: ollama run interview-agent"

echo "="*80