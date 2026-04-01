# TeacherAI — Project Brief v5.0
*Last updated: March 31, 2026*

## QUICK START FOR NEW SESSION
Upload `teacherai-project-brief.md` + `index.html` to Claude. Say: "Continue building TeacherAI. Read the brief first."

---

## PRODUCT
**TeacherAI** — AI teaching OS for Ontario K–8 teachers
**Live app:** teacherai.ca/app
**Landing page:** teacherai.ca
**GitHub:** github.com/mrtanallan/TeacherAI
**Version:** v5.0 · Mar 31 2026

---

## STACK
- **Frontend:** Two HTML files:
  - `public/app/index.html` — the actual tool (~278KB, ~4500 lines)
  - `public/index.html` — marketing landing page
  - `public/worksheet.html` — student-facing digital worksheet
- **Backend:** Vercel serverless `api/generate.js` + `api/worksheet.js`
- **DB:** Supabase (bbhhkyiyfybmlfkerfto.supabase.co, Canada Central)
- **Auth:** Supabase (email/password + Google OAuth)
- **AI:** claude-sonnet-4-20250514

## URL STRUCTURE
- `teacherai.ca` → `public/index.html` (landing page)
- `teacherai.ca/app` → `public/app/index.html` (the tool)
- `teacherai.ca/worksheet.html` → `public/worksheet.html` (student worksheet — direct path, not /ws)

## vercel.json (CURRENT — uses rewrites not routes)
```json
{
  "rewrites": [
    { "source": "/api/generate", "destination": "/api/generate.js" },
    { "source": "/api/worksheet", "destination": "/api/worksheet.js" },
    { "source": "/ws/:path*", "destination": "/public/worksheet.html" },
    { "source": "/app/:path*", "destination": "/public/app/index.html" },
    { "source": "/app", "destination": "/public/app/index.html" },
    { "source": "/privacy", "destination": "/public/privacy.html" },
    { "source": "/terms", "destination": "/public/terms.html" },
    { "source": "/", "destination": "/public/index.html" }
  ]
}
```

---

## CRITICAL CONFIG

### Supabase
- **URL:** `https://bbhhkyiyfybmlfkerfto.supabase.co`
- **Anon key (CURRENT — rotated Mar 31 2026):**
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiaGhreWl5ZnlibWxma2VyZnRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDgzODMsImV4cCI6MjA4OTc4NDM4M30.nLzOUCAa8XSD4BL0XIdPvwVNZy-5Rnp6NVLUTVjE-ZQ`
- **Init pattern (MUST use this exact form):**
  ```js
  const { createClient } = supabase;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  ```
  Do NOT use `supabase.createClient(...)` — that pattern fails with the jsDelivr CDN build.
- Site URL: `https://teacherai.ca/app`
- Redirect URLs: `https://www.teacherai.ca`, `https://teacherai.ca`, `https://teacherai.ca/app`

### Google Slides
- Client ID: `745642384007-u7anvn00lh74qum6b9u19eodm7flokfd.apps.googleusercontent.com`
- Authorized origin: `https://teacherai.ca`
- Uses Google Identity Services (client-side OAuth, no backend needed)

---

## DATABASE TABLES
- `profiles` — teacher accounts
- `classes` — (id, teacher_id, name, subject_focus, context)
- `students` — (id, teacher_id, class_id, first_name, last_name, grade, notes, learning_profile)
- `lessons` — (id, teacher_id, topic, grades[], subject, content jsonb, expectations jsonb, class_id)
- `worksheets` — (id, teacher_id, lesson_id, topic, grades[], content, roster jsonb, class_id)
- `worksheet_submissions` — (id, worksheet_id, student_name, student_id, responses jsonb, submitted_at)
- `assessment_sessions` — (id, teacher_id, task, subject, strand, grades[], date, class_id, expectations jsonb)
- `student_marks` — (id, session_id, student_id, level, notes)
- `report_card_comments` — (id, teacher_id, student_id, term, subject, comment, char_limit, updated_at)

---

## CODEBASE STRUCTURE
The index.html is built from 8 part files assembled on disk at `/home/claude/build/`:

| File | Contents |
|------|----------|
| `part1.html` | HTML shell, CSS, all page markup |
| `part2_constants.js` | Supabase init, EXPECTATIONS object, state vars, BLABELS, link caches |
| `part3_auth.js` | Loading/toast, authFetch, retryAuthFetch, auth functions, initApp, loadUserData |
| `part4_generate.js` | Workflow steps, grade pills, generate(), prompt building with strand guidance |
| `part5_render.js` | buildEditBlocks, renderMD, renderRubric, renderWS, renderAnswerKey, downloadPDF, getStudentLink |
| `part6_slides.js` | generateSlideData, presentSlides (blob URL), openHTMLPresenter, Google Slides export |
| `part7_roster_assess.js` | renderR, addStu, renderAssGrid, autoMarkAll, autoMarkStudent, saveOneStu, renderTracker, renderExpInAssess, toggleTrackerRow |
| `part8b_lessons_rc.js` | renderLessonsList, loadLesson, generateReportCards, generateOneComment, renderCommentCard, saveRCComment, loadAccountPage |
| `part8_tour_boot.js` | Tour steps, initApp() call |

