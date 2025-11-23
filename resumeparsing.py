def extract_name_from_resume(resume_text):
    """Extract name from resume using pattern matching"""
    lines = resume_text.split('\n')
    
    # Get first few non-empty lines (usually contains the name)
    for line in lines[:10]:
        line = line.strip()
        if len(line) > 2 and len(line) < 100:
            # Remove common resume headers
            if not any(x in line.lower() for x in ['email', 'phone', 'address', 'linkedin', 'github', 'portfolio', '@', '|']):
                # Check if line looks like a name (has capital letters, no numbers)
                if not any(char.isdigit() for char in line) and any(char.isupper() for char in line):
                    # Clean up the line
                    name = line.replace('•', '').replace('-', '').replace('*', '').strip()
                    if len(name) > 2 and len(name) < 60:
                        return name
    
    return "Unknown"

import requests
import json
import sys
import os
import re

OLLAMA_API = "http://localhost:11434/api/generate"
MODEL = "phi3:3.8b"

def read_resume_file(file_path):
    """Read resume from file"""
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return None
    
    if file_path.endswith('.txt'):
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    elif file_path.endswith('.pdf'):
        try:
            import PyPDF2
            with open(file_path, 'rb') as f:
                pdf_reader = PyPDF2.PdfReader(f)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text()
                return text
        except ImportError:
            print("Install PyPDF2: pip install PyPDF2")
            return None
    else:
        print("❌ Unsupported file format. Use .txt or .pdf")
        return None

