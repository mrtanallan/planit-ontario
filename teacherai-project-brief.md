# TeacherAI — Ontario SSC Teacher OS
## Project Brief & Build Continuity Document
*Last updated: March 24, 2026*

---

## PRODUCT OVERVIEW

**Product name:** TeacherAI
**Domain:** teacherai.ca ✅ LIVE
**Live site:** https://teacherai.ca (also teacherai-ontario.vercel.app)
**GitHub repo:** github.com/mrtanallan/TeacherAI
**Built by:** Allan (Ontario SSC teacher, Toronto, YRDSB)

**What TeacherAI is:**
An AI-powered teaching operating system built specifically for Ontario elementary teachers — with a focus on SSC (Self-Contained Special Education) classrooms and split/multi-grade classes. It takes a teacher from lesson planning → student worksheet delivery → student submission → assessment → report card comments, all in one place.

**What makes it different from competitors (e.g. Chalkie.ai):**
- Ontario curriculum aligned (all subjects, K–8, all strands)
- Supports up to 4-grade split/multi-grade classes in one lesson — per-grade worksheets
- IEP/modified expectations aware — generates differentiated content per student
- Full assessment loop: Level 1−/L1/1+ marking, grade tracker, feedback generation
- Report card comment generator for YRDSB PowerSchool (Progress Report, Term 1, Term 2)
- Student worksheet submission with fuzzy name matching (no student accounts needed)
- Teaching slide deck generation (AI-powered, not a PDF export)
- Multiple classes per teacher with separate rosters
- Persistent data via Supabase (Canadian servers)
- Privacy policy + terms of service live at teacherai.ca
- No competitor has the complete SSC workflow

**The teacher (Allan):**
- Ontario SSC teacher in Toronto (YRDSB)
- Teaches split grades (up to 4 grades simultaneously: e.g. 4/5, 6/7, 7/8)
- Has students with IEPs/modified expectations
- Uses Google Classroom (board gApps account — board-restricted OAuth)
- Uses PowerSchool for report card comments
- Students use Chromebooks/laptops

---

## CURRENT TECH STACK

| Component | Technology | Details |
|---|---|---|
| Frontend | HTML/CSS/JS | Single file: public/index.html (~3000 lines) |
| Backend | Vercel Serverless | api/generate.js — proxies to Anthropic (auth + rate limiting) |
| Student worksheets | Vercel Serverless | api/worksheet.js — fetch/submit worksheets (IDOR validation) |
| AI | Anthropic Claude API | claude-sonnet-4-20250514, max_tokens 2500 |
| Slides | PptxGenJS CDN | Client-side .pptx generation |
| Hosting | Vercel | teacherai-ontario.vercel.app + teacherai.ca |
| Source control | GitHub | github.com/mrtanallan/TeacherAI |
| Database | Supabase | Canadian region (ca-central-1) |
| Auth | Supabase Auth | Email/password teacher login |

**File structure on GitHub:**
```
TeacherAI/
├── api/
│   ├── generate.js       ← proxies to Anthropic API (auth check + rate limiting)
│   └── worksheet.js      ← fetch worksheet + save submissions (IDOR validation)
├── public/
│   ├── index.html        ← main teacher app (TeacherAI) — ~3000 lines
│   ├── worksheet.html    ← student-facing worksheet page
│   ├── privacy.html      ← privacy policy page
│   └── terms.html        ← terms of service page
├── package.json          ← declares @supabase/supabase-js dependency
├── vercel.json
└── README.md
```

**Vercel environment variables:**
- ANTHROPIC_API_KEY
- SUPABASE_URL = https://bbhhkyiyfybmlfkerfto.supabase.co
- SUPABASE_ANON_KEY = eyJhbGci... (long JWT) — used by both generate.js and worksheet.js
- (SUPABASE_SERVICE_KEY no longer used — switched to anon key with RLS)

**Supabase project:** TeacherAI (bbhhkyiyfybmlfkerfto.supabase.co)
**Supabase region:** Canada Central 🇨🇦