### Rebuild command (run from /home/claude/build/):
```bash
cat part2_constants.js part3_auth.js part4_generate.js part5_render.js part6_slides.js part7_roster_assess.js part8b_lessons_rc.js part8_tour_boot.js > script_final.js
{ cat part1.html; echo '<script>'; cat script_final.js; printf '\n</script>\n</body>\n</html>\n'; } > index_final.html
# Syntax check:
node -e "const fs=require('fs'),c=fs.readFileSync('index_final.html','utf8'),s=c.indexOf('<script>\n')+9,e=c.lastIndexOf('</script>');fs.writeFileSync('/tmp/fc.js',c.slice(s,e));"
node --check /tmp/fc.js
```

---

## CRITICAL RULES

### ⛔ NO FULL REBUILDS
**Never rewrite the whole file from scratch.** The rebuild from v4→v5 cost a full day of regressions. Always make surgical edits to the specific part file, then reassemble with the build command above.

### SURGICAL EDIT WORKFLOW
1. Edit only the affected part file
2. Rebuild with the cat command above
3. Run node --check to validate syntax
4. Copy to outputs and deploy

### OTHER CRITICAL GOTCHAS
- **Supabase init:** Always `const { createClient } = supabase; const db = createClient(...)` — never `supabase.createClient()`
- **Supabase key gets rotated** — always verify against Supabase dashboard → Settings → API if login fails
- **Two `index.html` files is intentional** — `public/index.html` = landing, `public/app/index.html` = tool
- **vercel.json uses `rewrites` not `routes`** — `routes` is legacy
- **Supabase query builder:** MUST reassign `q = q.eq(...)` not `q.eq(...)`
- **Student names anonymized** before Anthropic API
- **Worksheet URL:** Student links use `/worksheet.html?id=` (NOT `/ws?id=`)
- **Combined worksheet payload:** Uses `grades_content` key (not `worksheets`) — must match what `worksheet.html` reads
- **Template literal escaping:** Never put complex onclick with escaped quotes inside template literals — extract to named functions
- **`downloadPDF`** contains `</body></html>` inside a template literal — don't break it
- `teacherai_tour_done` localStorage — guided tour
- `teacherai_tracker_view` localStorage — grade vs expectations tracker view

## DEPLOYMENT
1. Download `index.html` from Claude outputs
2. GitHub → `public/app/` → **Add file → Upload files** (NOT the edit/paste method — paste silently truncates large files)
3. Wait for Vercel deploy (~30-45s) — ignore red ✗ on GitHub, check Vercel dashboard directly
4. Hard refresh (Cmd+Shift+R) on teacherai.ca/app
5. Check footer version number to confirm deploy

---

## FEATURES LIVE (v5.0)

### Core Flow
- Class Roster — create classes, add/edit students (grade, notes, IEP all editable inline by clicking student card)
- Plan — generate lessons (plan + differentiated worksheets + reading + rubric + slides)
- Review & Edit — horizontal pill nav, edit/reset/copy/PDF per block, PDF in header button row
- Assess — level tap (1− L1 1+ grouped buttons), auto-mark submitted worksheets, observation notes
- Trackers — Grade Tracker (expandable rows → per-assessment breakdown) + Expectations Tracker (expandable chips → which lessons covered each expectation)
- Report Cards — Ontario-style comments, board-agnostic char limit, save with delete+insert fallback
- My Lessons — search, sort, bulk delete, 📋 Open to reload
- Units — tab scaffold exists (Coming Soon UI), ready to wire up

### Auth & UI
- Email/password + Google OAuth login
- Guided tour (5 steps, fires on first login via localStorage flag)
- Onboarding banner (dismissed after first lesson saved)

### Lesson Generation
- Ontario 2023 Language curriculum (EXPECTATIONS object in part2_constants.js)
- `EXPECTATIONS.math = []` stub ready — infrastructure in place, data not yet filled
- Topic-aware strand guidance: writing topics → Strand D, reading → Strand C, oral → Strand B
- Split-grade support (separate worksheets per grade, grade label on each expectation chip)
- IEP/ELL aware, student names anonymized
- Expectations deduplicated by code before display

### Slides
- HTML presenter (▶ Present) — blob URL approach, DOMContentLoaded fix for blank page bug
- Save Slides (⬇ downloads .html)
- Google Slides export (🔗 requires OAuth)

