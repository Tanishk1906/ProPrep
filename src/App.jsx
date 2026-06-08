import { useState, useEffect, useRef } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import './App.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeFeature, setActiveFeature] = useState(null);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isParsed, setIsParsed] = useState(false);
  const [userTechStack, setUserTechStack] = useState('');
  const [history, setHistory] = useState([]);

  // Dark/Light mode
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');

  // Mock Interview
  const [mockQuestion, setMockQuestion] = useState('');
  const [mockAnswer, setMockAnswer] = useState('');
  const [mockFeedback, setMockFeedback] = useState('');
  const [mockRound, setMockRound] = useState(0);

  // JD Matcher
  const [jobDescription, setJobDescription] = useState('');
  const [jdResult, setJdResult] = useState('');

  // Timer
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef(null);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Auth state listener (fixes refresh logout bug)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Theme effect
  useEffect(() => {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Timer effect
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  // Fetch history when user logs in
  useEffect(() => {
    if (user) {
      const fetchHistory = async () => {
        try {
          const q = query(collection(db, "interview_history"), where("userEmail", "==", user.email));
          const snap = await getDocs(q);
          setHistory(snap.docs.map(d => d.data()));
        } catch (err) {
          console.error("Error fetching history:", err);
        }
      };
      fetchHistory();
    }
  }, [user]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // Voice recognition
  const toggleVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      setMockAnswer(transcript);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  };

  // PDF Upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const typedarray = new Uint8Array(reader.result);
        const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(" ");
        }
        setUserTechStack(text.substring(0, 3000));
        setIsParsed(true);
        alert("Resume parsed successfully! ✅");
      } catch (err) {
        console.error("PDF error:", err);
        alert("Error parsing PDF. Make sure it's a valid PDF file.");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Central AI caller
  const callAI = async (prompt) => {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "ProPrep"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000
      })
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
  };

  // Save to Firestore + local history
  const saveToHistory = async (question, answer) => {
    try {
      await addDoc(collection(db, "interview_history"), {
        userEmail: user.email,
        question,
        answer,
        timestamp: new Date()
      });
      setHistory(prev => [...prev, { question, answer }]);
    } catch (err) {
      console.error("Error saving history:", err);
    }
  };

  // ATS Audit
  const askAI = async () => {
    if (!isParsed) { alert("Please upload and parse your resume first!"); return; }
    setIsLoading(true);
    setAiResponse("🔍 Analyzing resume...");
    try {
      const prompt = `Act as an expert ATS (Applicant Tracking System) and Technical Interviewer.

Resume Content:
${userTechStack}

Please provide a structured analysis in this exact format:

**ATS SCORE: [X/100]**

**STRENGTHS:**
- [Point 1]
- [Point 2]
- [Point 3]

**AREAS FOR IMPROVEMENT:**
- [Point 1]
- [Point 2]
- [Point 3]

**TECHNICAL INTERVIEW QUESTION:**
[One challenging question based on the candidate's projects/skills]

Keep it concise and actionable.`;
      const text = await callAI(prompt);
      setAiResponse(text);
      await saveToHistory("ATS Resume Audit", text);
    } catch (err) {
      setAiResponse("❌ Error connecting to AI. Please check your API key in the .env file.");
    }
    setIsLoading(false);
  };

  // Mock Interview - Get Question
  const startMockInterview = async () => {
    if (!isParsed) { alert("Please upload your resume first!"); return; }
    setIsLoading(true);
    setMockFeedback('');
    setMockAnswer('');
    try {
      const prompt = `You are a strict technical interviewer conducting a real job interview.

Based on this candidate's resume:
${userTechStack}

Ask interview question #${mockRound + 1}. 
- If round 1-2: Ask a technical question about their listed skills/projects
- If round 3-4: Ask a behavioral/situational question  
- If round 5+: Ask a system design or advanced concept question

Respond with ONLY the question. No intro, no explanation. Just the question itself.`;
      const q = await callAI(prompt);
      setMockQuestion(q);
      setMockRound(r => r + 1);
    } catch (err) {
      setMockQuestion("❌ Error generating question. Please try again.");
    }
    setIsLoading(false);
  };

  // Mock Interview - Submit Answer
  const submitMockAnswer = async () => {
    if (!mockAnswer.trim()) { alert("Please provide an answer first!"); return; }
    setIsLoading(true);
    setMockFeedback("⏳ Evaluating your answer...");
    try {
      const prompt = `You are a senior technical interviewer evaluating a candidate's response.

**Question Asked:** "${mockQuestion}"

**Candidate's Answer:** "${mockAnswer}"

Provide structured feedback in this exact format:

**SCORE: [X/10]**

**WHAT YOU DID WELL:**
- [Specific positive point]
- [Specific positive point]

**WHAT WAS MISSING:**
- [Specific gap]
- [Specific gap]

**MODEL ANSWER (2-3 lines):**
[Concise ideal answer]

Be honest and constructive.`;
      const feedback = await callAI(prompt);
      setMockFeedback(feedback);
      await saveToHistory(`Mock Interview Q${mockRound}: ${mockQuestion}`, `Answer: ${mockAnswer}\n\nFeedback: ${feedback}`);
    } catch (err) {
      setMockFeedback("❌ Error getting feedback. Please try again.");
    }
    setIsLoading(false);
  };

  // JD Matcher
  const matchJD = async () => {
    if (!isParsed) { alert("Please upload your resume first!"); return; }
    if (!jobDescription.trim()) { alert("Please paste a job description!"); return; }
    setIsLoading(true);
    setJdResult("🎯 Analyzing match...");
    try {
      const prompt = `You are an expert ATS and career coach. Analyze the fit between this resume and job description.

**RESUME:**
${userTechStack}

**JOB DESCRIPTION:**
${jobDescription.substring(0, 2000)}

Provide analysis in this exact format:

**MATCH SCORE: [X%]**

**MATCHED SKILLS & KEYWORDS:**
- [Skill/keyword found in both]
- [Skill/keyword found in both]
- [Skill/keyword found in both]

**MISSING SKILLS/KEYWORDS:**
- [Important requirement not in resume]
- [Important requirement not in resume]
- [Important requirement not in resume]

**RECOMMENDATION:**
[One actionable sentence on how to improve the application]

**SHOULD YOU APPLY?** [Yes / Yes, with modifications / Not yet - here's why]`;
      const result = await callAI(prompt);
      setJdResult(result);
    } catch (err) {
      setJdResult("❌ Error analyzing match. Please try again.");
    }
    setIsLoading(false);
  };

  // Auth handlers
  const handleAuth = async () => {
    setAuthError('');
    if (!email || !password) { setAuthError('Please enter email and password.'); return; }
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim());
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setActiveFeature(null);
    setIsParsed(false);
    setUserTechStack('');
    setAiResponse('');
    setMockQuestion('');
    setMockAnswer('');
    setMockFeedback('');
    setMockRound(0);
    setJdResult('');
    setJobDescription('');
    setHistory([]);
    setTimerRunning(false);
    setTimerSeconds(0);
  };

  // Loading screen while checking auth
  if (authLoading) return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <p style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>Loading...</p>
    </div>
  );

  // ─── AUTH SCREEN ───
  if (!user) return (
    <div className="container auth-container">
      <div className="theme-toggle-fixed" onClick={() => setIsDark(d => !d)}>
        {isDark ? '☀️' : '🌙'}
      </div>
      <h1 className="logo">ProPrep 🚀</h1>
      <p className="subtitle">Your AI-powered interview coach</p>
      <div className="card">
        <h2 style={{ margin: '0 0 24px', color: 'var(--accent)' }}>
          {isRegistering ? 'Create Account' : 'Welcome Back'}
        </h2>
        <input
          type="email" placeholder="Email address" value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAuth()}
          className="input-field"
        />
        <input
          type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAuth()}
          className="input-field"
        />
        {authError && <p className="error-text">⚠️ {authError}</p>}
        <button className="primary-btn" onClick={handleAuth}>
          {isRegistering ? '🚀 Create Account' : '🔑 Log In'}
        </button>
        <p className="toggle-auth" onClick={() => { setIsRegistering(r => !r); setAuthError(''); }}>
          {isRegistering ? 'Already have an account? Log In →' : "Don't have an account? Sign Up →"}
        </p>
      </div>
    </div>
  );

  // ─── MAIN APP ───
  return (
    <div className="container">
      {/* Top Bar */}
      <div className="top-bar">
        <h1 className="logo-small">ProPrep 🚀</h1>
        <div className="top-bar-actions">
          <button className="theme-toggle-btn" onClick={() => setIsDark(d => !d)} title="Toggle theme">
            {isDark ? '☀️' : '🌙'}
          </button>
          <span className="user-email">{user.email?.split('@')[0]}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Resume Status Bar */}
      <div className="status-bar">
        <span className={isParsed ? 'status-ok' : 'status-warn'}>
          {isParsed ? '✅ Resume loaded' : '❌ No resume uploaded'}
        </span>
        <label className="upload-inline">
          {isLoading ? '⏳ Parsing...' : isParsed ? '📎 Re-upload PDF' : '📎 Upload Resume PDF'}
          <input type="file" accept="application/pdf" onChange={handleFileUpload} hidden disabled={isLoading} />
        </label>
      </div>

      {/* Dashboard or Feature View */}
      {!activeFeature ? (
        <div className="button-grid">
          {[
            { id: 'Knowledge Check', icon: '🧠', label: 'Knowledge Check', desc: 'ATS audit + question' },
            { id: 'Mock Interview', icon: '🎤', label: 'Mock Interview', desc: 'AI-powered Q&A rounds' },
            { id: 'JD Matcher', icon: '🎯', label: 'JD Matcher', desc: 'Match resume to job' },
            { id: 'Timer', icon: '⏱️', label: 'Interview Timer', desc: 'Track session time' },
            { id: 'History', icon: '📜', label: 'View History', desc: `${history.length} session(s)` },
            { id: 'Resume Check', icon: '📄', label: 'Resume Check', desc: 'Full ATS analysis' },
          ].map(({ id, icon, label, desc }) => (
            <button key={id} className="dashboard-btn" onClick={() => setActiveFeature(id)}>
              <span className="icon">{icon}</span>
              <span className="btn-label">{label}</span>
              <span className="btn-desc">{desc}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card feature-card">
          <button className="back-btn" onClick={() => setActiveFeature(null)}>← Back to Dashboard</button>

          {/* ── RESUME CHECK ── */}
          {activeFeature === 'Resume Check' && (
            <div className="feature-content">
              <h3>📄 ATS Resume Audit</h3>
              <p className="feature-desc">Upload your resume to get an ATS compatibility score, improvement suggestions, and a tailored interview question.</p>
              <label className="file-label">
                📎 Choose PDF Resume
                <input type="file" accept="application/pdf" onChange={handleFileUpload} hidden />
              </label>
              <p className="status-text">{isParsed ? "✅ Resume loaded and ready" : "❌ No resume loaded"}</p>
              <button className="ai-btn" onClick={askAI} disabled={isLoading || !isParsed}>
                {isLoading ? "⏳ Analyzing..." : "🔍 Run Full ATS Audit"}
              </button>
              {aiResponse && <div className="ai-output">{aiResponse}</div>}
            </div>
          )}

          {/* ── KNOWLEDGE CHECK ── */}
          {activeFeature === 'Knowledge Check' && (
            <div className="feature-content">
              <h3>🧠 Knowledge Check</h3>
              <p className="feature-desc">Get your ATS score and one challenging technical question based on your resume.</p>
              <p className="status-text">{isParsed ? "✅ Resume loaded" : "❌ Upload your resume using the bar above first"}</p>
              <button className="ai-btn" onClick={askAI} disabled={isLoading || !isParsed}>
                {isLoading ? "⏳ Thinking..." : "🤖 Analyze & Generate Question"}
              </button>
              {aiResponse && <div className="ai-output">{aiResponse}</div>}
            </div>
          )}

          {/* ── MOCK INTERVIEW ── */}
          {activeFeature === 'Mock Interview' && (
            <div className="feature-content">
              <h3>🎤 Mock Interview</h3>
              <div className="mock-meta">
                <span className="round-badge">Round {mockRound}</span>
                <span className="status-text">{isParsed ? "✅ Resume loaded" : "❌ Upload resume first"}</span>
              </div>
              <button className="ai-btn" onClick={startMockInterview} disabled={isLoading || !isParsed}>
                {isLoading && !mockQuestion ? "⏳ Loading..." : mockRound === 0 ? "▶️ Start Interview" : "⏭️ Next Question"}
              </button>

              {mockQuestion && (
                <>
                  <div className="question-box">
                    <span className="question-label">Question {mockRound}</span>
                    <p>{mockQuestion}</p>
                  </div>

                  <div className="voice-row">
                    <textarea
                      className="answer-input"
                      placeholder="Type your answer here, or click the mic to speak..."
                      value={mockAnswer}
                      onChange={e => setMockAnswer(e.target.value)}
                      rows={5}
                    />
                    <button
                      className={`voice-btn ${isListening ? 'listening' : ''}`}
                      onClick={toggleVoice}
                      title={isListening ? "Stop listening" : "Start voice input"}
                    >
                      {isListening ? '🔴' : '🎙️'}
                    </button>
                  </div>
                  {isListening && <p className="listening-text">🎙️ Listening... speak your answer</p>}

                  <button
                    className="submit-btn"
                    onClick={submitMockAnswer}
                    disabled={isLoading || !mockAnswer.trim()}
                  >
                    {isLoading ? "⏳ Evaluating..." : "✅ Submit Answer"}
                  </button>
                </>
              )}

              {mockFeedback && <div className="ai-output feedback-output">{mockFeedback}</div>}
            </div>
          )}

          {/* ── JD MATCHER ── */}
          {activeFeature === 'JD Matcher' && (
            <div className="feature-content">
              <h3>🎯 Job Description Matcher</h3>
              <p className="feature-desc">Paste a job description to see how well your resume matches and what keywords you're missing.</p>
              <p className="status-text">{isParsed ? "✅ Resume loaded" : "❌ Upload resume first"}</p>
              <textarea
                className="answer-input jd-input"
                placeholder="Paste the full job description here..."
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                rows={7}
              />
              <button className="ai-btn" onClick={matchJD} disabled={isLoading || !isParsed}>
                {isLoading ? "⏳ Matching..." : "🎯 Analyze Match"}
              </button>
              {jdResult && <div className="ai-output">{jdResult}</div>}
            </div>
          )}

          {/* ── TIMER ── */}
          {activeFeature === 'Timer' && (
            <div className="feature-content timer-content">
              <h3>⏱️ Interview Timer</h3>
              <p className="feature-desc">Track your answer time. Most interviewers expect 1-3 minutes per answer.</p>
              <div className="timer-display">{formatTime(timerSeconds)}</div>
              <div className="timer-bars">
                <div className="timer-bar" style={{ width: `${Math.min((timerSeconds / 180) * 100, 100)}%`,
                  background: timerSeconds < 60 ? 'var(--accent2)' : timerSeconds < 180 ? 'var(--accent)' : '#ff6b6b'
                }} />
              </div>
              <p className="timer-hint">
                {timerSeconds === 0 ? 'Press Start when ready' :
                 timerSeconds < 60 ? '🟢 Good pace — keep going' :
                 timerSeconds < 180 ? '🟡 Wrapping up soon?' :
                 '🔴 Over 3 minutes — try to conclude'}
              </p>
              <div className="timer-controls">
                <button className="ai-btn" onClick={() => setTimerRunning(r => !r)}>
                  {timerRunning ? '⏸ Pause' : timerSeconds > 0 ? '▶️ Resume' : '▶️ Start'}
                </button>
                <button className="submit-btn" onClick={() => { setTimerRunning(false); setTimerSeconds(0); }}>
                  🔄 Reset
                </button>
              </div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {activeFeature === 'History' && (
            <div className="feature-content">
              <h3>📜 Session History</h3>
              {history.length === 0 ? (
                <div className="empty-state">
                  <p>📭 No sessions yet.</p>
                  <p>Complete a Knowledge Check or Mock Interview to see your history here.</p>
                </div>
              ) : (
                [...history].reverse().map((h, i) => (
                  <div key={i} className="history-item">
                    <h4 className="history-q">{h.question}</h4>
                    <p className="history-a">{h.answer}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;