---

## DATABASE SCHEMA (Supabase)

```sql
profiles          -- teacher accounts (auto-created on signup)
  id, email, full_name, school, class_context(text), created_at

classes           -- teacher's class groups (NEW)
  id, teacher_id, name, grades[], subject_focus, created_at

students          -- class roster per teacher
  id, teacher_id, class_id(nullable→classes), first_name, last_name,
  grade, notes, learning_profile, created_at

lessons           -- saved generated lessons
  id, teacher_id, topic, grades[], subject, content(jsonb), created_at

worksheets        -- shareable student worksheets
  id, teacher_id, lesson_id, topic, grades[], subject,
  content(text — JSON {worksheet, reading} or legacy plain text),
  roster(jsonb), class_id(nullable), created_at

worksheet_submissions  -- student responses
  id, worksheet_id, student_name, student_id(nullable uuid), responses(jsonb), submitted_at

assessment_sessions   -- assessment events
  id, teacher_id, task, subject, strand, grades[], date, class_id(nullable), created_at

student_marks         -- per-student marks per session
  id, session_id, student_id, level, notes, created_at
```

All tables have Row Level Security (RLS) enabled.
Teachers only see their own data.
Worksheet submissions are publicly writable (students have no accounts).
`classes` table: RLS policy "Teachers manage own classes".

---

## CURRENT FEATURES (Built & Live)

### Authentication
- Email/password signup and login
- Auto-profile creation on signup
- Persistent session across browser closes
- Sign out
- Privacy + Terms links on auth screen and in nav

### Multiple Classes (NEW)
- Teachers create named classes (e.g. "Grade 6/7 Morning", "French Period 2")
- Class tabs in Class Roster — switch between classes
- All students, sessions, worksheets filtered by active class
- Class selector in Daily Workflow Step 1
- Students can be assigned/reassigned to classes via dropdown
- "Unassigned" badge on students not in any class
- "View all students →" link when class is empty so teachers know data isn't lost
- Delete class — students become unassigned, not deleted

### Daily Workflow (5-step process)
1. **Plan** — Class selector (if classes exist), grade A + optional SSC grades B/C/D, subject, topic, duration, literacy strands, outputs
2. **Review & Edit** — All generated content editable; Reset to original; 📊 Slides on lesson plan
3. **Share** — Student Worksheet: 🔗 Get Student Link (includes reading resource); PDF for rubric/reading
4. **Assess** — Per-student level buttons, observation notes, student submissions shown inline
5. **Feedback** — AI-generated Ontario-style descriptive feedback per student

### Generation — Step 1 improvements (NEW)
- **AI picks worksheet type** — no selector shown; AI chooses Questions/Writing Draft/Math Practice/Research Organizer/Experiment Record based on topic+subject
- **Per-grade worksheets for split classes** — when SSC checked with multiple grades, generates `student_worksheet_A`, `student_worksheet_B` etc. — each gets its own student link
- **Split grade unchecked by default** — cleaner initial state
- **Reading Resource auto-checked** for Language/Literacy, unchecked for other subjects
- **Literacy Strands hidden** for non-literacy subjects; subject-specific note shown instead
- **Class Context** lives in Class Roster, auto-saves to `profiles.class_context`, included in every generation

### Generation outputs:
- Lesson Plan (timing, Minds On/Action/Consolidation) + 📊 Slides button
- Student Worksheet (interactive fields, AI-chosen format)
- Reading Resource (original passage, shown first on student page)
- Assessment Rubric (Ontario Level 1/2/3/4)
- Differentiation & Modified Expectations (opt-in)
- Per-grade worksheets for split classes

### Worksheet markers (AI generates, rendered as interactive fields):
[TEXT BOX], [LARGE BOX], [CIRCLE ONE: A/B/C], [CHECK ALL THAT APPLY: A/B/C], [WORD BANK: w1,w2], [DIAGRAM: description]