### Assessment
- Grouped level buttons: `1− L1 1+` | `2− L2 2+` | `3− L3 3+` | `4− L4 4+`
- Auto-mark shows question text (not just q1:, q4: keys)
- Observation note shown in AI suggestion box — teacher clicks "Copy to notes" explicitly
- Auto-mark button next to "View submitted work"
- Per-grade worksheet link caching (`_gradeLinksCache`) — no duplicate DB records on repeat clicks

### Tracker
- Grade Tracker: level labels with +/− (L3+, L2−) not decimals
- Class avg shows level label not decimal
- Expandable student rows → per-assessment task breakdown with colored level badges
- Assessment rows clickable → jumps to that session in Assess tab
- Expectations Tracker: chips expandable → shows which lessons covered each expectation

### Worksheet (worksheet.html)
- Name matching: if multiple roster names similar → shows "Which one are you?" with buttons for each
- If single match → "Did you mean X?" as before
- Grade picker for split-class combined links (reads `grades_content` from payload)

---

## WHAT'S NOT BUILT YET (priority order)

1. **Math curriculum expectations** — `EXPECTATIONS.math = []` stub is in part2_constants.js, infrastructure ready. Fill with ~200 Ontario Math 2020 expectations. **This is the biggest competitive moat.**
2. **Stripe payments** — free tier (5 lessons/month), paid ($12-15/month). Unit plans = paid-only feature.
3. **Unit plan generation** — tab scaffold exists in part1.html and CSS, needs generation logic + "expand to full lesson" button
4. **Science/Social Studies** — same infrastructure as math, just add to EXPECTATIONS object
5. **Mobile-first polish** — partial

---

## LANDING PAGE
- Warm cream design, Fraunces serif, sage green CTAs
- Hero: "Your next lesson, already planned."
- Key messages: instant generation, Ontario curriculum, split grades
- Links to /app for sign up/sign in
- File: `public/index.html` (separate from app)- `lessons` — (id, teacher_id, topic, grades[], subject, content jsonb, expectations jsonb, class_id)
- `worksheets` — (id, teacher_id, lesson_id, topic, grades[], content, roster jsonb, class_id)
- `worksheet_submissions` — (id, worksheet_id, student_name, student_id, responses jsonb, submitted_at)
- `assessment_sessions` — (id, teacher_id, task, subject, strand, grades[], date, class_id, expectations jsonb)
- `student_marks` — (id, session_id, student_id, level, notes)
- `report_card_comments` — (id, teacher_id, student_id, term, subject, comment, char_limit, updated_at) UNIQUE(teacher_id, student_id, term, subject)

**SQL migrations (run in Supabase SQL editor if not done):**
- `add-class-id-to-lessons.sql`
- `create-report-card-comments-table.sql`

## CURRENT UI (v3.8 Generate form)
1. Class · Subject · Duration — compact top row
2. Grade pills — K · Gr.1–Gr.8, tap multiple for split class
3. "What are you teaching?" — big hero input
4. What to Generate — chip checkboxes
5. ⚙️ More options — collapsible, localStorage state, contains Strands (A→B→C→D, all unchecked) + Target Expectations

## KEY GOTCHAS
- Supabase query builder: MUST reassign `q = q.eq(...)` not `q.eq(...)`
- `authFetch()` refreshes JWT if expiring within 60s
- Duration labels: "1 lesson" / "3 lessons" / "5 lessons" → normalised in prompt
- Strands use Ontario 2023 names: A=Literacy Connections, B=Foundations of Language, C=Comprehension, D=Composition
- Student names anonymized before Anthropic API (never sends real names)
- `teacherai_moreopts` localStorage for More Options state
- `teacherai_welcomed` localStorage for onboarding dismissed state
- Footer version number confirms correct deploy

## DEPLOYMENT
1. Download index.html from Claude outputs
2. GitHub → public/ → Add file → Upload files
3. Wait for green checkmark (~30-45s)
4. Hard refresh (Cmd+Shift+R)
5. Check footer shows v3.8

## FEATURES LIVE
- Full lesson generation (lesson plan, worksheet, reading resource, rubric, differentiation)
- Grade pills for single/split grade selection
- Ontario 2023 curriculum expectations (96 embedded, strands A/B/C/D)
- Target expectations: hard requirement + "focus only" mode
- Student worksheet delivery (combined link for split, per-grade links)
- Fuzzy name matching on worksheet submission
- Auto-marking of submitted worksheets
- Assessment tab: Level 1-4 per student, observation notes
- Grade tracker with CSV export
- Expectations tracker
- Report Cards: AI-generated Ontario-style comments, auto-save to Supabase, Copy All
- My Lessons: search, bulk delete, reload past lesson
- Google OAuth login
- Password reset
- Account page
- Toast notifications (lesson saved, assessment saved)
- Onboarding banner (2 steps, dismisses after students + first lesson)

## WHAT'S NOT BUILT YET
- Stripe subscription/payments
- Mobile-first polish
- React rewrite
- Math/Science curriculum
- Unit plan generation (duration beyond 5 lessons)