def extract_structured_keywords(resume_text):
    """Extract structured keywords using simple text parsing"""
    
    prompt = f"""Extract ONLY keywords from this resume. Return in this EXACT format with NO explanations, NO descriptions, NO stories.

USERNAME: Just the name, nothing else
PROGRAMMING_LANGUAGES: keyword1, keyword2, keyword3
FRAMEWORKS_LIBRARIES: keyword1, keyword2, keyword3
DATABASES: keyword1, keyword2, keyword3
TECHNICAL_SKILLS: keyword1, keyword2, keyword3
TOOLS_SOFTWARE: keyword1, keyword2, keyword3
ACHIEVEMENTS: keyword1, keyword2, keyword3
SOFT_SKILLS: keyword1, keyword2, keyword3
CERTIFICATIONS: keyword1, keyword2, keyword3
LANGUAGES: keyword1, keyword2, keyword3
PROJECTS: keyword1, keyword2, keyword3

Resume:
{resume_text}

RULES:
- Return ONLY keywords separated by commas
- NO explanations, NO descriptions, NO sentences
- NO parentheses with explanations
- Just the pure keywords
- Example: "Python, Java, C++" NOT "Python is a language, Java is..."
- For achievements: Just the achievement name, nothing else
- For projects: Just the project name, nothing else"""

    try:
        print("⏳ Sending to Phi3...")
        response = requests.post(OLLAMA_API, json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False
        }, timeout=300)
        
        result = response.json().get('response', '').strip()
        
        # Parse the text response
        categories = {
            "username": "",
            "programming_languages": [],
            "frameworks_libraries": [],
            "databases": [],
            "technical_skills": [],
            "tools_software": [],
            "achievements": [],
            "soft_skills": [],
            "certifications": [],
            "languages": [],
            "projects": []
        }
        
        # Parse each category
        for line in result.split('\n'):
            line = line.strip()
            if ':' in line:
                category, items = line.split(':', 1)
                category = category.strip().lower()
                
                if category == "username":
                    # Keep username as string, not list
                    username_str = items.strip()
                    categories["username"] = username_str
                elif category in categories and isinstance(categories[category], list):
                    # Split by comma and clean up - remove any parentheses content
                    keywords = []
                    for item in items.split(','):
                        item = item.strip()
                        # Remove parentheses and content inside
                        item = item.split('(')[0].strip()
                        if item:
                            keywords.append(item)
                    categories[category] = keywords
        
        return categories
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def main():
    # ===== PASTE YOUR RESUME FILE PATH HERE =====
    file_path = "resume.txt"
    # Example: file_path = "C:/Users/yogen/YOGENDTHIRA VK RESUME FINAL.pdf"
    # ============================================
    
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    
    print("=" * 70)
    print("RESUME KEYWORD EXTRACTOR - STRUCTURED")
    print("=" * 70)
    print(f"\n📂 Reading resume from: {file_path}\n")
    
    resume_text = read_resume_file(file_path)
    if not resume_text:
        return
    
    print(f"✓ Resume loaded ({len(resume_text)} characters)\n")
    
    # Extract name directly from resume
    username = extract_name_from_resume(resume_text)
    print(f"✓ Name extracted: {username}\n")
    
    print("🔑 Extracting structured keywords...\n")
    keywords_data = extract_structured_keywords(resume_text)

    if keywords_data:
        # ===== DEDUPLICATE KEYWORDS =====
        all_keywords = set()
        
        # First pass: collect all keywords
        for category, items in keywords_data.items():
            for item in items:
                all_keywords.add(item.lower())
        
        # Second pass: remove duplicates from each category
        for category in keywords_data.keys():
            seen = set()
            unique_items = []
            for item in keywords_data[category]:
                item_lower = item.lower()
                if item_lower not in seen:
                    unique_items.append(item)
                    seen.add(item_lower)
            keywords_data[category] = unique_items
        
        # Third pass: remove keywords that appear in multiple categories (keep in most specific)
        # Priority: programming_languages > frameworks_libraries > databases > technical_skills
        priority = {
            "username": 0,  # Username always stays
            "programming_languages": 1,
            "frameworks_libraries": 2,
            "databases": 3,
            "technical_skills": 4,
            "tools_software": 5,
            "achievements": 6,
            "soft_skills": 7,
            "certifications": 8,
            "languages": 9,
            "projects": 10  # Projects always stay
        }
        
        seen_globally = set()
        final_data = {}
        
        # First, add username
        if keywords_data.get("username"):
            final_data["username"] = keywords_data["username"]
        
        # Sort by priority (skip username and projects)
        for category in sorted(keywords_data.keys(), key=lambda x: priority.get(x, 999)):
            if category in ["username", "projects"]:
                continue
            final_data[category] = []
            for item in keywords_data[category]:
                item_lower = item.lower()
                if item_lower not in seen_globally:
                    final_data[category].append(item)
                    seen_globally.add(item_lower)
        
        # Add projects last (they don't get deduplicated)
        if keywords_data.get("projects"):
            final_data["projects"] = keywords_data["projects"]
        
        keywords_data = final_data
        # ===== END DEDUPLICATION =====
        
        print("✅ EXTRACTED KEYWORDS BY CATEGORY:\n")
        print("=" * 70)
        
        # Display username first
        print(f"\n👤 USERNAME: {username}\n")
        
        # Display all other categories
        for category, items in keywords_data.items():
            if category != "username" and items:
                category_display = category.replace('_', ' ').title()
                print(f"📌 {category_display}:")
                for item in items:
                    print(f"   • {item}")
                print()
        
        # Save to file
        # Remove username from keywords dict
        keywords_without_username = {k: v for k, v in keywords_data.items() if k != "username"}
        
        output = {
            "username": username,
            "file": file_path,
            "keywords": keywords_without_username
        }

        output_file = "keywords_structured.json"
        with open(output_file, "w", encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        print(f"\n\n✓ Structured keywords saved to {output_file}")
        
        total = sum(len(items) for items in keywords_data.values())
        print(f"📊 Total unique keywords extracted: {total}\n")
    else:
        print("❌ Failed to extract keywords")

if __name__ == "__main__":
    print("Make sure Ollama is running: ollama run phi3:3.8b\n")
    main()