import { useState, useEffect, useRef } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import './App.css';

// NO top-level pdfjs import — dynamic import inside handleFileUpload fixes Vercel build

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
  const [resumeFileName, setResumeFileName] = useState('');

  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');

  const [mockQuestion, setMockQuestion] = useState('');
  const [mockAnswer, setMockAnswer] = useState('');
  const [mockFeedback, setMockFeedback] = useState('');
  const [mockRound, setMockRound] = useState(0);

  const [jobDescription, setJobDescription] = useState('');
  const [jdResult, setJdResult] = useState('');

  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef(null);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

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

  // ── PDF Upload — dynamic import fixes Vercel/esbuild build error ────────────
const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (file.type !== 'application/pdf') {
    alert("Please upload a valid PDF file.");
    return;
  }

  setIsLoading(true);
  setResumeFileName(file.name);

  try {
    const pdfjsLib = await import('pdfjs-dist');
    
    // Use CDN with correct version that matches pdfjs-dist
    const pdfjsVersion = pdfjsLib.version;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter(item => typeof item.str === 'string')
        .map(item => item.str)
        .join(' ');
      text += pageText + '\n';
    }

    if (!text.trim()) {
      alert("⚠️ PDF appears to be image-only or scanned. Try a text-based PDF.");
      setIsLoading(false);
      return;
    }

    setUserTechStack(text.substring(0, 3000));
    setIsParsed(true);
  } catch (err) {
    console.error("PDF parsing error:", err);
    alert(`❌ Error parsing PDF: ${err.message || 'Unknown error'}. Make sure it's a valid, non-password-protected PDF.`);
  } finally {
    setIsLoading(false);
    event.target.value = '';
  }
};
  // ───────────────────────────────────────────────────────────────────────────

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
    setResumeFileName('');
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

  if (authLoading) return (
    <div className="splash-screen">
      <div className="splash-logo">ProPrep <span className="splash-rocket">🚀</span></div>
      <div className="splash-bar"><div className="splash-fill" /></div>
    </div>
  );

  // ─── AUTH SCREEN ───────────────────────────────────────────────────────────
  if (!user) return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-orb orb1" />
        <div className="auth-orb orb2" />
        <div className="auth-orb orb3" />
      </div>
      <button className="theme-toggle-fixed" onClick={() => setIsDark(d => !d)}>
        {isDark ? '☀️' : '🌙'}
      </button>
      <div className="auth-card">
        <div className="auth-brand">
          <h1 className="logo">ProPrep</h1>
          <span className="logo-rocket">🚀</span>
        </div>
        <p className="subtitle">AI-powered interview coaching</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${!isRegistering ? 'active' : ''}`}
            onClick={() => { setIsRegistering(false); setAuthError(''); }}
          >Log In</button>
          <button
            className={`auth-tab ${isRegistering ? 'active' : ''}`}
            onClick={() => { setIsRegistering(true); setAuthError(''); }}
          >Sign Up</button>
        </div>

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
      </div>
    </div>
  );

  // ─── MAIN APP ──────────────────────────────────────────────────────────────
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

      {/* Resume Upload Bar */}
      <div className={`status-bar ${isParsed ? 'status-bar--ok' : ''}`}>
        <div className="status-left">
          {isParsed ? (
            <>
              <span className="status-dot dot-ok" />
              <span className="status-label-ok">
                {resumeFileName ? resumeFileName : 'Resume loaded'}
              </span>
            </>
          ) : (
            <>
              <span className="status-dot dot-idle" />
              <span className="status-label-idle">Upload your resume to get started</span>
            </>
          )}
        </div>
        <label className="upload-pill">
          {isLoading ? (
            <><span className="upload-spinner" /> Parsing...</>
          ) : isParsed ? (
            '↩ Re-upload'
          ) : (
            '📎 Upload PDF'
          )}
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            hidden
            disabled={isLoading}
          />
        </label>
      </div>

      {/* Dashboard or Feature */}
      {!activeFeature ? (
        <div className="button-grid">
          {[
            { id: 'Knowledge Check', icon: '🧠', label: 'Knowledge Check', desc: 'ATS audit + question' },
            { id: 'Mock Interview',  icon: '🎤', label: 'Mock Interview',  desc: 'AI-powered Q&A rounds' },
            { id: 'JD Matcher',      icon: '🎯', label: 'JD Matcher',      desc: 'Match resume to job' },
            { id: 'Timer',           icon: '⏱️', label: 'Interview Timer', desc: 'Track session time' },
            { id: 'History',         icon: '📜', label: 'View History',    desc: `${history.length} session(s)` },
            { id: 'Resume Check',    icon: '📄', label: 'Resume Check',    desc: 'Full ATS analysis' },
          ].map(({ id, icon, label, desc }, idx) => (
            <button
              key={id}
              className="dashboard-btn"
              onClick={() => setActiveFeature(id)}
              style={{ animationDelay: `${idx * 0.07}s` }}
            >
              <span className="icon">{icon}</span>
              <span className="btn-label">{label}</span>
              <span className="btn-desc">{desc}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card feature-card">
          <button className="back-btn" onClick={() => setActiveFeature(null)}>← Dashboard</button>

          {/* RESUME CHECK */}
          {activeFeature === 'Resume Check' && (
            <div className="feature-content">
              <h3>📄 ATS Resume Audit</h3>
              <p className="feature-desc">Upload your resume to get an ATS score, improvement tips, and a tailored interview question.</p>
              <label className="file-label">
                📎 Choose PDF Resume
                <input type="file" accept="application/pdf" onChange={handleFileUpload} hidden />
              </label>
              <p className="status-text">{isParsed ? `✅ ${resumeFileName || 'Resume loaded'}` : "❌ No resume loaded"}</p>
              <button className="ai-btn" onClick={askAI} disabled={isLoading || !isParsed}>
                {isLoading ? "⏳ Analyzing..." : "🔍 Run Full ATS Audit"}
              </button>
              {aiResponse && <div className="ai-output">{aiResponse}</div>}
            </div>
          )}

          {/* KNOWLEDGE CHECK */}
          {activeFeature === 'Knowledge Check' && (
            <div className="feature-content">
              <h3>🧠 Knowledge Check</h3>
              <p className="feature-desc">Get your ATS score and one challenging technical question based on your resume.</p>
              <p className="status-text">{isParsed ? `✅ ${resumeFileName || 'Resume loaded'}` : "❌ Upload your resume using the bar above first"}</p>
              <button className="ai-btn" onClick={askAI} disabled={isLoading || !isParsed}>
                {isLoading ? "⏳ Thinking..." : "🤖 Analyze & Generate Question"}
              </button>
              {aiResponse && <div className="ai-output">{aiResponse}</div>}
            </div>
          )}

          {/* MOCK INTERVIEW */}
          {activeFeature === 'Mock Interview' && (
            <div className="feature-content">
              <h3>🎤 Mock Interview</h3>
              <div className="mock-meta">
                <span className="round-badge">Round {mockRound}</span>
                <span className="status-text">{isParsed ? `✅ ${resumeFileName || 'Resume loaded'}` : "❌ Upload resume first"}</span>
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
                  {isListening && <p className="listening-text">🎙️ Listening… speak your answer</p>}
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

          {/* JD MATCHER */}
          {activeFeature === 'JD Matcher' && (
            <div className="feature-content">
              <h3>🎯 Job Description Matcher</h3>
              <p className="feature-desc">Paste a job description to see how well your resume matches and what keywords you're missing.</p>
              <p className="status-text">{isParsed ? `✅ ${resumeFileName || 'Resume loaded'}` : "❌ Upload resume first"}</p>
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

          {/* TIMER */}
          {activeFeature === 'Timer' && (
            <div className="feature-content timer-content">
              <h3>⏱️ Interview Timer</h3>
              <p className="feature-desc">Track your answer time. Most interviewers expect 1–3 minutes per answer.</p>
              <div className="timer-display">{formatTime(timerSeconds)}</div>
              <div className="timer-bars">
                <div className="timer-bar" style={{
                  width: `${Math.min((timerSeconds / 180) * 100, 100)}%`,
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

          {/* HISTORY */}
          {activeFeature === 'History' && (
            <div className="feature-content">
              <h3>📜 Session History</h3>
              {history.length === 0 ? (
                <div className="empty-state">
                  <p>📭 No sessions yet.</p>
                  <p>Complete a Knowledge Check or Mock Interview to see history here.</p>
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