### Teaching Slides (NEW — AI-powered)
- 📊 Slides button on Lesson Plan block in Step 2
- Makes separate AI call with slides-specific prompt (NOT a PDF export)
- Generates: Title → Learning Goals → Minds On → Vocabulary cards → Content slides (3-5) → Discussion questions → Your Turn → Exit Ticket → Closing
- Downloads as `.pptx` — opens natively in Google Slides
- Design: dark green/sage palette, Fraunces/Calibri fonts, accent bars, card shadows

### Student Worksheet Delivery
- Teacher clicks "🔗 Get Student Link" on worksheet block
- Worksheet content + reading resource saved as JSON `{worksheet, reading}` in Supabase
- Unique URL: teacherai.ca/worksheet.html?id=UUID
- Students open URL — reading passage shown expanded at top, worksheet below
- Student types name → fuzzy matching (Dice coefficient) against roster
- Student fills answers → Submit → saves to Supabase
- Teacher sees submissions inline in Step 4 (matched by student_id then name)

### Class Roster
- Multiple classes with class manager at top
- Add/remove students with class assignment
- Learning Profile field (teacher's professional notes, NOT full IEP)
- Class Context textarea — auto-saves to profiles table, persists across sessions
- "Unassigned" badge + assign dropdown when classes exist
- Export all data (students + marks) as CSV
- Privacy notice with MFIPPA guidance

### Assessment (Grade Tracker)
- Stats: students, tasks, class average, count at Level 4
- Per-student average level table — click student to expand full task history
- Recent Tasks list with ✏️ Edit marks (dropdown per student) and 🗑 Delete task buttons
- Level buttons deselect on second click
- Marks pre-populate when returning to Step 4 (loaded from existing session)
- Save Assessment upserts — no duplicate sessions for same topic+date
- Quiet data safety footer: "🔒 Data stored in Canada · Never deleted automatically" + Export All Data

### Report Cards (NEW — YRDSB-specific)
- New "📝 Report Cards" tab
- Settings: Reporting period (Progress Report Nov / Term 1 Feb / Term 2 June), Subject, Character limit (default 500 — YRDSB PowerSchool default)
- Generates all student comments at once using accumulated assessment task history
- Students sorted A–Z by last name to match PowerSchool order
- Each comment: editable text box, live character counter (green/amber/red at 90%/100%)
- 📋 Copy button per student — click, switch to PowerSchool, paste
- 🔄 Regenerate button per student
- Ontario Growing Success language conventions: specific strength, evidence, next step
- Different language per period: Progress=observational, Term1=achievement, Term2=summative

### My Lessons tab
- All generated lessons saved automatically
- Sort by: Date, Subject, Grade, Topic A–Z
- Click to reload any past lesson into workflow
- 🗑 Delete lesson with confirmation modal

### First-Run Experience (NEW)
- Welcome banner shown once ever (localStorage flag — not per-class)
- Dismissed automatically when teacher has any students or lessons
- Manual ✕ dismiss button
- "Start here → Class Roster" CTA with direct nav button

---

## SECURITY (NEW)

### api/generate.js
- **Auth check**: reads `Authorization: Bearer <token>` header, verifies with Supabase. Returns 401 if missing/invalid — only logged-in teachers can generate.
- **Rate limiting**: 30 requests per IP per hour (in-memory, resets on cold start)
- Frontend uses `authFetch()` helper that automatically attaches Supabase JWT

### api/worksheet.js
- **UUID format validation** on GET and POST
- **IDOR check on POST**: verifies worksheet_id exists before accepting submission
- **Input sanitization**: student name trimmed/capped at 100 chars, student_id validated as UUID
- Uses SUPABASE_ANON_KEY (RLS handles access control)

---

## PRIVACY & COMPLIANCE

**Data flow:**
- Student names → NEVER sent to Anthropic. Anonymized as "Student A, B, C"
- Learning profiles → sent to Anthropic anonymized
- Assessment data → Supabase only, never to Anthropic
- Student worksheet responses → Supabase only, never to Anthropic
- Everything stored in Canada (Supabase ca-central-1)

**Legal pages live at:**
- teacherai.ca/privacy.html
- teacherai.ca/terms.html
- Contact: teacheraicanada@gmail.com

**MFIPPA considerations (for future implementation):**
- [ ] Privacy Impact Assessment (PIA) for board approval (Phase 3)
- [ ] Explicit consent checkbox at signup
- [ ] Data retention policy + auto-delete old submissions
- [ ] In-app account deletion
- [ ] Anthropic data processing agreement documentation
- Recommendation shown in UI: use first names only or pseudonyms until board approves

---

## GOOGLE CLASSROOM STRATEGY

Board-issued gApps accounts have OAuth restrictions.

**Current approach:**
- Student worksheet: unique URL teacher pastes into GC as assignment link
- Other content (lesson plan, rubric, reading): PDF download or Slides .pptx
- No Google OAuth required anywhere

---

## DEPLOYMENT WORKFLOW

When Claude makes changes to files:
1. Claude provides updated file(s) via present_files
2. Allan downloads file from Claude
3. Goes to github.com/mrtanallan/TeacherAI
4. Clicks file → pencil icon → Cmd+A → paste new content
5. Clicks "Commit changes"
6. Vercel auto-deploys in ~30-45 seconds
7. Wait for green checkmark on GitHub commit before testing

**Working files in Claude sessions:**
- Main app: `/home/claude/index.html` (accumulated across session)
- Legal pages: `/home/claude/privacy.html`, `/home/claude/terms.html`
- API: generated fresh each time from description

**Important:** Always wait for green checkmark. Always run syntax check before deploying:
```bash
node -e "
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const js=html.slice(html.indexOf('<script>',1000)+8,html.lastIndexOf('</script>'));
try{new vm.Script(js);console.log('✅ JS OK');}catch(e){console.error('❌',e.message);}
"
```

---

## KNOWN BUGS & PATTERNS TO AVOID

**Critical pattern: UUID-in-onclick**
NEVER put UUIDs in inline onclick handlers. HTML parser mangles them.
```html
<!-- ❌ WRONG — breaks with UUID strings -->
<button onclick="doThing('${someUUID}')">

<!-- ✅ CORRECT — use data attributes + addEventListener -->
<button class="my-btn" data-id="${someUUID}">
// Then: document.querySelectorAll('.my-btn').forEach(b => b.addEventListener('click', function() { doThing(this.dataset.id); }));
```

**Template literal nesting**
Avoid deeply nested template literals with quotes. Build HTML with string concatenation when in doubt. Always run vm.Script syntax check after edits.

**Missing closing braces**
After large edits, always check brace balance:
```bash
node -e "const js='...'; let d=0; for(const c of js){if(c==='{')d++;else if(c==='}')d--;} console.log(d);"
```

---

## PHASE STATUS

### Phase 2 — COMPLETE ✅
- ✅ Multiple classes with separate rosters
- ✅ Report card comment generator (YRDSB PowerSchool-ready)
- ✅ AI-powered teaching slide deck (.pptx)
- ✅ Per-grade worksheets for split classes
- ✅ AI picks worksheet type automatically
- ✅ Privacy policy + terms of service (teacherai.ca/privacy.html, /terms.html)
- ✅ teacherai.ca domain connected
- ✅ Security: auth check + rate limiting on generate.js, IDOR validation on worksheet.js
- ✅ Class context saved to Supabase profiles
- ✅ Assessment edit/delete marks
- ✅ Student submissions inline in Step 4
- ✅ Welcome banner (first-run only, localStorage)
- ✅ Lesson sorting (date/subject/grade/topic)
- ✅ Export all data (students + marks CSV)
- ✅ Reading passage shown first on student worksheet
- ✅ Full audit pass — all UUID onclick bugs fixed, syntax verified

### Phase 2 — Remaining (before sharing with teachers)
- [ ] Mobile polish (test on phone, fix nav overflow)
- [ ] End-to-end test in incognito (fresh account → full workflow)

### Phase 3 — Commercial launch
- [ ] Migrate to React (Vite + components) — when codebase outgrows single file
- [ ] Stripe subscription ($9.99-14.99/month)
- [ ] Usage limits per tier
- [ ] Google OAuth (personal Gmail)
- [ ] Staging environment + proper CI/CD
- [ ] School board vendor package + PIA documentation
- [ ] Curriculum expectations tracker (272 Ontario K-8 expectations)
- [ ] Unit plan generator (3+ day lessons)
- [ ] Tests and quizzes (end-of-unit)
- [ ] Export to Google Slides via OAuth (direct to Drive)
- [ ] Analytics (feature usage tracking)

---

## COMPETITIVE POSITIONING

**vs Chalkie.ai ($4M funded, 500K teachers):**
- Chalkie: generic, global, slide-focused, no Ontario curriculum, no SSC, no assessment, no report cards
- TeacherAI: Ontario-specific, SSC/split grade, IEP-aware, complete assessment → report card loop

**TeacherAI's moat:**
1. SSC/split grade workflow (up to 4 grades, per-grade worksheets) — nobody else has this
2. IEP differentiation built into generation
3. Complete loop: lesson → worksheet → submission → assessment → feedback → report card
4. YRDSB PowerSchool report card comments (Progress Report, Term 1, Term 2)
5. Student submission without Google OAuth
6. Data stored in Canada (MFIPPA-conscious)
7. Teaching slide deck (student-facing, not PDF export)

**Positioning statement:**
"TeacherAI is the only AI teaching platform built for Ontario SSC and split-grade classrooms — from lesson plan to report card, in one place."

---

## MONETIZATION PLAN

**Now:** Free — gathering teacher feedback
**Phase 3:** $9.99-14.99/month per teacher (Stripe)
**Phase 3+:** School/board pricing

**Cost per generation:** ~$0.01-0.03 Anthropic API credits
**Hosting:** Vercel free tier
**Database:** Supabase free tier

---

## HOW TO USE THIS DOCUMENT IN A NEW CLAUDE SESSION

Upload this file to a Claude Project, or paste it at the start of a new conversation.

Say: "Here is the full brief for TeacherAI, an Ontario teacher tool I'm building. Please read it carefully and then [your request]."

The working `index.html` is maintained at `/home/claude/index.html` within a session. Between sessions, work from the GitHub repo file. Always run the syntax check before deploying.

---

## KEY DECISIONS LOG

- Chose Vercel over Replit (free tier never sleeps, better for production)
- Chose Supabase (Canadian data residency, free tier, RLS built in, auth built in)
- CSS radio button tab switching (pure CSS, bulletproof vs JS onclick)
- Student names anonymized (Student A, B, C) before any Anthropic API call
- "Learning Profile" not "IEP upload" — privacy-defensible framing
- No student accounts — students access via link only
- Fuzzy name matching (Dice coefficient) instead of per-student links
- PDF download for teacher content (lesson plan, rubric) — no AI stigma
- No TeacherAI branding on student worksheet page
- Worksheet content stored as JSON {worksheet, reading} in Supabase content field (backwards compatible with legacy plain text)
- max_tokens: 2500 for lesson generation, 400 for feedback/report cards, 2000 for slides
- SUPABASE_ANON_KEY for all server functions (RLS handles access) — service key abandoned
- UUID-in-onclick is a fatal pattern — always use data-attributes + addEventListener
- Reading resource saved alongside worksheet so student page can show it inline
- AI picks worksheet type (no selector shown to teacher) — reduces cognitive load
- Per-grade worksheets for split classes (student_worksheet_A, _B, etc.)
- Report card character limit: 500 (YRDSB PowerSchool default) — shown but editable
- LocalStorage for welcome banner dismissed state (not per-class, one-time ever)
- `class_context` column added to profiles table in Supabase
- `class_id` column added to students, worksheets, assessment_sessions tables
- `classes` table created with RLS for multiple class support
